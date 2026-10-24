-- Phase 12: employee-submitted learning completion with manager verification.
-- Evidence is optional until a program-level evidence requirement is approved.
-- Manager decisions use only the existing tenant learning.manage permission;
-- no manager/reporting-line relationship is present in the verified contract.
BEGIN;

ALTER TABLE public.learning_enrollments
  ADD COLUMN IF NOT EXISTS completion_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_evidence_path text,
  ADD COLUMN IF NOT EXISTS completion_evidence_name text,
  ADD COLUMN IF NOT EXISTS completion_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_return_reason text;

-- Replace the existing status allow-list (the base table uses the standard
-- learning_enrollments_status_check name) while preserving unrelated checks.
ALTER TABLE public.learning_enrollments
  DROP CONSTRAINT IF EXISTS learning_enrollments_status_check;
ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_completion_status_check
  CHECK (status IN ('requested','enrolled','rejected','pending_verification',
    'returned_for_correction','completed','cancelled')) NOT VALID;
ALTER TABLE public.learning_enrollments
  VALIDATE CONSTRAINT learning_enrollments_completion_status_check;

ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_completion_evidence_pair_check
  CHECK ((completion_evidence_path IS NULL) = (completion_evidence_name IS NULL)) NOT VALID;
ALTER TABLE public.learning_enrollments
  VALIDATE CONSTRAINT learning_enrollments_completion_evidence_pair_check;

CREATE UNIQUE INDEX IF NOT EXISTS learning_enrollments_tenant_id_id_key
  ON public.learning_enrollments(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_id_id_key
  ON public.employees(tenant_id,id);
-- Pending and returned submissions remain open learning assignments. Keep
-- the employee/program/session uniqueness guard active through verification.
DROP INDEX IF EXISTS public.learning_enrollments_open_employee_program_session_uidx;
CREATE UNIQUE INDEX learning_enrollments_open_employee_program_session_uidx
  ON public.learning_enrollments(employee_id,program_id,
    coalesce(session_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('requested','enrolled','pending_verification','returned_for_correction');
CREATE INDEX IF NOT EXISTS learning_enrollments_completion_queue_idx
  ON public.learning_enrollments(tenant_id,completion_submitted_at,id)
  WHERE status='pending_verification';

CREATE TABLE public.learning_completion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('submitted','resubmitted','verified','returned_for_correction')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  evidence_path text,
  evidence_name text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,id),
  CONSTRAINT learning_completion_events_enrollment_fk FOREIGN KEY (tenant_id,enrollment_id)
    REFERENCES public.learning_enrollments(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX learning_completion_events_enrollment_idx
  ON public.learning_completion_events(tenant_id,enrollment_id,created_at,id);

CREATE TABLE public.learning_completion_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  recipient_employee_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('verified','returned_for_correction')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT learning_completion_notifications_employee_fk FOREIGN KEY (tenant_id,recipient_employee_id)
    REFERENCES public.employees(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT learning_completion_notifications_enrollment_fk FOREIGN KEY (tenant_id,enrollment_id)
    REFERENCES public.learning_enrollments(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT learning_completion_notifications_event_fk FOREIGN KEY (tenant_id,event_id)
    REFERENCES public.learning_completion_events(tenant_id,id) ON DELETE CASCADE,
  UNIQUE (tenant_id,recipient_employee_id,event_id)
);
CREATE INDEX learning_completion_notifications_employee_idx
  ON public.learning_completion_notifications(tenant_id,recipient_employee_id,created_at DESC,id DESC);

ALTER TABLE public.learning_completion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_completion_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_completion_events,public.learning_completion_notifications
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.learning_completion_notifications TO authenticated;
CREATE POLICY learning_completion_notifications_owner_read
  ON public.learning_completion_notifications FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND recipient_employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.is_active IS TRUE));

CREATE OR REPLACE FUNCTION public.hris_get_my_learning_completion_data(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_enrollments jsonb;
  v_notifications jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'status',e.status,'completion_submitted_at',e.completion_submitted_at,
    'completion_evidence_name',e.completion_evidence_name,
    'completion_verified_at',e.completion_verified_at,
    'completion_verified_by',e.completion_verified_by,
    'completion_verified_by_name',reviewer.full_name,
    'completion_return_reason',e.completion_return_reason,
    'completion_history',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'event_type',ce.event_type,'reason',ce.reason,'evidence_name',ce.evidence_name,
        'created_at',ce.created_at
      ) ORDER BY ce.created_at,ce.id)
      FROM public.learning_completion_events ce
      WHERE ce.tenant_id=e.tenant_id AND ce.enrollment_id=e.id
    ),'[]'::jsonb)
  ) ORDER BY e.created_at DESC,e.id),'[]'::jsonb)
    INTO v_enrollments
  FROM public.learning_enrollments e
  LEFT JOIN public.employees reviewer
    ON reviewer.tenant_id=e.tenant_id AND reviewer.user_id=e.completion_verified_by
  WHERE e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'kind',n.kind,'enrollment_id',n.enrollment_id,
    'program_title',p.title,'created_at',n.created_at
  ) ORDER BY n.created_at DESC,n.id DESC),'[]'::jsonb)
    INTO v_notifications
  FROM public.learning_completion_notifications n
  JOIN public.learning_enrollments e ON e.tenant_id=n.tenant_id AND e.id=n.enrollment_id
  JOIN public.learning_programs p ON p.tenant_id=e.tenant_id AND p.id=e.program_id
  WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id;

  RETURN jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'enrollments',coalesce(v_enrollments,'[]'::jsonb),
    'notifications',coalesce(v_notifications,'[]'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_learning_completion_queue(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'employee_id',e.employee_id,'employee_number',em.employee_number,
    'employee_name',em.full_name,'program_id',p.id,'program_title',p.title,
    'session_id',e.session_id,'submitted_at',e.completion_submitted_at,
    'evidence_path',e.completion_evidence_path,'evidence_name',e.completion_evidence_name
  ) ORDER BY e.completion_submitted_at,e.id),'[]'::jsonb)
    INTO v_items
  FROM public.learning_enrollments e
  JOIN public.employees em ON em.tenant_id=e.tenant_id AND em.id=e.employee_id
  JOIN public.learning_programs p ON p.tenant_id=e.tenant_id AND p.id=e.program_id
  WHERE e.tenant_id=p_tenant_id AND e.status='pending_verification';
  RETURN v_items;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_employee_submit_learning_completion(
  p_tenant_id uuid,p_enrollment_id uuid,p_evidence_path text DEFAULT NULL,p_evidence_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_enrollment public.learning_enrollments%ROWTYPE;
  v_event_id uuid;
  v_mime text;
  v_size bigint;
  v_event_type text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF (p_evidence_path IS NULL) <> (p_evidence_name IS NULL)
     OR p_evidence_name IS NOT NULL AND (length(p_evidence_name)<1 OR length(p_evidence_name)>255
       OR position('/' in p_evidence_name)>0 OR position(chr(92) in p_evidence_name)>0)
     OR p_evidence_path IS NOT NULL AND (
       length(p_evidence_path)>700
       OR p_evidence_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
       OR (storage.foldername(p_evidence_path))[1]<>auth.uid()::text
       OR (storage.foldername(p_evidence_path))[2]<>p_tenant_id::text
       OR (storage.foldername(p_evidence_path))[3]<>p_enrollment_id::text
     ) THEN
    RAISE EXCEPTION 'Choose a PDF, PNG, or JPEG evidence file up to 5 MB.' USING errcode='22023';
  END IF;

  SELECT e.* INTO v_enrollment FROM public.learning_enrollments e
  WHERE e.id=p_enrollment_id AND e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id
  FOR UPDATE;
  IF NOT FOUND OR v_enrollment.status NOT IN ('enrolled','returned_for_correction') THEN
    RAISE EXCEPTION 'Only your active or returned learning assignments can be submitted for verification.' USING errcode='42501';
  END IF;
  IF p_evidence_path IS NOT NULL THEN
    SELECT o.metadata->>'mimetype',
      CASE WHEN coalesce(o.metadata->>'size','') ~ '^[0-9]+$' THEN (o.metadata->>'size')::bigint ELSE NULL END
      INTO v_mime,v_size FROM storage.objects o
      WHERE o.bucket_id='learning-completion-evidence' AND o.name=p_evidence_path;
    IF NOT FOUND OR v_mime NOT IN ('application/pdf','image/png','image/jpeg')
       OR v_size IS NULL OR v_size<1 OR v_size>5242880
       OR lower(p_evidence_name) !~ (CASE v_mime WHEN 'application/pdf' THEN '\.pdf$'
         WHEN 'image/png' THEN '\.png$' ELSE '\.(jpg|jpeg)$' END) THEN
      RAISE EXCEPTION 'The uploaded evidence is unavailable or does not match its file type and size.' USING errcode='22023';
    END IF;
  END IF;

  v_event_type := CASE WHEN v_enrollment.status='returned_for_correction' THEN 'resubmitted' ELSE 'submitted' END;
  UPDATE public.learning_enrollments e SET status='pending_verification',
    completion_submitted_at=clock_timestamp(),completion_evidence_path=p_evidence_path,
    completion_evidence_name=p_evidence_name,completion_return_reason=NULL,
    completion_verified_at=NULL,completion_verified_by=NULL,completed_at=NULL,updated_at=clock_timestamp()
  WHERE e.id=v_enrollment.id AND e.tenant_id=p_tenant_id;
  INSERT INTO public.learning_completion_events(
    tenant_id,enrollment_id,event_type,actor_user_id,evidence_path,evidence_name
  ) VALUES (p_tenant_id,v_enrollment.id,v_event_type,auth.uid(),p_evidence_path,p_evidence_name)
  RETURNING id INTO v_event_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'learning.completion.'||v_event_type,'learning_enrollment',v_enrollment.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,'event_id',v_event_id,
      'has_evidence',p_evidence_path IS NOT NULL));
  RETURN jsonb_build_object('id',v_enrollment.id,'status','pending_verification',
    'submitted_at',clock_timestamp(),'event_id',v_event_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_resolve_learning_completion(
  p_tenant_id uuid,p_enrollment_id uuid,p_decision text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_enrollment public.learning_enrollments%ROWTYPE;
  v_event_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_decision_at timestamptz := clock_timestamp();
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('verified','returned_for_correction')
     OR p_reason IS NOT NULL AND length(p_reason)>1000
     OR p_decision='returned_for_correction' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Choose Verify or Return for Correction and provide a reason when returning.' USING errcode='22023';
  END IF;
  SELECT e.* INTO v_enrollment FROM public.learning_enrollments e
  WHERE e.id=p_enrollment_id AND e.tenant_id=p_tenant_id AND e.status='pending_verification'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This completion is no longer pending verification. Refresh the queue.' USING errcode='P0002';
  END IF;
  v_status := CASE WHEN p_decision='verified' THEN 'completed' ELSE 'returned_for_correction' END;
  UPDATE public.learning_enrollments e SET status=v_status,
    completed_at=CASE WHEN v_status='completed' THEN v_decision_at ELSE NULL END,
    completion_verified_at=CASE WHEN v_status='completed' THEN v_decision_at ELSE NULL END,
    completion_verified_by=CASE WHEN v_status='completed' THEN auth.uid() ELSE NULL END,
    completion_return_reason=CASE WHEN v_status='returned_for_correction' THEN v_reason ELSE NULL END,
    resolution_note=CASE WHEN v_status='returned_for_correction' THEN v_reason ELSE e.resolution_note END,
    updated_at=v_decision_at
  WHERE e.id=v_enrollment.id AND e.tenant_id=p_tenant_id;
  INSERT INTO public.learning_completion_events(
    tenant_id,enrollment_id,event_type,actor_user_id,reason,evidence_path,evidence_name,created_at
  ) VALUES (p_tenant_id,v_enrollment.id,p_decision,auth.uid(),v_reason,
    v_enrollment.completion_evidence_path,v_enrollment.completion_evidence_name,v_decision_at)
  RETURNING id INTO v_event_id;
  INSERT INTO public.learning_completion_notifications(
    tenant_id,recipient_employee_id,enrollment_id,event_id,kind
  ) VALUES (p_tenant_id,v_enrollment.employee_id,v_enrollment.id,v_event_id,p_decision);
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'learning.completion.'||p_decision,'learning_enrollment',v_enrollment.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_enrollment.employee_id,
      'event_id',v_event_id,'reason',v_reason));
  RETURN jsonb_build_object('id',v_enrollment.id,'status',v_status,
    'completed_at',CASE WHEN v_status='completed' THEN v_decision_at ELSE NULL END,
    'verified_by',CASE WHEN v_status='completed' THEN auth.uid() ELSE NULL END,
    'event_id',v_event_id);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_learning_completion_data(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_get_learning_completion_queue(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_employee_submit_learning_completion(uuid,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_resolve_learning_completion(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_learning_completion_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_get_learning_completion_queue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_learning_completion(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_resolve_learning_completion(uuid,uuid,text,text) TO authenticated;

DROP POLICY IF EXISTS learning_completion_evidence_insert ON storage.objects;
CREATE POLICY learning_completion_evidence_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='learning-completion-evidence' AND public.is_live_session()
    AND (storage.foldername(storage.objects.name))[1]=(SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.tenants t
      JOIN public.learning_enrollments e ON e.tenant_id=t.id
      WHERE t.id::text=(storage.foldername(storage.objects.name))[2] AND t.is_active IS TRUE
        AND e.id::text=(storage.foldername(storage.objects.name))[3]
        AND e.employee_id=public.hris_own_employee_for_tenant(t.id)
        AND e.status IN ('enrolled','returned_for_correction')));
DROP POLICY IF EXISTS learning_completion_evidence_read ON storage.objects;
CREATE POLICY learning_completion_evidence_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='learning-completion-evidence' AND public.is_live_session()
    AND EXISTS (SELECT 1 FROM public.learning_enrollments e
      WHERE e.tenant_id::text=(storage.foldername(storage.objects.name))[2]
        AND e.id::text=(storage.foldername(storage.objects.name))[3]
        AND e.completion_evidence_path=storage.objects.name
        AND (e.employee_id=public.hris_own_employee_for_tenant(e.tenant_id)
          OR public.has_tenant_permission(e.tenant_id,'learning.manage'))));
DROP POLICY IF EXISTS learning_completion_evidence_delete_unattached ON storage.objects;
CREATE POLICY learning_completion_evidence_delete_unattached ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='learning-completion-evidence' AND public.is_live_session()
    AND (storage.foldername(storage.objects.name))[1]=(SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.tenants t
      WHERE t.id::text=(storage.foldername(storage.objects.name))[2] AND t.is_active IS TRUE
        AND public.hris_own_employee_for_tenant(t.id) IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.learning_enrollments e
      WHERE e.completion_evidence_path=storage.objects.name));

COMMIT;
