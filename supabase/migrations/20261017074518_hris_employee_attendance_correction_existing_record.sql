BEGIN;

-- Attendance corrections must refer to a persisted attendance row. This
-- protects the self-service RPC from creating new attendance through a
-- manager-approved correction request.
CREATE OR REPLACE FUNCTION public.hris_employee_submit_attendance_correction(
  p_tenant_id uuid, p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_date date := nullif(p_payload->>'attendance_date','')::date;
  v_check_in_time time := nullif(p_payload->>'check_in_time','')::time;
  v_check_out_time time := nullif(p_payload->>'check_out_time','')::time;
  v_work_mode text := nullif(btrim(coalesce(p_payload->>'work_mode','')),'');
  v_client_name text := nullif(btrim(coalesce(p_payload->>'client_name','')),'');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_request_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  SELECT t.timezone INTO v_timezone FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  IF v_date IS NULL OR v_reason IS NULL THEN
    RAISE EXCEPTION 'Attendance date and reason are required.' USING errcode='22000';
  END IF;
  IF v_check_in_time IS NULL AND v_check_out_time IS NULL
     AND v_work_mode IS NULL AND v_client_name IS NULL THEN
    RAISE EXCEPTION 'Provide at least one attendance field to correct.' USING errcode='22000';
  END IF;
  IF v_work_mode IS NOT NULL AND v_work_mode NOT IN ('office','home','client_meeting') THEN
    RAISE EXCEPTION 'Choose a supported work location.' USING errcode='22000';
  END IF;
  IF v_check_in_time IS NOT NULL AND v_check_out_time IS NOT NULL
     AND v_check_out_time < v_check_in_time THEN
    RAISE EXCEPTION 'Check-out must be after check-in.' USING errcode='22000';
  END IF;

  PERFORM 1 FROM public.attendance_records a
  WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee
    AND a.attendance_date=v_date
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found for correction.' USING errcode='P0002';
  END IF;

  v_check_in := CASE WHEN v_check_in_time IS NULL THEN NULL
    ELSE (v_date + v_check_in_time) AT TIME ZONE v_timezone END;
  v_check_out := CASE WHEN v_check_out_time IS NULL THEN NULL
    ELSE (v_date + v_check_out_time) AT TIME ZONE v_timezone END;

  INSERT INTO public.attendance_corrections(
    id,tenant_id,employee_id,attendance_date,requested_check_in,
    requested_check_out,requested_work_mode,client_name,reason,status,requested_by
  ) VALUES (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_employee,v_date,v_check_in,
    v_check_out,v_work_mode,v_client_name,v_reason,'pending',auth.uid()
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'attendance.correction.submitted','attendance_correction',v_request_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee,'attendance_date',v_date));
  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb) TO authenticated, service_role;

COMMIT;
