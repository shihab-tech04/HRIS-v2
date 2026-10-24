-- Read-only proof of the October 22 authentication-rebind topology.
-- No UUIDs, emails, sessions or private data exposed to the output.
WITH facts AS (
SELECT
 (SELECT count(*) FROM public.tenants) AS tenants,
 (SELECT count(*) FROM public.tenants WHERE slug='synesis-it' AND is_active) AS active_synesis_tenants,
 (SELECT count(*) FROM public.tenant_memberships) AS memberships,
 (SELECT count(*) FROM public.admin_users) AS admins,
 (SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin) AS active_superadmins,
 (SELECT count(*) FROM auth.users u JOIN public.admin_users a ON a.user_id=u.id
    WHERE a.active AND a.is_super_admin AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) AS eligible_auth_superadmins,
 (SELECT count(*) FROM public.roles WHERE id='hr_admin' AND active AND NOT is_system) AS existing_hr_roles,
 (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin' AND permission_id='organization.manage') AS org_manage_grants,
 (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin') AS role_permission_count,
 (SELECT count(*) FROM public.admin_audit_logs WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED') AS prior_bootstrap_audits,
 (SELECT count(*) FROM public.admin_audit_logs WHERE action='super_admin.rebound_to_new_auth') AS auth_rebound_audits,
 (SELECT count(*) FROM public.admin_audit_logs WHERE action='PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND') AS existing_repair_audits,
 EXISTS (
    SELECT 1 FROM public.admin_audit_logs h
    JOIN public.tenants t ON t.id::text=h.target_id
    CROSS JOIN public.admin_users a
    WHERE h.action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED'
      AND t.slug='synesis-it' AND a.active AND a.is_super_admin
      AND h.details->>'source'='20261019_minimal_hr_admin_bootstrap'
      AND h.details->>'role'='hr_admin'
      AND h.details->>'user_id' IS DISTINCT FROM a.user_id::text
 ) AS prior_audit_user_differs_from_current_superadmin,
 EXISTS (
   SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
     AND p.tablename='tenant_memberships'
     AND p.policyname='hris_first_admin_platform_guard'
     AND p.permissive='RESTRICTIVE' AND p.cmd='INSERT'
     AND p.with_check LIKE '%hris_can_bootstrap_tenant_membership%'
 ) AS restrictive_bootstrap_rls_guard,
 EXISTS (
   SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
   WHERE n.nspname='public' AND f.proname='hris_can_bootstrap_tenant_membership'
     AND f.pronargs=0 AND pg_get_functiondef(f.oid) LIKE '%banned_until%'
     AND pg_get_functiondef(f.oid) LIKE '%role_permissions%'
 ) AS hardened_bootstrap_helper
)
SELECT facts.*,
 CASE
   WHEN tenants<>1 OR active_synesis_tenants<>1 OR admins<>1
     OR active_superadmins<>1 OR eligible_auth_superadmins<>1 THEN 'BLOCKED_TOPOLOGY_OR_AUTH'
   WHEN memberships<>0 THEN 'BLOCKED_MEMBERSHIP_ALREADY_PRESENT'
   WHEN existing_hr_roles<>1 OR org_manage_grants<>1 OR role_permission_count<>1 THEN 'BLOCKED_MINIMAL_ROLE_OR_GRANTS'
   WHEN prior_bootstrap_audits<>1 OR auth_rebound_audits<>1 OR existing_repair_audits<>0
     OR NOT prior_audit_user_differs_from_current_superadmin THEN 'BLOCKED_AUDIT_REBOUND_EVIDENCE'
   WHEN NOT restrictive_bootstrap_rls_guard OR NOT hardened_bootstrap_helper THEN 'BLOCKED_SECURITY_GUARD'
   ELSE 'READY_FOR_DISPOSABLE_TEST_NOT_HOSTED_APPROVAL'
 END AS structural_gate
FROM facts;
