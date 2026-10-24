-- Forward-only hosted release port: tenant attendance, shift roster and assignment RPCs.
-- Target: replacement Supabase xfuxnljfrgvusbrpvxpa only.
-- Preserves the newest canonical Main definitions; does not synthesize historical ledger entries.
-- Source migration SHA-256 provenance:
--   20261012111928_hris_tenant_shift_roster_read.sql: 7f01beb3ac83ded9d27665df383077dded55f980da4b327d6112f82083ed3d48
--   20261012113020_hris_tenant_shift_assignment_manage.sql: 9dacd819560336aff51e8b33a369de4bc106fcd3fcc49cb7f4f662937d27904b
--   20261012115907_hris_employee_web_attendance_event.sql: 6b99897e0f8e13c5ee879a86ccf32f1f4526e5a07f690a2ae2fc856d45e5ad5b
--   20261013215431_employee_dashboard_attendance_period_read.sql: 9dc8ed9a6a7b04a2e7540ecabd3119242995b066a549365d177ac6c28167d448
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Source: 20261012111928_hris_tenant_shift_roster_read.sql :: public.hris_get_tenant_shift_roster_data
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

-- Source: 20261012113020_hris_tenant_shift_assignment_manage.sql :: public.hris_get_tenant_shift_roster_options
CREATE OR REPLACE FUNCTION public.hris_get_tenant_shift_roster_options(
  p_tenant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'attendance.manage') THEN
    RAISE EXCEPTION 'Tenant attendance management permission required.' USING errcode='42501';
  END IF;

  RETURN jsonb_build_object(
    'employees', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'employee_number', e.employee_number,
        'full_name', e.full_name, 'department_name', d.name
      ) ORDER BY e.full_name)
      FROM public.employees e
      LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=p_tenant_id
      WHERE e.tenant_id=p_tenant_id
        AND e.employment_status NOT IN ('resigned','terminated')
    ), '[]'::jsonb),
    'shifts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'code', s.code,
        'start_time', s.start_time, 'end_time', s.end_time
      ) ORDER BY s.name)
      FROM public.shifts s
      WHERE s.tenant_id=p_tenant_id AND s.active IS TRUE
    ), '[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.hris_get_tenant_shift_roster_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_shift_roster_options(uuid) TO authenticated, service_role;

-- Source: 20261012113020_hris_tenant_shift_assignment_manage.sql :: public.hris_assign_tenant_employee_shift
CREATE OR REPLACE FUNCTION public.hris_assign_tenant_employee_shift(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_shift_id uuid,
  p_assignment_date date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_assignment_id uuid;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'attendance.manage') THEN
    RAISE EXCEPTION 'Tenant attendance management permission required.' USING errcode='42501';
  END IF;
  IF p_assignment_date IS NULL THEN
    RAISE EXCEPTION 'Assignment date is required.' USING errcode='22000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id=p_employee_id AND e.tenant_id=p_tenant_id
      AND e.employment_status NOT IN ('resigned','terminated')
  ) THEN
    RAISE EXCEPTION 'Active employee not found in the authorized tenant.' USING errcode='P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id=p_shift_id AND s.tenant_id=p_tenant_id AND s.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active shift not found in the authorized tenant.' USING errcode='P0002';
  END IF;

  INSERT INTO public.employee_shift_assignments(
    tenant_id, employee_id, shift_id, assignment_date, status, created_by
  ) VALUES (
    p_tenant_id, p_employee_id, p_shift_id, p_assignment_date, 'scheduled', auth.uid()
  ) RETURNING id INTO v_assignment_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'shift.assignment.created', 'employee_shift_assignment', v_assignment_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',p_employee_id,
      'shift_id',p_shift_id,'assignment_date',p_assignment_date));

  RETURN v_assignment_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.hris_assign_tenant_employee_shift(uuid,uuid,uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_assign_tenant_employee_shift(uuid,uuid,uuid,date) TO authenticated, service_role;

-- Source: 20261012115907_hris_employee_web_attendance_event.sql :: public.hris_employee_record_attendance_event
CREATE OR REPLACE FUNCTION public.hris_employee_record_attendance_event(
  p_tenant_id uuid,
  p_event text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_attendance_date date;
  v_record public.attendance_records%rowtype;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;

  IF p_event NOT IN ('check_in', 'check_out') THEN
    RAISE EXCEPTION 'Choose check in or check out.' USING errcode='22000';
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;

  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked active employee record required.' USING errcode='42501';
  END IF;
  v_attendance_date := (now() AT TIME ZONE v_timezone)::date;

  IF p_event='check_in' THEN
    -- Insert uses the existing schema defaults for status and work mode. A
    -- pre-existing manager/system row is changed only in its punch timestamp.
    INSERT INTO public.attendance_records(
      tenant_id,employee_id,attendance_date,check_in,source
    ) VALUES (
      p_tenant_id,v_employee,v_attendance_date,now(),'employee'
    ) ON CONFLICT (tenant_id,employee_id,attendance_date) DO NOTHING
    RETURNING * INTO v_record;

    IF NOT FOUND THEN
      SELECT a.* INTO v_record
      FROM public.attendance_records a
      WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee
        AND a.attendance_date=v_attendance_date
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance could not be recorded. Please retry.' USING errcode='40001';
      END IF;
      IF v_record.check_in IS NOT NULL THEN
        RAISE EXCEPTION 'You are already checked in today.' USING errcode='22000';
      END IF;
      IF v_record.check_out IS NOT NULL THEN
        RAISE EXCEPTION 'A check-out is already recorded today. Request a correction if it is wrong.' USING errcode='22000';
      END IF;
      UPDATE public.attendance_records a
      SET check_in=now(),updated_at=now()
      WHERE a.id=v_record.id
      RETURNING a.* INTO v_record;
    END IF;
  ELSE
    SELECT a.* INTO v_record
    FROM public.attendance_records a
    WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee
      AND a.attendance_date=v_attendance_date
    FOR UPDATE;
    IF NOT FOUND OR v_record.check_in IS NULL THEN
      RAISE EXCEPTION 'Check in before checking out.' USING errcode='22000';
    END IF;
    IF v_record.check_out IS NOT NULL THEN
      RAISE EXCEPTION 'You are already checked out today.' USING errcode='22000';
    END IF;
    IF now() < v_record.check_in THEN
      RAISE EXCEPTION 'Current time is earlier than the recorded check-in.' USING errcode='22000';
    END IF;
    UPDATE public.attendance_records a
    SET check_out=now(),updated_at=now()
    WHERE a.id=v_record.id
    RETURNING a.* INTO v_record;
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (
    auth.uid(),
    CASE WHEN p_event='check_in' THEN 'attendance.web_check_in' ELSE 'attendance.web_check_out' END,
    'attendance_record',v_record.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee,
      'attendance_date',v_attendance_date,'event',p_event)
  );

  RETURN jsonb_build_object(
    'id',v_record.id,'tenant_id',v_record.tenant_id,'employee_id',v_record.employee_id,
    'attendance_date',v_record.attendance_date,'check_in',v_record.check_in,
    'check_out',v_record.check_out,'work_mode',v_record.work_mode,'status',v_record.status
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.hris_employee_record_attendance_event(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_record_attendance_event(uuid,text) TO authenticated, service_role;

-- Source: 20261013215431_employee_dashboard_attendance_period_read.sql :: public.hris_get_my_attendance_period
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

COMMIT;
