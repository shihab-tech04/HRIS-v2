-- Manual rollback ONLY after reviewing the actual migration state.
-- Restores original SELECT policies but also removes additional tenant guards.
-- No original policy/function is altered by the forward migration.
DROP POLICY IF EXISTS hris_leave_types_tenant_read_guard ON public.leave_types;
DROP POLICY IF EXISTS hris_leave_types_employee_read ON public.leave_types;
DROP POLICY IF EXISTS hris_leave_requests_tenant_read_guard ON public.leave_requests;
DROP POLICY IF EXISTS hris_leave_requests_own_read ON public.leave_requests;
DROP POLICY IF EXISTS hris_departments_tenant_read_guard ON public.departments;
DROP POLICY IF EXISTS hris_employees_tenant_read_guard ON public.employees;
DROP POLICY IF EXISTS hris_employees_own_read ON public.employees;
DROP FUNCTION IF EXISTS public.hris_admin_can_read_tenant(uuid, text);
DROP FUNCTION IF EXISTS public.hris_own_employee_for_tenant(uuid);
