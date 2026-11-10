-- Complete the existing E06 attendance-correction and E11 movement contracts.
-- The migration reuses attendance_corrections, service_requests, their history,
-- and the existing private attendance-evidence bucket.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF to_regclass('public.attendance_corrections') IS NULL
    OR to_regclass('public.attendance_records') IS NULL
    OR to_regclass('public.service_requests') IS NULL
    OR to_regclass('public.service_request_status_history') IS NULL
    OR to_regclass('public.admin_audit_logs') IS NULL
    OR to_regclass('public.tenants') IS NULL
    OR to_regnamespace('private') IS NULL
    OR to_regclass('storage.objects') IS NULL
    OR to_regprocedure('storage.foldername(text)') IS NULL
    OR to_regprocedure('public.is_live_session()') IS NULL
    OR to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NULL
    OR to_regprocedure('public.has_tenant_permission(uuid,text)') IS NULL
    OR to_regprocedure('public.admin_save_attendance(uuid,date,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Attendance and movement parity dependencies are not installed; no changes made.';
  END IF;
END
$preflight$;

-- Employee evidence uploads use the exact owner/tenant/file UUID path emitted
-- by the UI. Keep the existing legacy owner-only policies intact.
DROP POLICY IF EXISTS attendance_evidence_employee_upload ON storage.objects;
CREATE POLICY attendance_evidence_employee_upload
  ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='attendance-evidence'
    AND public.is_live_session()
    AND split_part(name,'/',1)=(SELECT auth.uid())::text
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|doc|docx|jpg|jpeg|png)$'
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id::text=split_part(name,'/',2)
        AND t.is_active IS TRUE
        AND public.hris_own_employee_for_tenant(t.id) IS NOT NULL
    )
  );

-- The UI removes a newly uploaded file after a failed submission, and removes
-- the prior file after a successful replacement. Permit only owner cleanup of
-- unlinked objects; a saved correction's evidence remains protected.
DROP POLICY IF EXISTS attendance_evidence_employee_delete_unattached ON storage.objects;
CREATE POLICY attendance_evidence_employee_delete_unattached
  ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id='attendance-evidence'
    AND public.is_live_session()
    AND split_part(name,'/',1)=(SELECT auth.uid())::text
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|doc|docx|jpg|jpeg|png)$'
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id::text=split_part(name,'/',2)
        AND t.is_active IS TRUE
        AND public.hris_own_employee_for_tenant(t.id) IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.attendance_corrections c
      WHERE c.tenant_id::text=split_part(storage.objects.name,'/',2)
        AND c.evidence_path=storage.objects.name
    )
  );

-- Production already contains this policy table, but no versioned source
-- migration creates it. Make the disposable and fresh-install schema match
-- the hosted contract without changing existing policy values.
CREATE TABLE IF NOT EXISTS public.attendance_correction_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_can_edit_pending boolean NOT NULL DEFAULT false,
  employee_can_cancel_pending boolean NOT NULL DEFAULT false,
  evidence_required boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.attendance_correction_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_correction_settings FROM PUBLIC,anon,authenticated;

ALTER TABLE public.attendance_corrections
  ADD COLUMN IF NOT EXISTS correction_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS original_check_in timestamptz,
  ADD COLUMN IF NOT EXISTS original_check_out timestamptz,
  ADD COLUMN IF NOT EXISTS original_work_mode text,
  ADD COLUMN IF NOT EXISTS original_client_name text;

-- Client meetings are already reported as an attendance work mode, but the
-- hosted checks do not currently permit that value on writes. Preserve every
-- existing value and add the missing value needed by E06/E11.
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_work_mode_check;
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_work_mode_check
  CHECK (work_mode = ANY (ARRAY['office','home','client','field','client_meeting']::text[])) NOT VALID;
ALTER TABLE public.attendance_corrections
  DROP CONSTRAINT IF EXISTS attendance_corrections_requested_work_mode_check;
ALTER TABLE public.attendance_corrections
  ADD CONSTRAINT attendance_corrections_requested_work_mode_check
  CHECK (requested_work_mode IS NULL OR requested_work_mode = ANY (ARRAY['office','home','client','field','client_meeting']::text[])) NOT VALID;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.attendance_corrections'::regclass
      AND conname='attendance_corrections_categories_allowed'
  ) THEN
    ALTER TABLE public.attendance_corrections
      ADD CONSTRAINT attendance_corrections_categories_allowed
      CHECK (correction_categories <@ ARRAY['check_in_time','check_out_time','work_location']::text[])
      NOT VALID;
  END IF;
END
$constraint$;

CREATE OR REPLACE FUNCTION private.hris_attendance_correction_values(
  p_tenant_id uuid,p_employee_id uuid,p_payload jsonb,p_previous_evidence_path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_timezone text;
  v_date date;
  v_check_in_time time;
  v_check_out_time time;
  v_work_mode text := nullif(btrim(coalesce(p_payload->>'work_mode','')),'');
  v_client_name text := nullif(btrim(coalesce(p_payload->>'client_name','')),'');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_evidence_path text := coalesce(
    nullif(btrim(coalesce(p_payload->>'evidence_path','')),''),
    nullif(btrim(coalesce(p_previous_evidence_path,'')),'')
  );
  v_categories text[];
  v_evidence_required boolean := false;
  v_current public.attendance_records%rowtype;
  v_requested_check_in timestamptz;
  v_requested_check_out timestamptz;
  v_effective_check_in timestamptz;
  v_effective_check_out timestamptz;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'Attendance correction details are required.' USING errcode='22000';
  END IF;
  BEGIN
    v_date := nullif(p_payload->>'attendance_date','')::date;
    v_check_in_time := nullif(p_payload->>'check_in_time','')::time;
    v_check_out_time := nullif(p_payload->>'check_out_time','')::time;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Enter a valid attendance date and time.' USING errcode='22000';
  END;
  IF jsonb_typeof(p_payload->'correction_categories') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Choose at least one attendance correction category.' USING errcode='22000';
  END IF;
  SELECT array_agg(value ORDER BY ordinal)
  INTO v_categories
  FROM jsonb_array_elements_text(p_payload->'correction_categories') WITH ORDINALITY AS item(value,ordinal);
  IF coalesce(cardinality(v_categories),0)=0
     OR EXISTS (SELECT 1 FROM unnest(v_categories) AS category
       WHERE category NOT IN ('check_in_time','check_out_time','work_location'))
     OR cardinality(v_categories)<>(SELECT count(DISTINCT category) FROM unnest(v_categories) AS category) THEN
    RAISE EXCEPTION 'Choose supported attendance correction categories.' USING errcode='22000';
  END IF;
  IF v_date IS NULL OR v_reason IS NULL THEN
    RAISE EXCEPTION 'Attendance date and reason are required.' USING errcode='22000';
  END IF;
  IF char_length(v_reason)>2000 OR char_length(coalesce(v_client_name,''))>200 THEN
    RAISE EXCEPTION 'Attendance correction details exceed the allowed length.' USING errcode='22000';
  END IF;
  IF (('check_in_time'=ANY(v_categories)) IS DISTINCT FROM (v_check_in_time IS NOT NULL))
     OR (('check_out_time'=ANY(v_categories)) IS DISTINCT FROM (v_check_out_time IS NOT NULL))
     OR (('work_location'=ANY(v_categories)) IS DISTINCT FROM (v_work_mode IS NOT NULL)) THEN
    RAISE EXCEPTION 'Complete the fields selected for correction.' USING errcode='22000';
  END IF;
  IF v_work_mode IS NOT NULL AND v_work_mode NOT IN ('office','home','client','field','client_meeting') THEN
    RAISE EXCEPTION 'Choose a supported work location.' USING errcode='22000';
  END IF;
  IF v_work_mode IN ('client','client_meeting') AND v_client_name IS NULL THEN
    RAISE EXCEPTION 'Enter the client name for a client-location correction.' USING errcode='22000';
  END IF;
  IF v_work_mode NOT IN ('client','client_meeting') OR v_work_mode IS NULL THEN
    v_client_name := NULL;
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  SELECT a.* INTO v_current
  FROM public.attendance_records a
  WHERE a.tenant_id=p_tenant_id AND a.employee_id=p_employee_id AND a.attendance_date=v_date
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found for correction.' USING errcode='P0002';
  END IF;
  v_requested_check_in := CASE WHEN v_check_in_time IS NULL THEN NULL
    ELSE (v_date+v_check_in_time) AT TIME ZONE v_timezone END;
  v_requested_check_out := CASE WHEN v_check_out_time IS NULL THEN NULL
    ELSE (v_date+v_check_out_time) AT TIME ZONE v_timezone END;
  v_effective_check_in := coalesce(v_requested_check_in,v_current.check_in);
  v_effective_check_out := coalesce(v_requested_check_out,v_current.check_out);
  IF v_effective_check_in IS NOT NULL AND v_effective_check_out IS NOT NULL
     AND v_effective_check_out<=v_effective_check_in THEN
    RAISE EXCEPTION 'Check-out must be after check-in.' USING errcode='22000';
  END IF;

  SELECT coalesce(s.evidence_required,false) INTO v_evidence_required
  FROM public.attendance_correction_settings s WHERE s.tenant_id=p_tenant_id;
  v_evidence_required := coalesce(v_evidence_required,false);
  IF v_evidence_path IS NULL AND v_evidence_required THEN
    RAISE EXCEPTION 'Attach the supporting evidence required by this organization.' USING errcode='22000';
  END IF;
  IF v_evidence_path IS NOT NULL THEN
    IF v_evidence_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx?|png|jpe?g)$'
       OR (storage.foldername(v_evidence_path))[1] IS DISTINCT FROM auth.uid()::text
       OR (storage.foldername(v_evidence_path))[2] IS DISTINCT FROM p_tenant_id::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
         WHERE o.bucket_id='attendance-evidence' AND o.name=v_evidence_path) THEN
      RAISE EXCEPTION 'The attendance evidence file is not available to this employee.' USING errcode='42501';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'attendance_date',v_date,'reason',v_reason,'correction_categories',to_jsonb(v_categories),
    'requested_check_in',v_requested_check_in,'requested_check_out',v_requested_check_out,
    'requested_work_mode',v_work_mode,'client_name',v_client_name,'evidence_path',v_evidence_path,
    'original_check_in',v_current.check_in,'original_check_out',v_current.check_out,
    'original_work_mode',v_current.work_mode,'original_client_name',v_current.client_name
  );
END
$function$;
REVOKE ALL ON FUNCTION private.hris_attendance_correction_values(uuid,uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.hris_get_my_attendance_correction_context(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_policy jsonb;
  v_requests jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  SELECT t.timezone INTO v_timezone FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  SELECT jsonb_build_object(
    'employee_can_edit_pending',coalesce(s.employee_can_edit_pending,false),
    'employee_can_cancel_pending',coalesce(s.employee_can_cancel_pending,false),
    'evidence_required',coalesce(s.evidence_required,false)
  ) INTO v_policy
  FROM public.attendance_correction_settings s WHERE s.tenant_id=p_tenant_id;
  v_policy := coalesce(v_policy,jsonb_build_object(
    'employee_can_edit_pending',false,'employee_can_cancel_pending',false,'evidence_required',false
  ));
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'attendance_date',c.attendance_date,'correction_categories',c.correction_categories,
    'original_check_in',c.original_check_in,'original_check_out',c.original_check_out,
    'original_work_mode',c.original_work_mode,'original_client_name',c.original_client_name,
    'requested_check_in',c.requested_check_in,'requested_check_out',c.requested_check_out,
    'requested_work_mode',c.requested_work_mode,'client_name',c.client_name,
    'reason',c.reason,'status',c.status,'resolution_note',c.resolution_note,
    'evidence_path',c.evidence_path,'requested_at',c.requested_at,'resolved_at',c.resolved_at
  ) ORDER BY c.requested_at DESC,c.id),'[]'::jsonb)
  INTO v_requests
  FROM public.attendance_corrections c
  WHERE c.tenant_id=p_tenant_id AND c.employee_id=v_employee;
  RETURN jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee,'tenant_timezone',v_timezone,
    'policy',v_policy,'requests',coalesce(v_requests,'[]'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_employee_submit_attendance_correction(
  p_tenant_id uuid,p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid;
  v_values jsonb;
  v_request_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  v_values := private.hris_attendance_correction_values(p_tenant_id,v_employee,p_payload,NULL);
  INSERT INTO public.attendance_corrections(
    id,tenant_id,employee_id,attendance_date,correction_categories,
    original_check_in,original_check_out,original_work_mode,original_client_name,
    requested_check_in,requested_check_out,requested_work_mode,client_name,
    reason,status,requested_by,evidence_path
  ) VALUES (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_employee,(v_values->>'attendance_date')::date,
    ARRAY(SELECT jsonb_array_elements_text(v_values->'correction_categories')),
    nullif(v_values->>'original_check_in','')::timestamptz,
    nullif(v_values->>'original_check_out','')::timestamptz,
    nullif(v_values->>'original_work_mode',''),nullif(v_values->>'original_client_name',''),
    nullif(v_values->>'requested_check_in','')::timestamptz,
    nullif(v_values->>'requested_check_out','')::timestamptz,
    nullif(v_values->>'requested_work_mode',''),nullif(v_values->>'client_name',''),
    v_values->>'reason','pending',auth.uid(),nullif(v_values->>'evidence_path','')
  ) RETURNING id INTO v_request_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'attendance.correction.submitted','attendance_correction',v_request_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee,
      'attendance_date',v_values->>'attendance_date',
      'correction_categories',v_values->'correction_categories',
      'evidence_attached',nullif(v_values->>'evidence_path','') IS NOT NULL));
  RETURN v_request_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_employee_update_attendance_correction(
  p_tenant_id uuid,p_request_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid;
  v_request public.attendance_corrections%rowtype;
  v_can_edit boolean := false;
  v_values jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  SELECT coalesce(s.employee_can_edit_pending,false) INTO v_can_edit
  FROM public.attendance_correction_settings s WHERE s.tenant_id=p_tenant_id;
  IF NOT coalesce(v_can_edit,false) THEN
    RAISE EXCEPTION 'Employee editing of pending attendance corrections is disabled by organization policy.' USING errcode='42501';
  END IF;
  SELECT c.* INTO v_request FROM public.attendance_corrections c
  WHERE c.id=p_request_id AND c.tenant_id=p_tenant_id AND c.employee_id=v_employee
    AND c.status='pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your pending attendance corrections can be edited.' USING errcode='P0002';
  END IF;
  v_values := private.hris_attendance_correction_values(p_tenant_id,v_employee,p_payload,v_request.evidence_path);
  UPDATE public.attendance_corrections SET
    attendance_date=(v_values->>'attendance_date')::date,
    correction_categories=ARRAY(SELECT jsonb_array_elements_text(v_values->'correction_categories')),
    original_check_in=nullif(v_values->>'original_check_in','')::timestamptz,
    original_check_out=nullif(v_values->>'original_check_out','')::timestamptz,
    original_work_mode=nullif(v_values->>'original_work_mode',''),
    original_client_name=nullif(v_values->>'original_client_name',''),
    requested_check_in=nullif(v_values->>'requested_check_in','')::timestamptz,
    requested_check_out=nullif(v_values->>'requested_check_out','')::timestamptz,
    requested_work_mode=nullif(v_values->>'requested_work_mode',''),
    client_name=nullif(v_values->>'client_name',''),reason=v_values->>'reason',
    evidence_path=nullif(v_values->>'evidence_path',''),requested_at=clock_timestamp()
  WHERE id=p_request_id AND tenant_id=p_tenant_id AND employee_id=v_employee AND status='pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending correction changed before it could be updated.' USING errcode='40001';
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'attendance.correction.updated','attendance_correction',p_request_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'attendance_date',v_values->>'attendance_date'));
  RETURN jsonb_build_object('id',p_request_id,'success',true,'status','pending');
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_employee_cancel_attendance_correction(
  p_tenant_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid;
  v_can_cancel boolean := false;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  SELECT coalesce(s.employee_can_cancel_pending,false) INTO v_can_cancel
  FROM public.attendance_correction_settings s WHERE s.tenant_id=p_tenant_id;
  IF NOT coalesce(v_can_cancel,false) THEN
    RAISE EXCEPTION 'Employee cancellation of pending attendance corrections is disabled by organization policy.' USING errcode='42501';
  END IF;
  UPDATE public.attendance_corrections SET status='cancelled',resolved_by=auth.uid(),
    resolved_at=clock_timestamp(),resolution_note='Cancelled by employee'
  WHERE id=p_request_id AND tenant_id=p_tenant_id AND employee_id=v_employee AND status='pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your pending attendance corrections can be cancelled.' USING errcode='P0002';
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'attendance.correction.cancelled','attendance_correction',p_request_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee));
  RETURN jsonb_build_object('id',p_request_id,'success',true,'status','cancelled');
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_attendance_correction(
  p_id uuid,p_decision text,p_note text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_tenant uuid;
  v_request public.attendance_corrections%rowtype;
  v_current public.attendance_records%rowtype;
  v_record uuid;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active attendance management permission required.' USING errcode='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode='22000';
  END IF;
  IF char_length(coalesce(v_note,''))>1000 THEN
    RAISE EXCEPTION 'The attendance decision note is too long.' USING errcode='22000';
  END IF;
  IF p_decision='rejected' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Enter a reason before rejecting this attendance correction.' USING errcode='22000';
  END IF;
  SELECT c.* INTO v_request FROM public.attendance_corrections c
  WHERE c.id=p_id AND c.status='pending' FOR UPDATE;
  IF NOT FOUND OR NOT public.has_tenant_permission(v_request.tenant_id,'attendance.manage') THEN
    RAISE EXCEPTION 'Pending correction not found in authorized organization.' USING errcode='P0002';
  END IF;
  v_tenant := v_request.tenant_id;
  SELECT a.* INTO v_current FROM public.attendance_records a
  WHERE a.tenant_id=v_tenant AND a.employee_id=v_request.employee_id
    AND a.attendance_date=v_request.attendance_date FOR UPDATE;
  IF p_decision='approved' THEN
    v_record := public.admin_save_attendance(
      v_request.employee_id,v_request.attendance_date,
      jsonb_build_object(
        'check_in',coalesce(v_request.requested_check_in,v_current.check_in),
        'check_out',coalesce(v_request.requested_check_out,v_current.check_out),
        'work_mode',coalesce(v_request.requested_work_mode,v_current.work_mode,'office'),
        'client_name',coalesce(v_request.client_name,v_current.client_name,''),
        'status',coalesce(nullif(v_current.status,''),'present'),
        'remarks',coalesce(v_note,'Approved attendance correction')
      )
    );
  END IF;
  UPDATE public.attendance_corrections SET status=p_decision,resolved_by=auth.uid(),
    resolved_at=clock_timestamp(),resolution_note=v_note
  WHERE id=p_id AND tenant_id=v_tenant AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending correction changed during decision.' USING errcode='P0002'; END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'attendance.correction.'||p_decision,'attendance_correction',p_id::text,
    jsonb_build_object('attendance_record_id',v_record,'note',v_note,
      'original_check_in',v_request.original_check_in,'original_check_out',v_request.original_check_out,
      'requested_check_in',v_request.requested_check_in,'requested_check_out',v_request.requested_check_out));
  RETURN jsonb_build_object('success',true,'decision',p_decision,'attendance_record_id',v_record);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_submit_my_movement_request(
  p_tenant_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid;
  v_request public.service_requests%rowtype;
  v_movement_type text := nullif(btrim(coalesce(p_payload->>'movement_type','')),'');
  v_date date;
  v_from_date date;
  v_to_date date;
  v_departure time;
  v_return time;
  v_destination text;
  v_purpose text;
  v_client_name text;
  v_request_data jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'Movement request details are required.' USING errcode='22000';
  END IF;
  IF v_movement_type IS NULL OR v_movement_type NOT IN ('official','personal','client_meeting') THEN
    RAISE EXCEPTION 'Choose a supported movement type.' USING errcode='22000';
  END IF;
  v_purpose := nullif(btrim(coalesce(p_payload->>'purpose','')),'');
  IF v_purpose IS NULL THEN
    RAISE EXCEPTION 'Purpose is required.' USING errcode='22000';
  END IF;
  IF char_length(v_purpose)>2000 THEN
    RAISE EXCEPTION 'The movement purpose or remarks are too long.' USING errcode='22000';
  END IF;
  IF v_movement_type='client_meeting' THEN
    BEGIN
      v_from_date := nullif(p_payload->>'from_date','')::date;
      v_to_date := nullif(p_payload->>'to_date','')::date;
      v_departure := nullif(p_payload->>'start_time','')::time;
      v_return := nullif(p_payload->>'end_time','')::time;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Enter valid client-meeting dates, times, and client name.' USING errcode='22000';
    END;
    v_client_name := nullif(btrim(coalesce(p_payload->>'client_name','')),'');
    IF v_from_date IS NULL OR v_to_date IS NULL OR v_to_date<v_from_date
       OR v_departure IS NULL OR v_return IS NULL
       OR (v_from_date=v_to_date AND v_return<=v_departure) OR v_client_name IS NULL
       OR char_length(v_client_name)>200 OR char_length(coalesce(p_payload->>'remarks',''))>2000 THEN
      RAISE EXCEPTION 'Enter valid client-meeting dates, times, and client name.' USING errcode='22000';
    END IF;
    v_date := v_from_date;
    v_destination := v_client_name;
    v_request_data := jsonb_build_object(
      'form_version','e11_v1','movement_type','official','movement_category','client_meeting',
      'date',v_from_date,'from_date',v_from_date,'to_date',v_to_date,
      'departure_time',v_departure,'expected_return_time',v_return,
      'start_time',v_departure,'end_time',v_return,'destination',v_destination,
      'client_name',v_client_name,'purpose',v_purpose,
      'remarks',nullif(btrim(coalesce(p_payload->>'remarks','')),''),
      'returned_at',NULL
    );
  ELSE
    BEGIN
      v_date := nullif(p_payload->>'date','')::date;
      v_departure := nullif(p_payload->>'departure_time','')::time;
      v_return := nullif(p_payload->>'expected_return_time','')::time;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Enter a valid movement date, time range, and destination.' USING errcode='22000';
    END;
    v_destination := nullif(btrim(coalesce(p_payload->>'destination','')),'');
    IF v_date IS NULL OR v_departure IS NULL OR v_return IS NULL OR v_return<=v_departure
       OR v_destination IS NULL OR char_length(v_destination)>200 THEN
      RAISE EXCEPTION 'Enter a valid movement date, time range, and destination.' USING errcode='22000';
    END IF;
    v_request_data := jsonb_build_object(
      'form_version','e11_v1','movement_type',v_movement_type,'movement_category','movement',
      'date',v_date,'departure_time',v_departure,'expected_return_time',v_return,
      'destination',v_destination,'purpose',v_purpose,'returned_at',NULL
    );
  END IF;
  INSERT INTO public.service_requests(
    tenant_id,employee_id,request_type,reason,request_data,status,submitted_by,submitted_at
  ) VALUES (
    p_tenant_id,v_employee,'movement',v_purpose,v_request_data,'pending',auth.uid(),clock_timestamp()
  ) RETURNING * INTO v_request;
  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status
  ) VALUES(p_tenant_id,v_request.id,auth.uid(),NULL,'pending');
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'movement.requested','service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'movement_type',v_movement_type,
      'date',v_date,'destination',v_destination));
  RETURN jsonb_build_object('id',v_request.id,'tenant_id',p_tenant_id,'employee_id',v_employee,
    'request_type','movement','reason',v_request.reason,'request_data',v_request.request_data,
    'status',v_request.status,'submitted_at',v_request.submitted_at);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_resolve_tenant_movement_request(
  p_tenant_id uuid,p_request_id uuid,p_expected_status text,p_next_status text,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_request public.service_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_changed_at timestamptz;
BEGIN
  IF NOT public.is_live_session() OR NOT public.has_tenant_permission(p_tenant_id,'employees.manage') THEN
    RAISE EXCEPTION 'Employee-management permission in this active organization is required.' USING errcode='42501';
  END IF;
  IF p_expected_status IS DISTINCT FROM 'pending' OR p_next_status IS NULL
     OR p_next_status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Choose an allowed movement decision.' USING errcode='22023';
  END IF;
  IF p_next_status='rejected' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Enter a reason before rejecting this movement request.' USING errcode='22023';
  END IF;
  IF char_length(coalesce(v_note,''))>1000 THEN
    RAISE EXCEPTION 'The movement decision note is too long.' USING errcode='22023';
  END IF;
  SELECT r.* INTO v_request FROM public.service_requests r
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.request_type='movement'
    AND r.request_data->>'form_version'='e11_v1'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movement request not found in this organization.' USING errcode='P0002';
  END IF;
  IF v_request.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'This movement request changed. Refresh before deciding.' USING errcode='40001';
  END IF;
  v_changed_at := clock_timestamp();
  IF p_next_status='approved' AND v_request.request_data->>'movement_category'='client_meeting' THEN
    UPDATE public.attendance_records a SET work_mode='client_meeting',
      client_name=v_request.request_data->>'client_name',updated_at=v_changed_at
    WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_request.employee_id
      AND a.attendance_date BETWEEN (v_request.request_data->>'from_date')::date
        AND (v_request.request_data->>'to_date')::date
      AND a.work_mode IN ('office','home','client','field','client_meeting');
  END IF;
  UPDATE public.service_requests SET status=p_next_status,resolved_by=auth.uid(),
    resolved_at=v_changed_at,resolution_note=v_note,updated_at=v_changed_at
  WHERE id=p_request_id AND tenant_id=p_tenant_id AND status=p_expected_status
  RETURNING * INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This movement request changed. Refresh before deciding.' USING errcode='40001';
  END IF;
  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status,note,created_at
  ) VALUES(p_tenant_id,v_request.id,auth.uid(),p_expected_status,p_next_status,v_note,v_changed_at);
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'movement.request.'||p_next_status,'service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'movement_category',
      v_request.request_data->>'movement_category','note',v_note));
  RETURN jsonb_build_object('id',v_request.id,'tenant_id',v_request.tenant_id,
    'employee_id',v_request.employee_id,'status',v_request.status,'resolved_at',v_request.resolved_at,
    'resolution_note',v_request.resolution_note,'updated_at',v_request.updated_at);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_mark_my_movement_returned(
  p_tenant_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid;
  v_request public.service_requests%rowtype;
  v_returned_at timestamptz := clock_timestamp();
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  SELECT r.* INTO v_request FROM public.service_requests r
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee
    AND r.request_type='movement' AND r.request_data->>'form_version'='e11_v1'
  FOR UPDATE;
  IF NOT FOUND OR v_request.status<>'approved' THEN
    RAISE EXCEPTION 'Only your approved movement request can be marked returned.' USING errcode='P0002';
  END IF;
  IF nullif(v_request.request_data->>'returned_at','') IS NOT NULL THEN
    RAISE EXCEPTION 'This movement is already marked returned.' USING errcode='22000';
  END IF;
  UPDATE public.service_requests SET
    request_data=jsonb_set(v_request.request_data,'{returned_at}',to_jsonb(v_returned_at),true),
    updated_at=v_returned_at
  WHERE id=p_request_id AND tenant_id=p_tenant_id AND employee_id=v_employee
  RETURNING * INTO v_request;
  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status,note,created_at
  ) VALUES(p_tenant_id,p_request_id,auth.uid(),'approved','approved',
    'Employee marked movement returned at '||v_returned_at::text,v_returned_at);
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'movement.returned','service_request',p_request_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'returned_at',v_returned_at));
  RETURN jsonb_build_object('id',p_request_id,'status',v_request.status,
    'request_data',v_request.request_data,'returned_at',v_returned_at);
END
$function$;

-- Keep the approved client name visible on the employee's own monthly
-- attendance projection after an E11 client meeting is converted to an
-- attendance work mode. WFH schedule rows have no client name.
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
    SELECT a.id::text AS id,a.attendance_date,a.check_in,a.check_out,a.work_mode,
      a.client_name,a.status,
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
      'home'::text,NULL::text,'scheduled'::text,NULL::numeric,r.id::text,
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

REVOKE ALL ON FUNCTION public.hris_get_my_attendance_correction_context(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_employee_update_attendance_correction(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_employee_cancel_attendance_correction(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_resolve_attendance_correction(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_submit_my_movement_request(uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_resolve_tenant_movement_request(uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_mark_my_movement_returned(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_attendance_correction_context(uuid)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_employee_update_attendance_correction(uuid,uuid,jsonb)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_employee_cancel_attendance_correction(uuid,uuid)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_attendance_correction(uuid,text,text)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_submit_my_movement_request(uuid,jsonb)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_resolve_tenant_movement_request(uuid,uuid,text,text,text)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_mark_my_movement_returned(uuid,uuid)
  TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_get_my_attendance_period(uuid,date)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_attendance_period(uuid,date)
  TO authenticated,service_role;

COMMIT;
