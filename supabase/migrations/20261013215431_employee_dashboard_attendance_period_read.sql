-- Read one organization-local month of the signed-in employee's own attendance
-- for the Employee Dashboard period selector. The existing composite unique
-- key on (tenant_id, employee_id, attendance_date) bounds the date scan.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_my_attendance_period(
  p_tenant_id uuid,
  p_month_start date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_employee_id uuid;
  v_timezone text;
  v_today date;
  v_month_end date;
  v_records jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;

  v_today := (now() AT TIME ZONE v_timezone)::date;
  IF p_month_start IS NULL
      OR extract(day FROM p_month_start) <> 1
      OR p_month_start > date_trunc('month',v_today::timestamp)::date THEN
    RAISE EXCEPTION 'Choose a calendar month up to the current organization month.' USING errcode='22023';
  END IF;
  v_month_end := (p_month_start + interval '1 month')::date - 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,
      'attendance_date',a.attendance_date,
      'check_in',a.check_in,
      'check_out',a.check_out,
      'work_mode',a.work_mode,
      'status',a.status,
      'work_hours',CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL
          AND a.check_out >= a.check_in
        THEN round((extract(epoch FROM (a.check_out-a.check_in))/3600)::numeric,2)
        ELSE NULL END
    ) ORDER BY a.attendance_date),'[]'::jsonb)
  INTO v_records
  FROM public.attendance_records a
  WHERE a.tenant_id=p_tenant_id
    AND a.employee_id=v_employee_id
    AND a.attendance_date BETWEEN p_month_start AND v_month_end;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,
    'month_start',p_month_start,
    'month_end',v_month_end,
    'records',v_records
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_attendance_period(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_attendance_period(uuid,date) TO authenticated,service_role;

COMMENT ON FUNCTION public.hris_get_my_attendance_period(uuid,date) IS
  'Returns one calendar month of attendance for the active employee linked to the requested tenant; no manager or cross-tenant data is returned.';

COMMIT;
