-- Tenant-scoped, read-only roster access. employee_shift_assignments has no
-- authenticated SELECT policy, so the live workspace must use this checked RPC.
CREATE OR REPLACE FUNCTION public.hris_get_tenant_shift_roster_data(
  p_tenant_id uuid,
  p_start date,
  p_end date,
  p_search text DEFAULT NULL
) RETURNS TABLE (
  assignment_id uuid,
  assignment_date date,
  assignment_status text,
  employee_id uuid,
  employee_number text,
  full_name text,
  department_name text,
  shift_id uuid,
  shift_name text,
  shift_code text,
  start_time time without time zone,
  end_time time without time zone,
  grace_minutes integer,
  break_minutes integer,
  weekly_off_days integer[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
BEGIN
  IF NOT (
    public.has_tenant_permission(p_tenant_id, 'attendance.view')
    OR public.has_tenant_permission(p_tenant_id, 'attendance.manage')
  ) THEN
    RAISE EXCEPTION 'Tenant attendance permission required.' USING errcode='42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'Valid roster date range required.' USING errcode='22000';
  END IF;

  RETURN QUERY
  SELECT a.id, a.assignment_date, a.status,
    e.id, e.employee_number, e.full_name, d.name,
    s.id, s.name, s.code, s.start_time, s.end_time,
    s.grace_minutes, s.break_minutes, s.weekly_off_days
  FROM public.employee_shift_assignments a
  JOIN public.employees e ON e.id=a.employee_id AND e.tenant_id=p_tenant_id
  JOIN public.shifts s ON s.id=a.shift_id AND s.tenant_id=p_tenant_id
  LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=p_tenant_id
  WHERE a.tenant_id=p_tenant_id
    AND a.assignment_date BETWEEN p_start AND p_end
    AND (nullif(btrim(coalesce(p_search,'')),'') IS NULL
      OR e.full_name ILIKE '%'||btrim(p_search)||'%'
      OR e.employee_number ILIKE '%'||btrim(p_search)||'%'
      OR s.name ILIKE '%'||btrim(p_search)||'%'
      OR s.code ILIKE '%'||btrim(p_search)||'%')
  ORDER BY a.assignment_date, e.full_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_shift_roster_data(uuid,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_shift_roster_data(uuid,date,date,text) TO authenticated, service_role;
