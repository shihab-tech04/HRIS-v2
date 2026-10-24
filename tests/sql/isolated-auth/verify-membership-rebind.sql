-- Disposable PostgreSQL 17 acceptance, synthetic records only.
DO $post$
BEGIN
 IF (SELECT count(*) FROM public.tenant_memberships) <> 1
   OR (SELECT count(*) FROM public.tenant_memberships m
       JOIN public.admin_users a ON a.user_id=m.user_id
       JOIN auth.users u ON u.id=m.user_id
       JOIN public.tenants t ON t.id=m.tenant_id
       WHERE a.active AND a.is_super_admin AND m.role='hr_admin' AND m.status='active'
         AND t.slug='synesis-it' AND t.is_active AND u.deleted_at IS NULL) <> 1
   OR (SELECT count(*) FROM public.admin_audit_logs WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED') <> 1
   OR (SELECT count(*) FROM public.admin_audit_logs WHERE action='PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND') <> 1
   OR (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin') <> 1
   OR (SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin) <> 1
 THEN RAISE EXCEPTION 'Synthetic controlled membership repair failed'; END IF;
END $post$;
SELECT 'PASS_SYNTHETIC_AUTH_REBIND_SINGLE_MEMBERSHIP_PG17' AS acceptance;
