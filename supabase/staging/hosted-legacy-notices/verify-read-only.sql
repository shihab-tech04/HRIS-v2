-- Policy/catalog and existing-user preservation evidence; aggregate only.
-- Safe to execute on the hosted project before and after an approved change.
WITH admin_projection AS (
  SELECT au.user_id, au.active, (u.email_confirmed_at IS NOT NULL) AS confirmed,
    CASE WHEN au.is_super_admin THEN
      EXISTS (SELECT 1 FROM public.permissions p
              WHERE p.id IN ('notices.view', 'notices.manage'))
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id AND r.active IS TRUE
      JOIN public.role_permissions rp ON rp.role_id = r.id
      WHERE ur.user_id = au.user_id
        AND rp.permission_id IN ('notices.view', 'notices.manage')
    ) END AS can_read_notices
  FROM public.admin_users au
  JOIN auth.users u ON u.id = au.user_id
)
SELECT
  (SELECT count(*) FROM public.tenants WHERE is_active) AS active_tenants,
  (SELECT count(*) FROM public.tenant_memberships) AS member_rows,
  (SELECT count(*) FROM admin_projection WHERE active AND confirmed) AS active_confirmed_admins,
  (SELECT count(*) FROM admin_projection
   WHERE active AND confirmed AND can_read_notices) AS projected_preserved_admins,
  (SELECT count(*) FROM public.notices WHERE active) AS active_notices,
  (SELECT count(*) FROM public.notices
   WHERE active AND tenant_id <> public.synesis_tenant_id()) AS active_notices_other_tenants,
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', polname, 'select_policy', polcmd = 'r',
      'restrictive', NOT polpermissive, 'using', pg_get_expr(polqual, polrelid))
     ORDER BY polname), '[]'::jsonb)
   FROM pg_policy WHERE polrelid = 'public.notices'::regclass) AS notice_policies;
