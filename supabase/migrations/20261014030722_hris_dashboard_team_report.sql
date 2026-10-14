BEGIN;

-- Figma Managerial Dashboard Team Report. Return aggregate counts only and
-- require both dashboard and reporting access in the active tenant.
CREATE OR REPLACE FUNCTION public.hris_get_tenant_dashboard_team_report(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_timezone text;
  v_today date;
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
  v_today := (now() AT TIME ZONE v_timezone)::date;

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
     AND a.attendance_date = v_today
    WHERE e.tenant_id = p_tenant_id
      AND e.employment_status NOT IN ('resigned', 'terminated')
    GROUP BY t.id, t.name
  ) report;

  RETURN jsonb_build_object('dashboard_date', v_today, 'teams', v_teams);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_dashboard_team_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_dashboard_team_report(uuid) TO authenticated, service_role;

COMMIT;
