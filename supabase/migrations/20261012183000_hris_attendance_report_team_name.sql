BEGIN;

-- The Figma Attendance Report's Team Name is sourced from the employee's
-- same-tenant team assignment. The tenant predicate is required because the
-- legacy employees.team_id FK is single-column and may reference another tenant.
CREATE OR REPLACE FUNCTION public.hris_get_tenant_attendance_data(
  p_tenant_id uuid, p_start date, p_end date, p_search text DEFAULT NULL,
  p_status text DEFAULT NULL, p_report boolean DEFAULT FALSE
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
BEGIN
  IF p_report THEN
    IF NOT public.has_tenant_permission(p_tenant_id, 'reports.view') THEN
      RAISE EXCEPTION 'Tenant attendance report permission required.' USING errcode='42501';
    END IF;
  ELSIF NOT (
    public.has_tenant_permission(p_tenant_id, 'attendance.view')
    OR public.has_tenant_permission(p_tenant_id, 'attendance.manage')
  ) THEN
    RAISE EXCEPTION 'Tenant attendance permission required.' USING errcode='42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end<p_start THEN
    RAISE EXCEPTION 'Valid date range required.' USING errcode='22000';
  END IF;

  IF p_report THEN
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'employee_id',x.employee_id,'employee_number',x.employee_number,
        'employee_name',x.employee_name,'designation_title',x.designation_title,
        'team_name',x.team_name,'department_name',x.department_name,
        'attendance_days',x.attendance_days,'office_hours',x.office_hours,
        'working_hours',x.working_hours,
        'deviation',round((x.working_hours-x.office_hours)::numeric,2)
      ) ORDER BY x.employee_name)
      FROM (
        SELECT e.id employee_id,e.employee_number,e.full_name employee_name,
          d.name department_name,ds.title designation_title,t.name team_name,
          count(a.id)::integer attendance_days,
          round(sum(CASE WHEN a.status IN ('weekend','holiday','on_leave') THEN 0
            ELSE coalesce(s.full_day_hours,8) END)::numeric,2) office_hours,
          round(sum(CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out>=a.check_in
            THEN extract(epoch FROM (a.check_out-a.check_in))/3600 ELSE 0 END)::numeric,2) working_hours
        FROM public.attendance_records a
        JOIN public.employees e ON e.id=a.employee_id AND e.tenant_id=p_tenant_id
        LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=p_tenant_id
        LEFT JOIN public.designations ds ON ds.id=e.designation_id AND ds.tenant_id=p_tenant_id
        LEFT JOIN public.teams t ON t.id=e.team_id AND t.tenant_id=p_tenant_id
        LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.tenant_id=p_tenant_id
        WHERE a.tenant_id=p_tenant_id AND a.attendance_date BETWEEN p_start AND p_end
          AND (nullif(btrim(coalesce(p_search,'')),'') IS NULL
            OR e.full_name ILIKE '%'||btrim(p_search)||'%'
            OR e.employee_number ILIKE '%'||btrim(p_search)||'%')
        GROUP BY e.id,e.employee_number,e.full_name,d.name,ds.title,t.name,s.full_day_hours
      ) x
    ),'[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'records',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.attendance_date DESC,x.full_name)
      FROM (
        SELECT a.*,e.employee_number,e.full_name,d.name department_name,ds.title designation_title,
          CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out>=a.check_in
            THEN round((extract(epoch FROM (a.check_out-a.check_in))/3600)::numeric,2) ELSE NULL END work_hours
        FROM public.attendance_records a
        JOIN public.employees e ON e.id=a.employee_id AND e.tenant_id=p_tenant_id
        LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=p_tenant_id
        LEFT JOIN public.designations ds ON ds.id=e.designation_id AND ds.tenant_id=p_tenant_id
        WHERE a.tenant_id=p_tenant_id AND a.attendance_date BETWEEN p_start AND p_end
          AND (nullif(btrim(coalesce(p_search,'')),'') IS NULL
            OR e.full_name ILIKE '%'||btrim(p_search)||'%'
            OR e.employee_number ILIKE '%'||btrim(p_search)||'%')
          AND (nullif(btrim(coalesce(p_status,'')),'') IS NULL OR p_status='all' OR a.status=p_status)
      ) x
    ),'[]'::jsonb),
    'corrections',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC)
      FROM (
        SELECT c.*,e.employee_number,e.full_name
        FROM public.attendance_corrections c
        JOIN public.employees e ON e.id=c.employee_id AND e.tenant_id=p_tenant_id
        WHERE c.tenant_id=p_tenant_id AND c.attendance_date BETWEEN p_start AND p_end
      ) x
    ),'[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_attendance_data(uuid,date,date,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_attendance_data(uuid,date,date,text,text,boolean) TO authenticated, service_role;

COMMIT;
