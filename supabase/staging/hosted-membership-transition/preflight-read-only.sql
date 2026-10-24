-- Phase 03 membership transition safety gate.
-- Read-only aggregate diagnostics; no user identifiers or membership writes.
WITH role_status AS (
  SELECT count(*) FILTER (WHERE id = 'hr_admin' AND active) AS active_hr_admin_roles,
         count(*) FILTER (WHERE id = 'hr_recruiter' AND active) AS active_hr_recruiter_roles,
         count(*) FILTER (WHERE id = 'hris_system_admin' AND active) AS active_system_admin_roles
  FROM public.roles
), role_grants AS (
  SELECT count(*) FILTER (WHERE role_id = 'hr_admin') AS hr_admin_grants,
         count(*) FILTER (WHERE role_id = 'hr_recruiter') AS hr_recruiter_grants,
         count(*) FILTER (WHERE role_id = 'hris_system_admin') AS system_admin_grants
  FROM public.role_permissions
), admin_model AS (
  SELECT count(*) FILTER (WHERE active) AS active_admins,
         count(*) FILTER (WHERE active AND is_super_admin) AS active_super_admins,
         count(*) FILTER (WHERE active AND NOT is_super_admin) AS active_other_admins
  FROM public.admin_users
), membership_rules AS (
  SELECT pg_get_constraintdef(c.oid) AS role_check
  FROM pg_constraint c
  WHERE c.conrelid = 'public.tenant_memberships'::regclass
    AND c.conname = 'tenant_memberships_role_check'
), bootstrap_guard AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.tablename='tenant_memberships'
      AND p.policyname='hris_first_admin_platform_guard'
      AND p.permissive='RESTRICTIVE'
      AND p.cmd='INSERT'
      AND p.with_check LIKE '%hris_can_bootstrap_tenant_membership%'
  ) AS installed,
  EXISTS (
    SELECT 1 FROM pg_proc f
    JOIN pg_namespace ns ON ns.oid=f.pronamespace
    WHERE ns.nspname='public'
      AND f.proname='hris_can_bootstrap_tenant_membership'
      AND f.pronargs=0
      AND pg_get_functiondef(f.oid) LIKE '%role_permissions%'
      AND pg_get_functiondef(f.oid) LIKE '%organization.manage%'
      AND pg_get_functiondef(f.oid) LIKE '%auth.users%'
      AND pg_get_functiondef(f.oid) LIKE '%deleted_at%'
      AND pg_get_functiondef(f.oid) LIKE '%banned_until%'
  ) AS hardened_function
)
SELECT
  (SELECT count(*) FROM public.tenant_memberships) AS current_memberships,
  (SELECT count(*) FROM public.tenants WHERE is_active IS TRUE) AS active_tenants,
  (SELECT role_check FROM membership_rules) AS legacy_membership_role_constraint,
  (SELECT row_to_json(s) FROM role_status s) AS installed_role_status,
  (SELECT row_to_json(g) FROM role_grants g) AS permission_role_grants,
  (SELECT row_to_json(a) FROM admin_model a) AS legacy_admin_status,
  (SELECT installed FROM bootstrap_guard) AS restrictive_bootstrap_guard_installed,
  (SELECT hardened_function FROM bootstrap_guard) AS bootstrap_guard_role_and_auth_hardening_present,
  CASE
    WHEN NOT (SELECT installed FROM bootstrap_guard)
      THEN 'BLOCKED_NO_RESTRICTIVE_BOOTSTRAP_GUARD'
    WHEN NOT (SELECT hardened_function FROM bootstrap_guard)
      THEN 'BLOCKED_BOOTSTRAP_GUARD_ROLE_OR_AUTH_DRIFT'
    ELSE 'PASS_BOOTSTRAP_GUARD_SOURCE_PARITY'
  END AS bootstrap_security_gate,
  CASE
    WHEN (SELECT count(*) FROM public.tenants WHERE is_active IS TRUE) <> 1
      THEN 'BLOCKED_TENANT_TOPOLOGY'
    WHEN EXISTS(SELECT 1 FROM membership_rules)
      AND (SELECT active_hr_admin_roles FROM role_status) = 0
      AND (SELECT active_hr_recruiter_roles FROM role_status) = 0
      THEN 'BLOCKED_ROLE_CONSTRAINT_WITHOUT_REGISTRY_ENTRIES'
    WHEN (SELECT count(*) FROM public.tenant_memberships) = 1
      AND (SELECT active_hr_admin_roles FROM role_status) = 1
      AND (SELECT hr_admin_grants FROM role_grants) = 1
      AND EXISTS (SELECT 1 FROM public.role_permissions
                   WHERE role_id='hr_admin' AND permission_id='organization.manage')
      AND (SELECT installed AND hardened_function FROM bootstrap_guard)
      AND (SELECT count(*) FROM public.tenant_memberships m
           JOIN public.admin_users a ON a.user_id=m.user_id
           JOIN auth.users u ON u.id=m.user_id
           JOIN public.tenants t ON t.id=m.tenant_id
           WHERE t.slug='synesis-it' AND m.role='hr_admin' AND m.status='active'
             AND a.active AND a.is_super_admin
             AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
             AND (u.banned_until IS NULL OR u.banned_until<=now())) = 1
      THEN 'PASS_MINIMAL_ADMIN_TRANSITION'
    WHEN (SELECT count(*) FROM public.tenant_memberships) = 0
      THEN 'BLOCKED_NO_APPROVED_MEMBERSHIP_BACKFILL'
    ELSE 'REVIEW_REQUIRED'
  END AS transition_gate;
