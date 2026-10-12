-- Constrain legacy permissive read policies to the active tenant membership.
-- This is a local release-candidate migration; do not apply to a hosted
-- project until the isolated Auth/RLS suite and release gates pass.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_is_active_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      JOIN public.tenant_memberships m
        ON m.tenant_id = t.id
       AND m.user_id = auth.uid()
       AND lower(m.status) = 'active'
      JOIN public.roles r
        ON r.id = m.role
       AND r.active IS TRUE
      WHERE t.id = p_tenant_id
        AND t.is_active IS TRUE
    )
$function$;

REVOKE ALL ON FUNCTION public.hris_is_active_tenant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_is_active_tenant_member(uuid) TO authenticated, service_role;

-- Preserve authorized reads in tenants other than the legacy Synesis pin.
-- These permissive policies pair with the restrictive guards below.
CREATE POLICY hris_confirmation_reviews_membership_read
  ON public.confirmation_reviews AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

CREATE POLICY hris_designations_membership_read
  ON public.designations AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

CREATE POLICY hris_employee_referrals_membership_read
  ON public.employee_referrals AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    referrer_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'referrals.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'referrals.manage')
  );

CREATE POLICY hris_grades_membership_read
  ON public.grades AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

CREATE POLICY hris_holidays_membership_read
  ON public.holidays AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (active IS TRUE AND public.hris_is_active_tenant_member(tenant_id))
    OR public.hris_admin_can_read_tenant(tenant_id, 'holidays.manage')
  );

CREATE POLICY hris_hr_policies_membership_read
  ON public.hr_policies AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (active IS TRUE AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL)
    OR public.hris_admin_can_read_tenant(tenant_id, 'policies.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'policies.manage')
  );

CREATE POLICY hris_manpower_requisitions_membership_read
  ON public.manpower_requisitions AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'recruitment.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'recruitment.manage')
  );

CREATE POLICY hris_notices_membership_read
  ON public.notices AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (active IS TRUE AND public.hris_is_active_tenant_member(tenant_id))
    OR public.hris_admin_can_read_tenant(tenant_id, 'notices.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'notices.manage')
  );

CREATE POLICY hris_org_locations_membership_read
  ON public.org_locations AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

CREATE POLICY hris_pay_periods_membership_read
  ON public.pay_periods AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'payroll.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.manage')
  );

CREATE POLICY hris_payslips_membership_read
  ON public.payslips AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (employee_id = public.hris_own_employee_for_tenant(tenant_id) AND status = 'released')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.manage')
  );

CREATE POLICY hris_performance_cycles_membership_read
  ON public.performance_cycles AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

CREATE POLICY hris_performance_goals_membership_read
  ON public.performance_goals AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

CREATE POLICY hris_project_performance_reviews_membership_read
  ON public.project_performance_reviews AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR project_manager_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

CREATE POLICY hris_service_requests_membership_read
  ON public.service_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'self_service.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'self_service.manage')
  );

CREATE POLICY hris_shifts_membership_read
  ON public.shifts AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

CREATE POLICY hris_teams_membership_read
  ON public.teams AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

-- A restrictive policy combines with the legacy policies as AND, so a global
-- user_roles grant can no longer bypass the active membership's role.
-- Thirteen tables currently carry anon SELECT grants, but the inspected policy
-- set has no anon SELECT policies. Keep these guards authenticated-only; anon
-- remains denied by the existing default-deny RLS behavior.
DROP POLICY IF EXISTS hris_attendance_corrections_membership_guard ON public.attendance_corrections;
CREATE POLICY hris_attendance_corrections_membership_guard
  ON public.attendance_corrections AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  ));

DROP POLICY IF EXISTS hris_attendance_records_membership_guard ON public.attendance_records;
CREATE POLICY hris_attendance_records_membership_guard
  ON public.attendance_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  ));

DROP POLICY IF EXISTS hris_confirmation_reviews_membership_guard ON public.confirmation_reviews;
CREATE POLICY hris_confirmation_reviews_membership_guard
  ON public.confirmation_reviews AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  ));

DROP POLICY IF EXISTS hris_designations_membership_guard ON public.designations;
CREATE POLICY hris_designations_membership_guard
  ON public.designations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

DROP POLICY IF EXISTS hris_employee_leave_balances_membership_guard ON public.employee_leave_balances;
CREATE POLICY hris_employee_leave_balances_membership_guard
  ON public.employee_leave_balances AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  ));

DROP POLICY IF EXISTS hris_employee_referrals_membership_guard ON public.employee_referrals;
CREATE POLICY hris_employee_referrals_membership_guard
  ON public.employee_referrals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    referrer_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'referrals.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'referrals.manage')
  ));

DROP POLICY IF EXISTS hris_grades_membership_guard ON public.grades;
CREATE POLICY hris_grades_membership_guard
  ON public.grades AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

DROP POLICY IF EXISTS hris_holidays_membership_guard ON public.holidays;
CREATE POLICY hris_holidays_membership_guard
  ON public.holidays AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    (active IS TRUE AND public.hris_is_active_tenant_member(tenant_id))
    OR public.hris_admin_can_read_tenant(tenant_id, 'holidays.manage')
  ));

DROP POLICY IF EXISTS hris_hr_policies_membership_guard ON public.hr_policies;
CREATE POLICY hris_hr_policies_membership_guard
  ON public.hr_policies AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    (active IS TRUE AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL)
    OR public.hris_admin_can_read_tenant(tenant_id, 'policies.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'policies.manage')
  ));

DROP POLICY IF EXISTS hris_manpower_requisitions_membership_guard ON public.manpower_requisitions;
CREATE POLICY hris_manpower_requisitions_membership_guard
  ON public.manpower_requisitions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'recruitment.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'recruitment.manage')
  ));

DROP POLICY IF EXISTS hris_notices_membership_guard ON public.notices;
CREATE POLICY hris_notices_membership_guard
  ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    (active IS TRUE AND public.hris_is_active_tenant_member(tenant_id))
    OR public.hris_admin_can_read_tenant(tenant_id, 'notices.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'notices.manage')
  ));

DROP POLICY IF EXISTS hris_org_locations_membership_guard ON public.org_locations;
CREATE POLICY hris_org_locations_membership_guard
  ON public.org_locations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

DROP POLICY IF EXISTS hris_pay_periods_membership_guard ON public.pay_periods;
CREATE POLICY hris_pay_periods_membership_guard
  ON public.pay_periods AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'payroll.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.manage')
  ));

DROP POLICY IF EXISTS hris_payslips_membership_guard ON public.payslips;
CREATE POLICY hris_payslips_membership_guard
  ON public.payslips AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    (employee_id = public.hris_own_employee_for_tenant(tenant_id) AND status = 'released')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.manage')
  ));

DROP POLICY IF EXISTS hris_performance_cycles_membership_guard ON public.performance_cycles;
CREATE POLICY hris_performance_cycles_membership_guard
  ON public.performance_cycles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  ));

DROP POLICY IF EXISTS hris_performance_goals_membership_guard ON public.performance_goals;
CREATE POLICY hris_performance_goals_membership_guard
  ON public.performance_goals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  ));

DROP POLICY IF EXISTS hris_project_performance_reviews_membership_guard ON public.project_performance_reviews;
CREATE POLICY hris_project_performance_reviews_membership_guard
  ON public.project_performance_reviews AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR project_manager_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  ));

DROP POLICY IF EXISTS hris_service_requests_membership_guard ON public.service_requests;
CREATE POLICY hris_service_requests_membership_guard
  ON public.service_requests AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'self_service.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'self_service.manage')
  ));

DROP POLICY IF EXISTS hris_shifts_membership_guard ON public.shifts;
CREATE POLICY hris_shifts_membership_guard
  ON public.shifts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

DROP POLICY IF EXISTS hris_teams_membership_guard ON public.teams;
CREATE POLICY hris_teams_membership_guard
  ON public.teams AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

COMMIT;
