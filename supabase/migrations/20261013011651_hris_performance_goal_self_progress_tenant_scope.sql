-- Restrict employee self-service goal updates to their own tenant-bound
-- progress value. This release-candidate migration is applied only to the
-- disposable local Auth/RLS test database until the final release gates pass.
BEGIN;

DROP POLICY IF EXISTS hris_performance_goals_self_progress_update
  ON public.performance_goals;
CREATE POLICY hris_performance_goals_self_progress_update
  ON public.performance_goals AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
  );

DROP POLICY IF EXISTS hris_performance_goals_membership_update_guard
  ON public.performance_goals;
CREATE POLICY hris_performance_goals_membership_update_guard
  ON public.performance_goals AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
  );

REVOKE UPDATE ON TABLE public.performance_goals FROM PUBLIC, anon, authenticated;
GRANT UPDATE (current_progress) ON TABLE public.performance_goals TO authenticated;

COMMIT;
