-- Safe aggregate verification for the controlled Phase 03 backfill.
SELECT
 (SELECT count(*) FROM public.roles WHERE id='hr_admin' AND active AND NOT is_system) AS configurable_admin_roles,
 (SELECT jsonb_agg(permission_id ORDER BY permission_id) FROM public.role_permissions WHERE role_id='hr_admin') AS admin_permissions,
 (SELECT count(*) FROM public.role_permissions WHERE role_id='hris_system_admin') AS legacy_system_admin_grants,
 (SELECT count(*) FROM public.admin_users WHERE active AND NOT is_super_admin) AS unchanged_other_admins,
 (SELECT count(*) FROM public.tenant_memberships) AS total_memberships,
 (SELECT count(*) FROM public.tenant_memberships m
   JOIN public.tenants t ON t.id=m.tenant_id
   JOIN public.admin_users a ON a.user_id=m.user_id
   WHERE t.slug='synesis-it' AND m.role='hr_admin' AND m.status='active'
     AND a.active AND a.is_super_admin) AS eligible_member_count,
 (SELECT count(*) FROM public.admin_audit_logs
   WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED') AS migration_audit_records,
 EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='hris_can_bootstrap_tenant_membership'
     AND p.pronargs=0 AND pg_get_functiondef(p.oid) LIKE '%banned_until%'
     AND pg_get_functiondef(p.oid) LIKE '%role_permissions%') AS hardened_bootstrap;
