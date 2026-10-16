-- Enforce employee announcement targeting through existing tenant and
-- department relationships. Location targeting remains hidden from employees
-- until the schema has an approved normalized employee/location relationship.
BEGIN;

DROP POLICY IF EXISTS hris_notices_membership_guard ON public.notices;
CREATE POLICY hris_notices_membership_guard
  ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.has_tenant_permission(tenant_id, 'notices.view')
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
