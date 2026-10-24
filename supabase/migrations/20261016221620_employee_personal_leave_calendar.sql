-- Employee leave calendar: expose only the caller's approved leave dates and
-- tenant-wide active holidays for one month. Reasons and reviewer details are
-- deliberately excluded from this display contract.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.hris_get_my_leave_calendar(
  p_tenant_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_tenant_timezone text;
  v_last_day date;
  v_calendar jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL
      OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Choose a valid calendar month.' USING errcode = '22000';
  END IF;

  v_last_day := (date_trunc('month', p_start_date::timestamp)
    + interval '1 month - 1 day')::date;
  IF p_start_date <> date_trunc('month', p_start_date::timestamp)::date
      OR p_end_date <> v_last_day THEN
    RAISE EXCEPTION 'The calendar range must cover one complete month.' USING errcode = '22000';
  END IF;

  SELECT t.timezone INTO v_tenant_timezone
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_tenant_timezone IS NULL THEN
    RAISE EXCEPTION 'An active employee organization is required.' USING errcode = '42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'A linked employee record is required.' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'approved_leave', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'from_date', r.from_date,
        'to_date', r.to_date,
        'requested_days', r.requested_days,
        'leave_type_name', lt.name
      ) ORDER BY r.from_date, r.id)
      FROM public.leave_requests AS r
      JOIN public.leave_types AS lt
        ON lt.id = r.leave_type_id AND lt.tenant_id = p_tenant_id
      WHERE r.tenant_id = p_tenant_id
        AND r.employee_id = v_employee_id
        AND r.status = 'approved'
        AND r.from_date <= p_end_date
        AND r.to_date >= p_start_date
    ), '[]'::jsonb),
    'holidays', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id,
        'name', h.name,
        'start_date', h.start_date,
        'end_date', h.end_date
      ) ORDER BY h.start_date, h.name, h.id)
      FROM public.holidays AS h
      WHERE h.tenant_id = p_tenant_id
        AND h.active IS TRUE
        AND h.start_date <= p_end_date
        AND h.end_date >= p_start_date
    ), '[]'::jsonb)
  ) INTO v_calendar;

  RETURN v_calendar;
END
$function$;

REVOKE ALL ON FUNCTION private.hris_get_my_leave_calendar(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.hris_get_my_leave_calendar(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_my_leave_calendar(
  p_tenant_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT private.hris_get_my_leave_calendar(p_tenant_id, p_start_date, p_end_date)
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_leave_calendar(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_leave_calendar(uuid, date, date) TO authenticated;

COMMIT;
