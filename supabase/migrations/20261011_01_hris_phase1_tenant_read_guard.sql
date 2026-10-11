-- HRIS-v2 Phase 1: narrowly scoped SELECT protections for legacy Synesis.
-- Source: verified hrmis-saas schema and existing policy/function definitions, 2026-10-11.
-- This does NOT implement tenant-scoped role grants for other SaaS tenants.
-- It leaves original permissive policies and all DML policies untouched.
-- Do not run against production until impact review and isolated test evidence.
--
-- Legacy roles are global. Prevent any legacy global admin permission from
-- reading other tenants until real tenant-scoped permissions are introduced.
CREATE OR REPLACE FUNCTION public.hris_own_employee_for_tenant(p_tenant_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.user_id = auth.uid()
    AND e.tenant_id = p_tenant_id
    AND e.employment_status NOT IN ('resigned', 'terminated')
    AND public.is_live_session()
  ORDER BY e.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.hris_admin_can_read_tenant(
  p_tenant_id uuid, p_permission_id text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
  SELECT
    p_tenant_id IS NOT NULL
    AND p_tenant_id = public.synesis_tenant_id()
    AND public.is_active_admin()
    AND public.has_permission(p_permission_id)
$$;

REVOKE ALL ON FUNCTION public.hris_own_employee_for_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hris_admin_can_read_tenant(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hris_own_employee_for_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_admin_can_read_tenant(uuid, text) TO authenticated;

-- Existing permissive admin policy remains. A restrictive policy is ANDed
-- with the OR of original permissive policy and own-row policy.
CREATE POLICY hris_employees_own_read ON public.employees
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  id = public.hris_own_employee_for_tenant(tenant_id)
);

CREATE POLICY hris_employees_tenant_read_guard ON public.employees
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  id = public.hris_own_employee_for_tenant(tenant_id)
  OR public.hris_admin_can_read_tenant(tenant_id, 'employees.view')
  OR public.hris_admin_can_read_tenant(tenant_id, 'employees.manage')
);

CREATE POLICY hris_departments_tenant_read_guard ON public.departments
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
  OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
);

CREATE POLICY hris_leave_requests_own_read ON public.leave_requests
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  employee_id = public.hris_own_employee_for_tenant(tenant_id)
);

CREATE POLICY hris_leave_requests_tenant_read_guard ON public.leave_requests
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  employee_id = public.hris_own_employee_for_tenant(tenant_id)
  OR public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
  OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
);

CREATE POLICY hris_leave_types_employee_read ON public.leave_types
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
);

CREATE POLICY hris_leave_types_tenant_read_guard ON public.leave_types
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
  OR public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
  OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
);
