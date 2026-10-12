-- Persist employee self-service clock-in/out using the existing daily
-- attendance record. SECURITY DEFINER is required because employees receive no
-- direct INSERT/UPDATE grant; every call is bound to the live Auth session and
-- the linked active employee in the requested tenant.
BEGIN;

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

COMMIT;
