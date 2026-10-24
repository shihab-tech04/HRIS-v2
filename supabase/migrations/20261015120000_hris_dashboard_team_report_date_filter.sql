BEGIN;

-- Keep the established aggregate-only dashboard report contract while allowing
-- an authorized report viewer to select a tenant-local reporting date.
DROP FUNCTION IF EXISTS public.hris_get_tenant_dashboard_team_report(uuid);

CREATE OR REPLACE FUNCTION public.hris_get_tenant_dashboard_team_report(
  p_tenant_id uuid,
  p_report_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_timezone text;
  v_report_date date;
  v_teams jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'dashboard.view')
     OR NOT public.has_tenant_permission(p_tenant_id, 'reports.view') THEN
    RAISE EXCEPTION 'Tenant dashboard and report permissions required.' USING errcode = '42501';
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active dashboard organization required.' USING errcode = '42501';
  END IF;
  v_report_date := coalesce(p_report_date, (now() AT TIME ZONE v_timezone)::date);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'team_id', report.team_id,
    'team_name', report.team_name,
    'present_members', report.present_members,
    'absent_members', report.absent_members,
    'total_members', report.total_members,
    'work_from_office', report.work_from_office,
    'work_from_home', report.work_from_home,
    'client_meeting', report.client_meeting
  ) ORDER BY report.team_name), '[]'::jsonb)
  INTO v_teams
  FROM (
    SELECT
      t.id AS team_id,
      coalesce(t.name, 'Unassigned') AS team_name,
      count(a.id) FILTER (WHERE lower(btrim(a.status)) = 'present')::integer AS present_members,
      count(a.id) FILTER (WHERE lower(btrim(a.status)) = 'absent')::integer AS absent_members,
      count(e.id)::integer AS total_members,
      count(a.id) FILTER (WHERE lower(btrim(a.work_mode)) = 'office')::integer AS work_from_office,
      count(a.id) FILTER (WHERE lower(btrim(a.work_mode)) = 'home')::integer AS work_from_home,
      count(a.id) FILTER (WHERE lower(btrim(a.work_mode)) = 'client_meeting')::integer AS client_meeting
    FROM public.employees e
    LEFT JOIN public.teams t
      ON t.id = e.team_id AND t.tenant_id = e.tenant_id
    LEFT JOIN public.attendance_records a
      ON a.tenant_id = e.tenant_id
     AND a.employee_id = e.id
     AND a.attendance_date = v_report_date
    WHERE e.tenant_id = p_tenant_id
      AND e.employment_status NOT IN ('resigned', 'terminated')
    GROUP BY t.id, t.name
  ) report;

  RETURN jsonb_build_object('dashboard_date', v_report_date, 'teams', v_teams);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_dashboard_team_report(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_dashboard_team_report(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_dashboard_team_details(
  p_tenant_id uuid,
  p_team_id uuid,
  p_unassigned boolean,
  p_report_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_timezone text;
  v_details jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'dashboard.view')
     OR NOT public.has_tenant_permission(p_tenant_id, 'reports.view') THEN
    RAISE EXCEPTION 'Tenant dashboard and report permissions required.' USING errcode = '42501';
  END IF;
  IF p_report_date IS NULL OR p_unassigned IS NULL OR p_unassigned = (p_team_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A valid report date and exactly one team scope are required.' USING errcode = '22000';
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active dashboard organization required.' USING errcode = '42501';
  END IF;
  IF NOT p_unassigned AND NOT EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = p_team_id AND t.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Selected team is outside the active organization.' USING errcode = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'employee_name', report.employee_name,
    'employee_number', report.employee_number,
    'designation_title', report.designation_title,
    'department_name', report.department_name,
    'attendance_days', report.attendance_days,
    'office_hours', report.office_hours,
    'working_hours', report.working_hours,
    'deviation', report.deviation
  ) ORDER BY report.employee_name), '[]'::jsonb)
  INTO v_details
  FROM (
    SELECT
      e.full_name AS employee_name,
      e.employee_number,
      ds.title AS designation_title,
      d.name AS department_name,
      count(a.id)::integer AS attendance_days,
      round(sum(CASE WHEN a.id IS NULL OR lower(btrim(a.status)) IN ('weekend', 'holiday', 'on_leave') THEN 0
        ELSE coalesce(s.full_day_hours, 8) END)::numeric, 2) AS office_hours,
      round(sum(CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out >= a.check_in
        THEN extract(epoch FROM (a.check_out - a.check_in)) / 3600 ELSE 0 END)::numeric, 2) AS working_hours,
      round((
        sum(CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out >= a.check_in
          THEN extract(epoch FROM (a.check_out - a.check_in)) / 3600 ELSE 0 END)
        - sum(CASE WHEN a.id IS NULL OR lower(btrim(a.status)) IN ('weekend', 'holiday', 'on_leave') THEN 0
          ELSE coalesce(s.full_day_hours, 8) END)
      )::numeric, 2) AS deviation
    FROM public.employees e
    LEFT JOIN public.teams t ON t.id = e.team_id AND t.tenant_id = e.tenant_id
    LEFT JOIN public.departments d ON d.id = e.department_id AND d.tenant_id = e.tenant_id
    LEFT JOIN public.designations ds ON ds.id = e.designation_id AND ds.tenant_id = e.tenant_id
    LEFT JOIN public.shifts s ON s.id = e.shift_id AND s.tenant_id = e.tenant_id
    LEFT JOIN public.attendance_records a
      ON a.tenant_id = e.tenant_id AND a.employee_id = e.id AND a.attendance_date = p_report_date
    WHERE e.tenant_id = p_tenant_id
      AND e.employment_status NOT IN ('resigned', 'terminated')
      AND (CASE WHEN p_unassigned THEN t.id IS NULL ELSE t.id = p_team_id END)
    GROUP BY e.id, e.employee_number, e.full_name, ds.title, d.name, s.full_day_hours
  ) report;

  RETURN jsonb_build_object('report_date', p_report_date, 'details', v_details);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_dashboard_team_details(uuid, uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_dashboard_team_details(uuid, uuid, boolean, date) TO authenticated, service_role;

COMMIT;
