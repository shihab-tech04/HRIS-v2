-- WS02 Phase 03 recovery: existing Super Admin was rebound to a new Auth user
-- after the original Phase 03 tenant-admin bootstrap audit was recorded.
-- Verified hosted evidence (2026-10-24): zero memberships; the existing active
-- hr_admin role, its organization.manage grant, and the hardened restrictive
-- bootstrap guard are already present. Do NOT rerun role-creation SQL.
--
-- STAGING ONLY. DO NOT execute on hosted replacement until:
-- (1) independently restored encrypted replacement DB backup is certified;
-- (2) exact-source review and Auth-backed disposable test are PASS;
-- (3) WS05 authorizes the controlled hosted change.
-- Replacement xfuxnljfrgvusbrpvxpa ONLY. Original oslgwxaqfbteqtwqvdzs IMMUTABLE.
-- No new users, tenant roles, grants, RLS policies, or permission changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SELECT pg_catalog.pg_advisory_xact_lock(20261019, 3);

DO $guard$
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
    OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                    WHERE version='20261022142012')
  THEN RAISE EXCEPTION 'STOP: replacement PostgreSQL 17 baseline mismatch' USING ERRCODE='55000';
  END IF;

  IF (SELECT count(*) FROM public.tenants) <> 1
    OR (SELECT count(*) FROM public.tenants WHERE slug='synesis-it' AND is_active) <> 1
    OR (SELECT count(*) FROM public.tenant_memberships) <> 0
    OR (SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin) <> 1
    OR (SELECT count(*) FROM public.admin_users) <> 1
    OR (SELECT count(*) FROM auth.users u JOIN public.admin_users a ON a.user_id=u.id
        WHERE a.active AND a.is_super_admin AND u.email_confirmed_at IS NOT NULL
          AND u.deleted_at IS NULL
          AND (u.banned_until IS NULL OR u.banned_until<=now())) <> 1
  THEN RAISE EXCEPTION 'STOP: tenant, admin or Auth rebound topology mismatch' USING ERRCODE='55000';
  END IF;

  IF (SELECT count(*) FROM public.roles
        WHERE id='hr_admin' AND active AND NOT is_system) <> 1
    OR (SELECT count(*) FROM public.role_permissions
        WHERE role_id='hr_admin' AND permission_id='organization.manage') <> 1
    OR (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin') <> 1
  THEN RAISE EXCEPTION 'STOP: preinstalled tenant HR admin role/grant differs from approved minimum' USING ERRCODE='55000';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
      WHERE p.schemaname='public' AND p.tablename='tenant_memberships'
        AND p.policyname='hris_first_admin_platform_guard'
        AND p.permissive='RESTRICTIVE' AND p.cmd='INSERT'
        AND p.with_check LIKE '%hris_can_bootstrap_tenant_membership%'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc f
      JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
      WHERE n.nspname='public' AND f.proname='hris_can_bootstrap_tenant_membership'
        AND f.pronargs=0
        AND pg_get_functiondef(f.oid) LIKE '%role_permissions%'
        AND pg_get_functiondef(f.oid) LIKE '%organization.manage%'
        AND pg_get_functiondef(f.oid) LIKE '%auth.users%'
        AND pg_get_functiondef(f.oid) LIKE '%deleted_at%'
        AND pg_get_functiondef(f.oid) LIKE '%banned_until%'
    )
  THEN RAISE EXCEPTION 'STOP: restrictive membership RLS or Auth hardening missing' USING ERRCODE='55000';
  END IF;

  IF (SELECT count(*) FROM public.admin_audit_logs
        WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED') <> 1
    OR (SELECT count(*) FROM public.admin_audit_logs
        WHERE action='super_admin.rebound_to_new_auth') <> 1
    OR EXISTS (SELECT 1 FROM public.admin_audit_logs
        WHERE action='PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND')
    OR NOT EXISTS (
      SELECT 1 FROM public.admin_audit_logs h
      JOIN public.tenants t ON t.id::text=h.target_id
      CROSS JOIN public.admin_users a
      WHERE h.action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED'
        AND t.slug='synesis-it' AND a.active AND a.is_super_admin
        AND h.details->>'source'='20261019_minimal_hr_admin_bootstrap'
        AND h.details->>'role'='hr_admin'
        AND h.details->>'user_id' IS DISTINCT FROM a.user_id::text
    )
  THEN RAISE EXCEPTION 'STOP: prior membership audit and later Auth rebound not independently proven' USING ERRCODE='55000';
  END IF;
END
$guard$;

-- The only tenant/role state change: restore the existing authorized Super
-- Admin's missing membership, using existing role, without provisioning users.
INSERT INTO public.tenant_memberships (tenant_id,user_id,role,status)
SELECT t.id,a.user_id,'hr_admin','active'
FROM public.tenants t
CROSS JOIN public.admin_users a
JOIN auth.users u ON u.id=a.user_id
WHERE t.slug='synesis-it' AND t.is_active
  AND a.active AND a.is_super_admin
  AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
  AND (u.banned_until IS NULL OR u.banned_until<=now());

-- Distinct recovery audit (never overwrite the original 19 October audit).
-- NULL actor means controlled database migration, not a fabricated human action.
INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
SELECT NULL,'PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND','tenant_memberships',t.id::text,
  jsonb_build_object('role','hr_admin','permission','organization.manage',
    'user_id',a.user_id::text,
    'reason','post_bootstrap_super_admin_auth_rebound',
    'source','20261024_super_admin_membership_rebind')
FROM public.tenants t
JOIN public.tenant_memberships m ON m.tenant_id=t.id
JOIN public.admin_users a ON a.user_id=m.user_id
WHERE t.slug='synesis-it' AND t.is_active
  AND a.active AND a.is_super_admin
  AND m.role='hr_admin' AND m.status='active';

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM public.tenant_memberships) <> 1
    OR (SELECT count(*) FROM public.tenant_memberships m
        JOIN public.tenants t ON t.id=m.tenant_id
        JOIN public.admin_users a ON a.user_id=m.user_id
        JOIN auth.users u ON u.id=m.user_id
        WHERE t.slug='synesis-it' AND t.is_active
          AND m.role='hr_admin' AND m.status='active'
          AND a.active AND a.is_super_admin
          AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
          AND (u.banned_until IS NULL OR u.banned_until<=now())) <> 1
    OR (SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin) <> 1
    OR (SELECT count(*) FROM public.role_permissions
        WHERE role_id='hr_admin' AND permission_id='organization.manage') <> 1
    OR (SELECT count(*) FROM public.admin_audit_logs
        WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED') <> 1
    OR (SELECT count(*) FROM public.admin_audit_logs
        WHERE action='PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND') <> 1
  THEN RAISE EXCEPTION 'STOP: member, Super Admin, minimal grant or recovery audit postflight failed' USING ERRCODE='55000';
  END IF;
END
$postflight$;
COMMIT;
