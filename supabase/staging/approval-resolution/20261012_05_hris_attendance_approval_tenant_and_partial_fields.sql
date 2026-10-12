-- ISOLATED RELEASE CANDIDATE ONLY; never apply to production before multi-user
-- Auth/RLS and old-record regression acceptance. Existing schema, API signature,
-- role authority and audit semantics retained.
-- Root causes fixed: pending request lookup lacked tenant predicate; resolving a
-- one-field correction could erase the other previously recorded punch.
CREATE OR REPLACE FUNCTION public.admin_resolve_attendance_correction(
  p_id uuid, p_decision text, p_note text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_tenant uuid := public.synesis_tenant_id();
  v_request public.attendance_corrections%rowtype;
  v_current public.attendance_records%rowtype;
  v_record uuid;
BEGIN
  IF NOT public.is_live_session() OR NOT public.has_permission('attendance.manage') THEN
    RAISE EXCEPTION 'Active attendance management permission required.' USING errcode='42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode='22000';
  END IF;
  SELECT * INTO v_request FROM public.attendance_corrections
  WHERE id=p_id AND tenant_id=v_tenant AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending correction not found in authorized organization.' USING errcode='P0002'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id=v_request.employee_id AND tenant_id=v_tenant
  ) THEN RAISE EXCEPTION 'Employee not found in authorized organization.' USING errcode='P0002'; END IF;

  IF p_decision='approved' THEN
    SELECT * INTO v_current FROM public.attendance_records
    WHERE tenant_id=v_tenant AND employee_id=v_request.employee_id
      AND attendance_date=v_request.attendance_date FOR UPDATE;
    v_record := public.admin_save_attendance(
      v_request.employee_id, v_request.attendance_date,
      jsonb_build_object(
        'check_in', COALESCE(v_request.requested_check_in,v_current.check_in),
        'check_out', COALESCE(v_request.requested_check_out,v_current.check_out),
        'work_mode', COALESCE(v_request.requested_work_mode,v_current.work_mode,'office'),
        'client_name', COALESCE(v_request.client_name,v_current.client_name,''),
        'status', COALESCE(NULLIF(v_current.status,''),'present'),
        'remarks', COALESCE(NULLIF(btrim(p_note),''),'Approved attendance correction')
      )
    );
  END IF;

  UPDATE public.attendance_corrections SET
    status=p_decision,resolved_by=auth.uid(),resolved_at=now(),
    resolution_note=NULLIF(btrim(COALESCE(p_note,'')),'')
  WHERE id=p_id AND tenant_id=v_tenant AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending correction changed during decision.' USING errcode='P0002'; END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'attendance.correction.'||p_decision,'attendance_correction',p_id::text,
    jsonb_build_object('attendance_record_id',v_record,'note',p_note));
  RETURN jsonb_build_object('success',true,'decision',p_decision,'attendance_record_id',v_record);
END;
$function$;
-- Preserve existing GRANT/REVOKE statements, do not add unrestricted grants.
