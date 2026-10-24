-- Enforce employee announcement targeting through existing tenant and
-- department relationships. Location targeting remains hidden from employees
-- until the schema has an approved normalized employee/location relationship.
BEGIN;

-- Platform Super Admin notice access is anchored to an explicit active tenant
-- membership. Global admin status or global role grants alone never satisfy it.
CREATE OR REPLACE FUNCTION public.hris_notices_super_admin_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.admin_users au
      JOIN auth.users u ON u.id = au.user_id
      WHERE au.user_id = auth.uid()
        AND au.active IS TRUE
        AND au.is_super_admin IS TRUE
        AND u.email_confirmed_at IS NOT NULL
        AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
    )
    AND EXISTS (
      SELECT 1
      FROM public.tenant_memberships m
      JOIN public.tenants t ON t.id = m.tenant_id AND t.is_active IS TRUE
      JOIN public.roles r ON r.id = m.role AND r.active IS TRUE
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = p_tenant_id
        AND lower(m.status) = 'active'
    )
$function$;
REVOKE ALL ON FUNCTION public.hris_notices_super_admin_tenant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_notices_super_admin_tenant_member(uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS hris_notices_membership_guard ON public.notices;
CREATE POLICY hris_notices_membership_guard
  ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.hris_notices_super_admin_tenant_member(tenant_id)
      OR public.has_tenant_permission(tenant_id, 'notices.view')
      OR public.has_tenant_permission(tenant_id, 'notices.manage')
      OR (
        active IS TRUE
        AND EXISTS (
          SELECT 1 FROM public.tenants t
          WHERE t.id=notices.tenant_id AND t.is_active IS TRUE
        )
        AND (
          (
            audience_type = 'all'
            AND (
              public.hris_is_active_tenant_member(tenant_id)
              OR public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
            )
          )
          OR (
            audience_type = 'department'
            AND audience_id IS NOT NULL
            AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.employees e
              WHERE e.id = public.hris_own_employee_for_tenant(notices.tenant_id)
                AND e.tenant_id = notices.tenant_id
                AND e.department_id = notices.audience_id
            )
          )
        )
      )
    )
  );

COMMIT;
