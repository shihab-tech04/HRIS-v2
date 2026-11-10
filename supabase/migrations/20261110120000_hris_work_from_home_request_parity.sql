-- Restore the structured Work From Home request and attendance contract.
-- Work requests remain in the tenant-scoped service_requests workflow; approved
-- WFH dates are exposed as scheduled attendance rows until a real punch exists.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF to_regclass('public.service_requests') IS NULL
    OR to_regclass('public.service_request_status_history') IS NULL
    OR to_regclass('public.attendance_records') IS NULL
    OR to_regclass('public.tenants') IS NULL
    OR to_regclass('public.employees') IS NULL
    OR to_regclass('public.admin_audit_logs') IS NULL
    OR to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NULL
    OR to_regprocedure('public.has_tenant_permission(uuid,text)') IS NULL
    OR to_regprocedure('public.is_live_session()') IS NULL THEN
    RAISE EXCEPTION 'Work From Home dependencies are not installed; no changes made.';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.hris_get_my_service_requests(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_requests jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active sign-in is required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'This organization is not active.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'request_type',r.request_type,'reason',r.reason,'request_data',r.request_data,
    'status',r.status,'submitted_at',r.submitted_at,'resolved_at',r.resolved_at,
    'resolution_note',r.resolution_note,
    'history',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',h.id,'previous_status',h.previous_status,'new_status',h.new_status,
        'note',h.note,'created_at',h.created_at
      ) ORDER BY h.created_at,h.id),'[]'::jsonb)
      FROM public.service_request_status_history h
      WHERE h.tenant_id=r.tenant_id AND h.service_request_id=r.id
    )
  ) ORDER BY r.submitted_at DESC,r.id),'[]'::jsonb)
  INTO v_requests
  FROM public.service_requests r
  WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'employee_id',v_employee_id,'requests',coalesce(v_requests,'[]'::jsonb)
  );
END
$function$;

-- Keep other service requests on their existing contract, but do not allow a
-- reason-only call to create a malformed Work From Home request.
CREATE OR REPLACE FUNCTION public.hris_submit_my_service_request(
  p_tenant_id uuid,p_request_type text,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_request public.service_requests%ROWTYPE;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active sign-in is required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'This organization is not active.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF p_request_type IS NULL OR p_request_type NOT IN (
    'employment_certificate','noc_letter','salary_certificate','other',
    'work_from_home','movement','shift_change','shift_swap'
  ) THEN
    RAISE EXCEPTION 'Choose a supported request type.' USING errcode='22023';
  END IF;
  IF p_request_type='work_from_home' THEN
    RAISE EXCEPTION 'Use the structured Work From Home request form.' USING errcode='22023';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for this request.' USING errcode='22023';
  END IF;
  INSERT INTO public.service_requests(
    tenant_id,employee_id,request_type,reason,request_data,status,submitted_by,submitted_at
  ) VALUES (
    p_tenant_id,v_employee_id,p_request_type,btrim(p_reason),'{}'::jsonb,'pending',auth.uid(),clock_timestamp()
  ) RETURNING * INTO v_request;
  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status
  ) VALUES (p_tenant_id,v_request.id,auth.uid(),NULL,'pending');
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'service_request.submitted','service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id));
  RETURN jsonb_build_object('id',v_request.id,'tenant_id',v_request.tenant_id,
    'employee_id',v_request.employee_id,'request_type',v_request.request_type,
    'reason',v_request.reason,'status',v_request.status,'submitted_at',v_request.submitted_at);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_submit_my_work_from_home_request(
  p_tenant_id uuid,
  p_from_date date,
  p_to_date date,
  p_start_time time,
  p_end_time time,
  p_tasks jsonb,
  p_location text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_request public.service_requests%ROWTYPE;
  v_tasks jsonb;
  v_location text := nullif(btrim(coalesce(p_location,'')),'');
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active sign-in is required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'This organization is not active.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'hris-wfh:'||p_tenant_id::text||':'||v_employee_id::text,0));
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date THEN
    RAISE EXCEPTION 'Choose valid Work From Home dates.' USING errcode='22023';
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time<=p_start_time THEN
    RAISE EXCEPTION 'End time must be later than start time.' USING errcode='22023';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for this request.' USING errcode='22023';
  END IF;
  IF jsonb_typeof(coalesce(p_tasks,'null'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Add at least one task or work item.' USING errcode='22023';
  END IF;
  IF jsonb_array_length(p_tasks)=0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_tasks) AS task(value)
    WHERE jsonb_typeof(task.value) IS DISTINCT FROM 'string'
       OR nullif(btrim(task.value #>> '{}'),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'Add at least one non-empty task or work item.' USING errcode='22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(btrim(value)) ORDER BY ordinality),'[]'::jsonb)
  INTO v_tasks FROM jsonb_array_elements_text(p_tasks) WITH ORDINALITY task(value,ordinality);

  IF EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
      AND r.request_type='work_from_home' AND r.status IN ('pending','approved','in_progress')
      AND nullif(r.request_data->>'from_date','') IS NOT NULL
      AND nullif(r.request_data->>'to_date','') IS NOT NULL
      AND daterange((r.request_data->>'from_date')::date,(r.request_data->>'to_date')::date,'[]')
          && daterange(p_from_date,p_to_date,'[]')
  ) THEN
    RAISE EXCEPTION 'A Work From Home request already overlaps these dates.' USING errcode='23505';
  END IF;

  INSERT INTO public.service_requests(
    tenant_id,employee_id,request_type,reason,request_data,status,submitted_by,submitted_at
  ) VALUES (
    p_tenant_id,v_employee_id,'work_from_home',btrim(p_reason),
    jsonb_build_object(
      'from_date',p_from_date,'to_date',p_to_date,'start_time',p_start_time,
      'end_time',p_end_time,'duration_minutes',round(extract(epoch FROM (p_end_time-p_start_time))/60)::integer,
      'tasks',v_tasks,'location',v_location
    ),'pending',auth.uid(),clock_timestamp()
  ) RETURNING * INTO v_request;

  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status
  ) VALUES (p_tenant_id,v_request.id,auth.uid(),NULL,'pending');
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'service_request.work_from_home.submitted','service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
      'from_date',p_from_date,'to_date',p_to_date));

  RETURN jsonb_build_object('id',v_request.id,'request_type',v_request.request_type,
    'reason',v_request.reason,'request_data',v_request.request_data,'status',v_request.status,
    'submitted_at',v_request.submitted_at);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_update_my_work_from_home_request(
  p_tenant_id uuid,
  p_request_id uuid,
  p_from_date date,
  p_to_date date,
  p_start_time time,
  p_end_time time,
  p_tasks jsonb,
  p_location text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_request public.service_requests%ROWTYPE;
  v_tasks jsonb;
  v_location text := nullif(btrim(coalesce(p_location,'')),'');
BEGIN
  IF NOT public.is_live_session() OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'An active sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'hris-wfh:'||p_tenant_id::text||':'||v_employee_id::text,0));
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date THEN
    RAISE EXCEPTION 'Choose valid Work From Home dates.' USING errcode='22023';
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time<=p_start_time THEN
    RAISE EXCEPTION 'End time must be later than start time.' USING errcode='22023';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for this request.' USING errcode='22023';
  END IF;
  IF jsonb_typeof(coalesce(p_tasks,'null'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Add at least one task or work item.' USING errcode='22023';
  END IF;
  IF jsonb_array_length(p_tasks)=0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_tasks) AS task(value)
    WHERE jsonb_typeof(task.value) IS DISTINCT FROM 'string'
       OR nullif(btrim(task.value #>> '{}'),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'Add at least one non-empty task or work item.' USING errcode='22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(btrim(value)) ORDER BY ordinality),'[]'::jsonb)
  INTO v_tasks FROM jsonb_array_elements_text(p_tasks) WITH ORDINALITY task(value,ordinality);

  SELECT r.* INTO v_request FROM public.service_requests r
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
    AND r.request_type='work_from_home' AND r.status='pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your pending Work From Home requests can be edited.' USING errcode='P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id AND r.id<>p_request_id
      AND r.request_type='work_from_home' AND r.status IN ('pending','approved','in_progress')
      AND nullif(r.request_data->>'from_date','') IS NOT NULL
      AND nullif(r.request_data->>'to_date','') IS NOT NULL
      AND daterange((r.request_data->>'from_date')::date,(r.request_data->>'to_date')::date,'[]')
          && daterange(p_from_date,p_to_date,'[]')
  ) THEN
    RAISE EXCEPTION 'A Work From Home request already overlaps these dates.' USING errcode='23505';
  END IF;

  UPDATE public.service_requests r SET
    reason=btrim(p_reason),
    request_data=jsonb_build_object(
      'from_date',p_from_date,'to_date',p_to_date,'start_time',p_start_time,
      'end_time',p_end_time,'duration_minutes',round(extract(epoch FROM (p_end_time-p_start_time))/60)::integer,
      'tasks',v_tasks,'location',v_location
    ),updated_at=clock_timestamp()
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
    AND r.request_type='work_from_home' AND r.status='pending'
  RETURNING r.* INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request changed. Refresh it before editing again.' USING errcode='40001';
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'service_request.work_from_home.updated','service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'from_date',p_from_date,'to_date',p_to_date));
  RETURN jsonb_build_object('id',v_request.id,'request_data',v_request.request_data,
    'reason',v_request.reason,'status',v_request.status,'updated_at',v_request.updated_at);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_cancel_my_work_from_home_request(
  p_tenant_id uuid,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_request public.service_requests%ROWTYPE;
  v_changed_at timestamptz := clock_timestamp();
BEGIN
  IF NOT public.is_live_session() OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'An active sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  SELECT r.* INTO v_request FROM public.service_requests r
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
    AND r.request_type='work_from_home' AND r.status='pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your pending Work From Home requests can be cancelled.' USING errcode='P0002';
  END IF;
  UPDATE public.service_requests r SET status='cancelled',resolved_by=auth.uid(),
    resolved_at=v_changed_at,resolution_note='Cancelled by employee',updated_at=v_changed_at
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
    AND r.request_type='work_from_home' AND r.status='pending'
  RETURNING r.* INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request changed. Refresh before cancelling it.' USING errcode='40001';
  END IF;
  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status,note,created_at
  ) VALUES (p_tenant_id,v_request.id,auth.uid(),'pending','cancelled','Cancelled by employee',v_changed_at);
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'service_request.work_from_home.cancelled','service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id));
  RETURN jsonb_build_object('id',v_request.id,'status',v_request.status,'resolved_at',v_request.resolved_at);
END
$function$;

-- The hosted database still exposes older reason-only WFH RPCs. Keep stale
-- callers from creating unstructured requests and route legacy cancellation
-- through the tenant-scoped workflow so its history and audit remain complete.
CREATE OR REPLACE FUNCTION public.employee_submit_remote_work_request(
  p_from date,p_to date,p_reason text,p_location text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth' AS $function$
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  RAISE EXCEPTION 'Use the structured Work From Home request form.' USING errcode='22023';
END
$function$;

CREATE OR REPLACE FUNCTION public.employee_update_pending_remote_work_request(
  p_id uuid,p_from date,p_to date,p_reason text,p_location text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth' AS $function$
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  RAISE EXCEPTION 'Edit this request in the structured Work From Home form.' USING errcode='22023';
END
$function$;

CREATE OR REPLACE FUNCTION public.employee_cancel_pending_remote_work_request(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth' AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  SELECT r.tenant_id INTO v_tenant_id FROM public.service_requests r
  WHERE r.id=p_id AND r.request_type='work_from_home';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your pending remote-work requests can be cancelled.' USING errcode='P0002';
  END IF;
  PERFORM public.hris_cancel_my_work_from_home_request(v_tenant_id,p_id);
  RETURN p_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_resolve_tenant_work_from_home_request(
  p_tenant_id uuid,p_request_id uuid,p_expected_status text,p_next_status text,p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_request public.service_requests%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_changed_at timestamptz := clock_timestamp();
BEGIN
  IF NOT public.is_live_session()
     OR NOT public.has_tenant_permission(p_tenant_id,'employees.manage') THEN
    RAISE EXCEPTION 'Employee-management permission in this active organization is required.' USING errcode='42501';
  END IF;
  IF p_expected_status IS NULL OR p_next_status IS NULL
     OR p_expected_status NOT IN ('pending','in_progress')
     OR p_next_status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Choose a supported Work From Home decision.' USING errcode='22023';
  END IF;
  IF p_next_status='rejected' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Enter a reason before rejecting this request.' USING errcode='22023';
  END IF;
  SELECT r.* INTO v_request FROM public.service_requests r
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.request_type='work_from_home'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work From Home request not found in this organization.' USING errcode='P0002';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'hris-wfh:'||p_tenant_id::text||':'||v_request.employee_id::text,0));
  IF v_request.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'This request changed. Refresh it before making another decision.' USING errcode='40001';
  END IF;
  IF p_next_status='approved' AND EXISTS (
    SELECT 1 FROM public.service_requests other
    WHERE other.tenant_id=p_tenant_id AND other.employee_id=v_request.employee_id
      AND other.id<>p_request_id AND other.request_type='work_from_home' AND other.status='approved'
      AND nullif(other.request_data->>'from_date','') IS NOT NULL
      AND nullif(other.request_data->>'to_date','') IS NOT NULL
      AND daterange((other.request_data->>'from_date')::date,(other.request_data->>'to_date')::date,'[]')
          && daterange((v_request.request_data->>'from_date')::date,(v_request.request_data->>'to_date')::date,'[]')
  ) THEN
    RAISE EXCEPTION 'Another approved Work From Home request overlaps these dates.' USING errcode='23505';
  END IF;

  UPDATE public.service_requests r SET status=p_next_status,resolved_by=auth.uid(),
    resolved_at=v_changed_at,resolution_note=v_note,updated_at=v_changed_at
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.status=p_expected_status
  RETURNING r.* INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request changed. Refresh it before making another decision.' USING errcode='40001';
  END IF;
  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status,note,created_at
  ) VALUES (p_tenant_id,v_request.id,auth.uid(),p_expected_status,p_next_status,v_note,v_changed_at);
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'service_request.work_from_home.'||p_next_status,'service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'previous_status',p_expected_status,'new_status',p_next_status));
  IF p_next_status='approved' THEN
    WITH changed_attendance AS (
      UPDATE public.attendance_records a SET work_mode='home',updated_at=v_changed_at
      WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_request.employee_id
        AND a.attendance_date BETWEEN (v_request.request_data->>'from_date')::date
          AND (v_request.request_data->>'to_date')::date
        AND a.work_mode='office' AND a.source='employee'
      RETURNING a.id,a.tenant_id,a.employee_id,a.attendance_date
    )
    INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
    SELECT auth.uid(),'attendance.work_from_home.approval_applied','attendance_record',a.id::text,
      jsonb_build_object('tenant_id',a.tenant_id,'employee_id',a.employee_id,
        'attendance_date',a.attendance_date,'service_request_id',v_request.id)
    FROM changed_attendance a;
  END IF;
  RETURN jsonb_build_object('id',v_request.id,'tenant_id',v_request.tenant_id,
    'employee_id',v_request.employee_id,'status',v_request.status,'resolved_at',v_request.resolved_at,
    'resolution_note',v_request.resolution_note);
END
$function$;

-- Preserve the generic review state machine for other request types. WFH must
-- use its approval decision so attendance reflects the approved schedule.
CREATE OR REPLACE FUNCTION public.hris_resolve_tenant_service_request(
  p_tenant_id uuid,p_request_id uuid,p_expected_status text,p_next_status text,p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_request public.service_requests%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_changed_at timestamptz;
BEGIN
  IF NOT public.is_live_session() OR NOT public.has_tenant_permission(p_tenant_id,'employees.manage') THEN
    RAISE EXCEPTION 'Employee-management permission in this active organization is required.' USING errcode='42501';
  END IF;
  IF p_expected_status IS NULL OR p_next_status IS NULL
     OR p_expected_status NOT IN ('pending','in_progress')
     OR p_next_status NOT IN ('in_progress','completed','rejected') THEN
    RAISE EXCEPTION 'Choose a supported service-request status change.' USING errcode='22023';
  END IF;
  IF p_next_status='completed' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Record the resolution outcome before completing this request.' USING errcode='22023';
  END IF;
  IF p_next_status='rejected' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Enter a reason before rejecting this request.' USING errcode='22023';
  END IF;
  IF NOT ((p_expected_status='pending' AND p_next_status IN ('in_progress','rejected'))
      OR (p_expected_status='in_progress' AND p_next_status IN ('completed','rejected'))) THEN
    RAISE EXCEPTION 'This service-request status transition is not allowed.' USING errcode='22023';
  END IF;
  SELECT r.* INTO v_request FROM public.service_requests r
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found in this organization.' USING errcode='P0002';
  END IF;
  IF v_request.request_type='work_from_home' THEN
    RAISE EXCEPTION 'Use the Work From Home approval action for this request.' USING errcode='22023';
  END IF;
  IF v_request.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'This request changed. Refresh it before making another decision.' USING errcode='40001';
  END IF;
  v_changed_at := clock_timestamp();
  UPDATE public.service_requests r SET status=p_next_status,
    resolved_by=CASE WHEN p_next_status IN ('completed','rejected') THEN auth.uid() ELSE NULL END,
    resolved_at=CASE WHEN p_next_status IN ('completed','rejected') THEN v_changed_at ELSE NULL END,
    resolution_note=CASE WHEN p_next_status IN ('completed','rejected') THEN v_note ELSE NULL END,
    updated_at=v_changed_at
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.status=p_expected_status
  RETURNING r.* INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request changed. Refresh it before making another decision.' USING errcode='40001';
  END IF;
  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status,note,created_at
  ) VALUES (p_tenant_id,v_request.id,auth.uid(),p_expected_status,p_next_status,
    CASE WHEN p_next_status IN ('completed','rejected') THEN v_note ELSE NULL END,v_changed_at);
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'service_request.status.'||p_next_status,'service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'previous_status',p_expected_status,'new_status',p_next_status));
  RETURN jsonb_build_object('id',v_request.id,'tenant_id',v_request.tenant_id,
    'employee_id',v_request.employee_id,'status',v_request.status,'resolved_by',v_request.resolved_by,
    'resolved_at',v_request.resolved_at,'resolution_note',v_request.resolution_note,'updated_at',v_request.updated_at);
END
$function$;

-- Employee monthly attendance includes approved future WFH schedules as planned
-- rows. A real attendance row always takes precedence over the synthetic row.
CREATE OR REPLACE FUNCTION public.hris_get_my_attendance_period(
  p_tenant_id uuid,p_month_start date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
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
  SELECT t.timezone INTO v_timezone FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  v_today := (now() AT TIME ZONE v_timezone)::date;
  IF p_month_start IS NULL OR extract(day FROM p_month_start)<>1
     OR p_month_start>date_trunc('month',v_today::timestamp)::date THEN
    RAISE EXCEPTION 'Choose a calendar month up to the current organization month.' USING errcode='22023';
  END IF;
  v_month_end := (p_month_start + interval '1 month')::date - 1;

  WITH attendance_rows AS (
    SELECT a.id::text AS id,a.attendance_date,a.check_in,a.check_out,a.work_mode,a.status,
      CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out>=a.check_in
        THEN round((extract(epoch FROM (a.check_out-a.check_in))/3600)::numeric,2) ELSE NULL END AS work_hours,
      NULL::text AS work_from_home_request_id,NULL::time AS work_from_home_start_time,
      NULL::time AS work_from_home_end_time,NULL::jsonb AS work_from_home_tasks,
      NULL::text AS work_from_home_location
    FROM public.attendance_records a
    WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee_id
      AND a.attendance_date BETWEEN p_month_start AND v_month_end
    UNION ALL
    SELECT 'wfh:'||r.id::text||':'||d.day::date::text,d.day::date,NULL::timestamptz,NULL::timestamptz,
      'home'::text,'scheduled'::text,NULL::numeric,r.id::text,
      nullif(r.request_data->>'start_time','')::time,nullif(r.request_data->>'end_time','')::time,
      r.request_data->'tasks',nullif(r.request_data->>'location','')
    FROM public.service_requests r
    CROSS JOIN LATERAL generate_series(
      greatest((r.request_data->>'from_date')::date,p_month_start)::timestamp,
      least((r.request_data->>'to_date')::date,v_month_end)::timestamp,interval '1 day'
    ) d(day)
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
      AND r.request_type='work_from_home' AND r.status='approved'
      AND nullif(r.request_data->>'from_date','') IS NOT NULL
      AND nullif(r.request_data->>'to_date','') IS NOT NULL
      AND (r.request_data->>'from_date')::date<=(r.request_data->>'to_date')::date
      AND (r.request_data->>'to_date')::date>=p_month_start
      AND (r.request_data->>'from_date')::date<=v_month_end
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records a
        WHERE a.tenant_id=r.tenant_id AND a.employee_id=r.employee_id AND a.attendance_date=d.day::date
      )
  )
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.attendance_date),'[]'::jsonb)
  INTO v_records FROM attendance_rows x;
  RETURN jsonb_build_object('tenant_id',p_tenant_id,'month_start',p_month_start,
    'month_end',v_month_end,'records',v_records);
END
$function$;

-- Employee/manager attendance detail includes approved WFH schedules, while
-- the aggregate report continues to count only actual attendance records.
CREATE OR REPLACE FUNCTION public.hris_get_tenant_attendance_data(
  p_tenant_id uuid,p_start date,p_end date,p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,p_report boolean DEFAULT FALSE
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth' AS $function$
BEGIN
  IF p_report THEN
    IF NOT public.has_tenant_permission(p_tenant_id,'reports.view') THEN
      RAISE EXCEPTION 'Tenant attendance report permission required.' USING errcode='42501';
    END IF;
  ELSIF NOT (public.has_tenant_permission(p_tenant_id,'attendance.view')
      OR public.has_tenant_permission(p_tenant_id,'attendance.manage')) THEN
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
        'working_hours',x.working_hours,'deviation',round((x.working_hours-x.office_hours)::numeric,2)
      ) ORDER BY x.employee_name)
      FROM (
        SELECT e.id employee_id,e.employee_number,e.full_name employee_name,d.name department_name,
          ds.title designation_title,t.name team_name,count(a.id)::integer attendance_days,
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
      WITH attendance_rows AS (
        SELECT a.id::text AS id,a.tenant_id,a.employee_id,a.attendance_date,a.check_in,a.check_out,
          a.work_mode,a.client_name,a.status,a.source,a.remarks,a.created_at,a.updated_at,
          e.employee_number,e.full_name,d.name department_name,ds.title designation_title,t.name team_name,
          CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out>=a.check_in
            THEN round((extract(epoch FROM (a.check_out-a.check_in))/3600)::numeric,2) ELSE NULL END work_hours,
          NULL::text work_from_home_request_id,NULL::time work_from_home_start_time,
          NULL::time work_from_home_end_time,NULL::jsonb work_from_home_tasks,
          NULL::text work_from_home_location
        FROM public.attendance_records a
        JOIN public.employees e ON e.id=a.employee_id AND e.tenant_id=p_tenant_id
        LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=p_tenant_id
        LEFT JOIN public.designations ds ON ds.id=e.designation_id AND ds.tenant_id=p_tenant_id
        LEFT JOIN public.teams t ON t.id=e.team_id AND t.tenant_id=p_tenant_id
        WHERE a.tenant_id=p_tenant_id AND a.attendance_date BETWEEN p_start AND p_end
        UNION ALL
        SELECT 'wfh:'||r.id::text||':'||d.day::date::text,r.tenant_id,r.employee_id,d.day::date,
          NULL::timestamptz,NULL::timestamptz,'home'::text,NULL::text,'scheduled'::text,
          'approved_work_from_home'::text,'Approved Work From Home',r.submitted_at,r.submitted_at,
          e.employee_number,e.full_name,dep.name department_name,ds.title designation_title,t.name team_name,
          NULL::numeric,r.id::text,nullif(r.request_data->>'start_time','')::time,
          nullif(r.request_data->>'end_time','')::time,r.request_data->'tasks',
          nullif(r.request_data->>'location','')
        FROM public.service_requests r
        CROSS JOIN LATERAL generate_series(
          greatest((r.request_data->>'from_date')::date,p_start)::timestamp,
          least((r.request_data->>'to_date')::date,p_end)::timestamp,interval '1 day'
        ) d(day)
        JOIN public.employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id
        LEFT JOIN public.departments dep ON dep.id=e.department_id AND dep.tenant_id=p_tenant_id
        LEFT JOIN public.designations ds ON ds.id=e.designation_id AND ds.tenant_id=p_tenant_id
        LEFT JOIN public.teams t ON t.id=e.team_id AND t.tenant_id=p_tenant_id
        WHERE r.tenant_id=p_tenant_id AND r.request_type='work_from_home' AND r.status='approved'
          AND nullif(r.request_data->>'from_date','') IS NOT NULL
          AND nullif(r.request_data->>'to_date','') IS NOT NULL
          AND (r.request_data->>'from_date')::date<=(r.request_data->>'to_date')::date
          AND (r.request_data->>'to_date')::date>=p_start AND (r.request_data->>'from_date')::date<=p_end
          AND NOT EXISTS (SELECT 1 FROM public.attendance_records a
            WHERE a.tenant_id=r.tenant_id AND a.employee_id=r.employee_id AND a.attendance_date=d.day::date)
      )
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.attendance_date DESC,x.full_name)
      FROM attendance_rows x
      WHERE (nullif(btrim(coalesce(p_search,'')),'') IS NULL
          OR x.full_name ILIKE '%'||btrim(p_search)||'%'
          OR x.employee_number ILIKE '%'||btrim(p_search)||'%')
        AND (nullif(btrim(coalesce(p_status,'')),'') IS NULL OR p_status='all' OR x.status=p_status)
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
END
$function$;

-- A real check-in on an approved WFH date carries the approved work mode into
-- the actual attendance row. Existing explicit client/field modes are retained.
CREATE OR REPLACE FUNCTION public.hris_employee_record_attendance_event(
  p_tenant_id uuid,p_event text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_attendance_date date;
  v_record public.attendance_records%rowtype;
  v_approved_wfh boolean := false;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  IF p_event NOT IN ('check_in','check_out') THEN
    RAISE EXCEPTION 'Choose check in or check out.' USING errcode='22000';
  END IF;
  SELECT t.timezone INTO v_timezone FROM public.tenants t
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
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'hris-wfh:'||p_tenant_id::text||':'||v_employee::text,0));
    SELECT EXISTS (
      SELECT 1 FROM public.service_requests r
      WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee
        AND r.request_type='work_from_home' AND r.status='approved'
        AND (r.request_data->>'from_date')::date<=v_attendance_date
        AND (r.request_data->>'to_date')::date>=v_attendance_date
    ) INTO v_approved_wfh;
    INSERT INTO public.attendance_records(
      tenant_id,employee_id,attendance_date,check_in,work_mode,source
    ) VALUES (
      p_tenant_id,v_employee,v_attendance_date,now(),
      CASE WHEN v_approved_wfh THEN 'home' ELSE 'office' END,'employee'
    ) ON CONFLICT (tenant_id,employee_id,attendance_date) DO NOTHING
    RETURNING * INTO v_record;
    IF NOT FOUND THEN
      SELECT a.* INTO v_record FROM public.attendance_records a
      WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee
        AND a.attendance_date=v_attendance_date FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance could not be recorded. Please retry.' USING errcode='40001';
      END IF;
      IF v_record.check_in IS NOT NULL THEN
        RAISE EXCEPTION 'You are already checked in today.' USING errcode='22000';
      END IF;
      IF v_record.check_out IS NOT NULL THEN
        RAISE EXCEPTION 'A check-out is already recorded today. Request a correction if it is wrong.' USING errcode='22000';
      END IF;
      UPDATE public.attendance_records a SET check_in=now(),
        work_mode=CASE WHEN v_approved_wfh AND a.work_mode='office' THEN 'home' ELSE a.work_mode END,
        updated_at=now()
      WHERE a.id=v_record.id RETURNING a.* INTO v_record;
    END IF;
  ELSE
    SELECT a.* INTO v_record FROM public.attendance_records a
    WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee
      AND a.attendance_date=v_attendance_date FOR UPDATE;
    IF NOT FOUND OR v_record.check_in IS NULL THEN
      RAISE EXCEPTION 'Check in before checking out.' USING errcode='22000';
    END IF;
    IF v_record.check_out IS NOT NULL THEN
      RAISE EXCEPTION 'You are already checked out today.' USING errcode='22000';
    END IF;
    IF now()<v_record.check_in THEN
      RAISE EXCEPTION 'Current time is earlier than the recorded check-in.' USING errcode='22000';
    END IF;
    UPDATE public.attendance_records a SET check_out=now(),updated_at=now()
    WHERE a.id=v_record.id RETURNING a.* INTO v_record;
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),CASE WHEN p_event='check_in' THEN 'attendance.web_check_in' ELSE 'attendance.web_check_out' END,
    'attendance_record',v_record.id::text,jsonb_build_object('tenant_id',p_tenant_id,
      'employee_id',v_employee,'attendance_date',v_attendance_date,'event',p_event));
  RETURN jsonb_build_object('id',v_record.id,'tenant_id',v_record.tenant_id,
    'employee_id',v_record.employee_id,'attendance_date',v_record.attendance_date,
    'check_in',v_record.check_in,'check_out',v_record.check_out,'work_mode',v_record.work_mode,'status',v_record.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_service_requests(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_service_requests(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_submit_my_work_from_home_request(uuid,date,date,time,time,jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_submit_my_work_from_home_request(uuid,date,date,time,time,jsonb,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_update_my_work_from_home_request(uuid,uuid,date,date,time,time,jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_update_my_work_from_home_request(uuid,uuid,date,date,time,time,jsonb,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_cancel_my_work_from_home_request(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_cancel_my_work_from_home_request(uuid,uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.hris_get_my_attendance_period(uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_attendance_period(uuid,date) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_get_tenant_attendance_data(uuid,date,date,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_attendance_data(uuid,date,date,text,text,boolean) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_employee_record_attendance_event(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_employee_record_attendance_event(uuid,text) TO authenticated,service_role;

COMMENT ON FUNCTION public.hris_submit_my_work_from_home_request(uuid,date,date,time,time,jsonb,text,text)
  IS 'Creates a tenant-scoped structured Work From Home request with a date range, time range, task list, optional location and reason.';
COMMENT ON FUNCTION public.hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text)
  IS 'Tenant-scoped manager approval/rejection for Work From Home; approved dates appear as scheduled attendance until actual punches exist.';

COMMIT;
