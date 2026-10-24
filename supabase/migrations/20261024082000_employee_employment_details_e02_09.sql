-- E02-09: Preserve the previously disposable-tested employee employment fields contract.
-- Sourced from historical PR #35; versioned after the replacement hosted migration head.
-- This PR is for WS02 owner review and disposable verification only; do not apply to hosted DB.
BEGIN;

CREATE OR REPLACE FUNCTION public.employee_get_my_employment_info_v1(p_tenant_id uuid)
RETURNS TABLE (
  joining_date date,
  employment_type text,
  department_name text,
  department_code text,
  designation_title text,
  designation_code text,
  manager_name text,
  work_location_name text,
  grade_name text,
  grade_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_employee uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode = '42501';
  END IF;

  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.joining_date,
    NULLIF(btrim(e.employment_type), ''),
    NULLIF(btrim(department.name), ''),
    NULLIF(btrim(department.code), ''),
    NULLIF(btrim(designation.title), ''),
    NULLIF(btrim(designation.code), ''),
    NULLIF(btrim(manager.full_name), ''),
    NULLIF(btrim(work_location.name), ''),
    NULLIF(btrim(grade.name), ''),
    NULLIF(btrim(grade.code), '')
  FROM public.employees AS e
  LEFT JOIN public.designations AS designation
    ON designation.id = e.designation_id
   AND designation.tenant_id = e.tenant_id
  LEFT JOIN public.departments AS department
    ON department.id = COALESCE(e.department_id, designation.department_id)
   AND department.tenant_id = e.tenant_id
  LEFT JOIN public.grades AS grade
    ON grade.id = COALESCE(e.grade_id, designation.grade_id)
   AND grade.tenant_id = e.tenant_id
  LEFT JOIN public.employees AS manager
    ON manager.id = e.reporting_manager_id
   AND manager.tenant_id = e.tenant_id
  LEFT JOIN public.org_locations AS work_location
    ON work_location.id = COALESCE(e.work_location_id, department.location_id)
   AND work_location.tenant_id = e.tenant_id
  WHERE e.id = v_employee
    AND e.tenant_id = p_tenant_id
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.employee_get_my_employment_info_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_get_my_employment_info_v1(uuid) TO authenticated;

COMMIT;
