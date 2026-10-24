-- Policy/catalog and existing-user preservation evidence; aggregate only.
-- A global role grant counts only when its administrator has an active,
-- role-backed tenant membership. The sole platform Super Admin exception is
-- also pinned to an active Synesis tenant membership.
-- Safe to execute on the hosted project before and after an approved change.
WITH admin_projection AS (
  SELECT au.user_id, au.active,
    (u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())) AS confirmed,
    CASE WHEN au.is_super_admin IS TRUE THEN EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id=tm.tenant_id AND t.is_active IS TRUE
      JOIN public.roles r ON r.id=tm.role AND r.active IS TRUE
      WHERE tm.user_id=au.user_id
        AND tm.tenant_id=public.synesis_tenant_id()
        AND lower(tm.status)='active'
    ) ELSE EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id=tm.tenant_id AND t.is_active IS TRUE
      JOIN public.roles r ON r.id=tm.role AND r.active IS TRUE
      JOIN public.role_permissions rp ON rp.role_id=r.id
      WHERE tm.user_id=au.user_id AND lower(tm.status)='active'
        AND rp.permission_id IN ('notices.view','notices.manage')
    ) END AS can_read_notices,
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=au.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.user_id=au.user_id AND lower(tm.status)='active'
      ) AS unassigned_global_admin
  FROM public.admin_users au
  JOIN auth.users u ON u.id=au.user_id
)
SELECT
  (SELECT count(*) FROM public.tenants WHERE is_active) AS active_tenants,
  (SELECT count(*) FROM public.tenant_memberships) AS member_rows,
  (SELECT count(*) FROM admin_projection WHERE active AND confirmed) AS active_confirmed_admins,
  (SELECT count(*) FROM admin_projection
   WHERE active AND confirmed AND can_read_notices) AS projected_preserved_admins,
  (SELECT count(*) FROM admin_projection
   WHERE active AND confirmed AND unassigned_global_admin) AS unassigned_global_admins,
  (SELECT count(*) FROM public.notices WHERE active) AS active_notices,
  (SELECT count(*) FROM public.notices
   WHERE active AND tenant_id <> public.synesis_tenant_id()) AS active_notices_other_tenants,
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', polname, 'select_policy', polcmd = 'r',
      'restrictive', NOT polpermissive, 'using', pg_get_expr(polqual, polrelid))
     ORDER BY polname), '[]'::jsonb)
   FROM pg_policy WHERE polrelid = 'public.notices'::regclass) AS notice_policies;
