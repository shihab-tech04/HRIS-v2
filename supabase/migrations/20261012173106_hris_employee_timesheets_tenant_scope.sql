-- Phase 10: employee-owned tenant timesheets.
-- Release candidate only. This migration is tested on a disposable local stack
-- and has not been applied to any hosted Supabase project.

-- Browser access is through the explicitly tenant-bound RPCs below. Default
-- deny protects direct Data API reads; the RPCs apply employee ownership checks.
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_activities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hris_get_my_timesheet_context(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_employee_id uuid;
  v_context jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode = '42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'employee_id', v_employee_id,
    'activities', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id,
        'activity_type', a.activity_type,
        'name', a.name,
        'code', a.code
      ) ORDER BY a.activity_type, a.name)
      FROM public.timesheet_activities AS a
      WHERE a.tenant_id = p_tenant_id AND a.active IS TRUE
    ), '[]'::jsonb),
    'timesheets', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', t.id,
        'period_type', t.period_type,
        'period_start', t.period_start,
        'period_end', t.period_end,
        'status', t.status,
        'submitted_at', t.submitted_at,
        'resolved_at', t.resolved_at,
        'resolution_note', t.resolution_note,
        'entries', COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', e.id,
            'activity_id', e.activity_id,
            'activity_name', a.name,
            'activity_code', a.code,
            'work_date', e.work_date,
            'hours', e.hours,
            'note', e.note
          ) ORDER BY e.work_date, a.name, e.id)
          FROM public.timesheet_entries AS e
          JOIN public.timesheet_activities AS a
            ON a.id = e.activity_id AND a.tenant_id = t.tenant_id
          WHERE e.timesheet_id = t.id
        ), '[]'::jsonb)
      ) ORDER BY t.period_start DESC, t.created_at DESC)
      FROM public.timesheets AS t
      WHERE t.tenant_id = p_tenant_id AND t.employee_id = v_employee_id
    ), '[]'::jsonb)
  ) INTO v_context;

  RETURN v_context;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_save_my_timesheet(
  p_tenant_id uuid,
  p_id uuid,
  p_period_type text,
  p_start date,
  p_end date,
  p_entries jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_employee_id uuid;
  v_timesheet_id uuid;
  v_status text;
  v_entry jsonb;
  v_activity_id uuid;
  v_work_date date;
  v_hours numeric;
  v_note text;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode = '42501';
  END IF;

  IF p_period_type IS NULL OR p_period_type NOT IN ('daily', 'weekly') OR p_start IS NULL OR p_end IS NULL
      OR p_end < p_start OR p_end - p_start > 6
      OR (p_period_type = 'daily' AND p_start <> p_end) THEN
    RAISE EXCEPTION 'Choose a valid daily or seven-day timesheet period.' USING errcode = '22000';
  END IF;
  IF p_entries IS NULL OR pg_catalog.jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Timesheet entries must be a list.' USING errcode = '22000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_entries) AS item(value)
    WHERE pg_catalog.jsonb_typeof(item.value) <> 'object'
      OR NULLIF(item.value->>'activity_id', '') IS NULL
      OR NULLIF(item.value->>'work_date', '') IS NULL
      OR NULLIF(item.value->>'hours', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Each entry needs an activity, work date, and hours.' USING errcode = '22000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_entries) AS item(value)
    WHERE (item.value->>'work_date')::date < p_start
       OR (item.value->>'work_date')::date > p_end
       OR (item.value->>'hours')::numeric <= 0
       OR (item.value->>'hours')::numeric > 24
  ) THEN
    RAISE EXCEPTION 'Entry dates must be inside the period and hours must be between 0 and 24.' USING errcode = '22000';
  END IF;

  IF EXISTS (
    SELECT (item.value->>'work_date')::date
    FROM pg_catalog.jsonb_array_elements(p_entries) AS item(value)
    GROUP BY (item.value->>'work_date')::date
    HAVING SUM((item.value->>'hours')::numeric) > 24
  ) THEN
    RAISE EXCEPTION 'A day cannot contain more than 24 total hours.' USING errcode = '22000';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.timesheets(tenant_id, employee_id, period_type, period_start, period_end, status)
    VALUES (p_tenant_id, v_employee_id, p_period_type, p_start, p_end, 'draft')
    RETURNING id INTO v_timesheet_id;
  ELSE
    SELECT t.status INTO v_status
    FROM public.timesheets AS t
    WHERE t.id = p_id AND t.tenant_id = p_tenant_id AND t.employee_id = v_employee_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Timesheet not found.' USING errcode = 'P0002';
    END IF;
    IF v_status NOT IN ('draft', 'rejected') THEN
      RAISE EXCEPTION 'Only draft or returned timesheets can be edited.' USING errcode = '42501';
    END IF;

    UPDATE public.timesheets AS t
    SET period_type = p_period_type,
        period_start = p_start,
        period_end = p_end,
        status = 'draft',
        submitted_at = NULL,
        resolved_at = NULL,
        resolution_note = NULL,
        resolved_by = NULL
    WHERE t.id = p_id AND t.tenant_id = p_tenant_id AND t.employee_id = v_employee_id
    RETURNING t.id INTO v_timesheet_id;
    DELETE FROM public.timesheet_entries AS e WHERE e.timesheet_id = v_timesheet_id;
  END IF;

  FOR v_entry IN SELECT item.value FROM pg_catalog.jsonb_array_elements(p_entries) AS item(value)
  LOOP
    v_activity_id := (v_entry->>'activity_id')::uuid;
    v_work_date := (v_entry->>'work_date')::date;
    v_hours := (v_entry->>'hours')::numeric;
    v_note := NULLIF(pg_catalog.btrim(COALESCE(v_entry->>'note', '')), '');

    IF NOT EXISTS (
      SELECT 1 FROM public.timesheet_activities AS a
      WHERE a.id = v_activity_id AND a.tenant_id = p_tenant_id AND a.active IS TRUE
    ) THEN
      RAISE EXCEPTION 'Choose an active timesheet activity from this organization.' USING errcode = '22000';
    END IF;

    INSERT INTO public.timesheet_entries(timesheet_id, activity_id, work_date, hours, note)
    VALUES (v_timesheet_id, v_activity_id, v_work_date, v_hours, v_note);
  END LOOP;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'timesheet.saved', 'timesheet', v_timesheet_id::text,
    pg_catalog.jsonb_build_object('tenant_id', p_tenant_id, 'period_type', p_period_type,
      'entry_count', pg_catalog.jsonb_array_length(p_entries)));

  RETURN v_timesheet_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_submit_my_timesheet(p_tenant_id uuid, p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_employee_id uuid;
  v_status text;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode = '42501';
  END IF;

  SELECT t.status INTO v_status
  FROM public.timesheets AS t
  WHERE t.id = p_id AND t.tenant_id = p_tenant_id AND t.employee_id = v_employee_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found.' USING errcode = 'P0002';
  END IF;
  IF v_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only draft or returned timesheets can be submitted.' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.timesheet_entries AS e
    JOIN public.timesheet_activities AS a
      ON a.id = e.activity_id AND a.tenant_id = p_tenant_id AND a.active IS TRUE
    WHERE e.timesheet_id = p_id
  ) THEN
    RAISE EXCEPTION 'Add at least one active timesheet entry before submitting.' USING errcode = '22000';
  END IF;

  UPDATE public.timesheets AS t
  SET status = 'submitted', submitted_at = pg_catalog.now(), resolved_at = NULL,
      resolution_note = NULL, resolved_by = NULL
  WHERE t.id = p_id AND t.tenant_id = p_tenant_id AND t.employee_id = v_employee_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'timesheet.submitted', 'timesheet', p_id::text,
    pg_catalog.jsonb_build_object('tenant_id', p_tenant_id));

  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_timesheet_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_save_my_timesheet(uuid, uuid, text, date, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_submit_my_timesheet(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_timesheet_context(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_save_my_timesheet(uuid, uuid, text, date, date, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_submit_my_timesheet(uuid, uuid) TO authenticated, service_role;
