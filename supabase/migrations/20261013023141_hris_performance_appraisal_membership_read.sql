-- Allow performance appraisal reads only through a linked employee, an
-- explicitly assigned in-tenant reviewer, or an authorized tenant role.
-- This release-candidate migration must pass isolated Auth/RLS tests before
-- it is considered for any hosted database.
BEGIN;

DROP POLICY IF EXISTS hris_performance_appraisals_membership_read
  ON public.performance_appraisals;
CREATE POLICY hris_performance_appraisals_membership_read
  ON public.performance_appraisals AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR (
      reviewer_employee_id = public.hris_own_employee_for_tenant(tenant_id)
      AND public.hris_is_active_tenant_member(tenant_id)
    )
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

DROP POLICY IF EXISTS hris_performance_appraisals_membership_guard
  ON public.performance_appraisals;
CREATE POLICY hris_performance_appraisals_membership_guard
  ON public.performance_appraisals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      employee_id = public.hris_own_employee_for_tenant(tenant_id)
      OR (
        reviewer_employee_id = public.hris_own_employee_for_tenant(tenant_id)
        AND public.hris_is_active_tenant_member(tenant_id)
      )
      OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
      OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
    )
  );

-- Personal review pages also need the cycle label/date for rows the employee
-- or assigned reviewer is already allowed to see.
DROP POLICY IF EXISTS hris_performance_cycles_membership_read
  ON public.performance_cycles;
CREATE POLICY hris_performance_cycles_membership_read
  ON public.performance_cycles AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
    OR EXISTS (
      SELECT 1
      FROM public.performance_appraisals appraisal
      WHERE appraisal.cycle_id = performance_cycles.id
        AND appraisal.tenant_id = performance_cycles.tenant_id
        AND (
          appraisal.employee_id = public.hris_own_employee_for_tenant(performance_cycles.tenant_id)
          OR (
            appraisal.reviewer_employee_id = public.hris_own_employee_for_tenant(performance_cycles.tenant_id)
            AND public.hris_is_active_tenant_member(performance_cycles.tenant_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS hris_performance_cycles_membership_guard
  ON public.performance_cycles;
CREATE POLICY hris_performance_cycles_membership_guard
  ON public.performance_cycles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
      OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
      OR EXISTS (
        SELECT 1
        FROM public.performance_appraisals appraisal
        WHERE appraisal.cycle_id = performance_cycles.id
          AND appraisal.tenant_id = performance_cycles.tenant_id
          AND (
            appraisal.employee_id = public.hris_own_employee_for_tenant(performance_cycles.tenant_id)
            OR (
              appraisal.reviewer_employee_id = public.hris_own_employee_for_tenant(performance_cycles.tenant_id)
              AND public.hris_is_active_tenant_member(performance_cycles.tenant_id)
            )
          )
      )
    )
  );

-- Keep unreviewed scores and feedback off the direct table surface. A later
-- approved review workflow can expose role-specific fields through its own
-- narrow endpoint once its acceptance rules are verified.
REVOKE SELECT ON TABLE public.performance_appraisals FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, tenant_id, cycle_id, employee_id, reviewer_employee_id, status, created_at, updated_at
) ON TABLE public.performance_appraisals TO authenticated;

COMMIT;
