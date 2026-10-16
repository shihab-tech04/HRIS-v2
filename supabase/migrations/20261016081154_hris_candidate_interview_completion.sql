-- Persist the existing Candidate integration stage after a recruiter records
-- completion of a confirmed interview.
BEGIN;

ALTER TABLE public.candidate_application_stage_history
  DROP CONSTRAINT IF EXISTS candidate_application_stage_history_stage_check;
ALTER TABLE public.candidate_application_stage_history
  ADD CONSTRAINT candidate_application_stage_history_stage_check
  CHECK (stage = ANY (ARRAY[
    'draft','applied','submitted','under_review','screening','shortlisted',
    'assessment','assessment_pending','interview','interview_scheduled',
    'interview_completed','final_review','offer','offer_extended',
    'offer_accepted','offer_declined','hired','rejected','withdrawn'
  ]::text[])) NOT VALID;
ALTER TABLE public.candidate_application_stage_history
  VALIDATE CONSTRAINT candidate_application_stage_history_stage_check;

CREATE OR REPLACE FUNCTION public.hris_complete_candidate_interview(
  p_tenant_id uuid,
  p_interview_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application_id uuid;
  v_interview_status text;
  v_candidate_response text;
  v_application_stage text;
  v_history_id uuid;
  v_created_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants t
       WHERE t.id=p_tenant_id AND t.is_active=true
     )
     OR NOT public.has_tenant_permission(p_tenant_id,'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode='42501';
  END IF;

  SELECT i.application_id,i.status,i.candidate_response,a.stage
    INTO v_application_id,v_interview_status,v_candidate_response,v_application_stage
  FROM public.interviews i
  JOIN public.job_applications a ON a.id=i.application_id AND a.tenant_id=p_tenant_id
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE i.id=p_interview_id
  FOR UPDATE OF i,a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interview was not found in this organization.' USING errcode='P0002';
  END IF;

  IF v_interview_status='completed' THEN
    RETURN jsonb_build_object(
      'success',true,'changed',false,'interview_id',p_interview_id,
      'status','completed','stage',v_application_stage
    );
  END IF;

  IF v_interview_status IS DISTINCT FROM 'scheduled'
     OR v_candidate_response IS DISTINCT FROM 'confirmed'
     OR v_application_stage IS DISTINCT FROM 'interview_scheduled' THEN
    RAISE EXCEPTION 'Only a confirmed scheduled interview can be marked complete.' USING errcode='22023';
  END IF;

  UPDATE public.interviews i SET status='completed'
  WHERE i.id=p_interview_id;
  UPDATE public.job_applications a
  SET stage='interview_completed',updated_at=now()
  WHERE a.id=v_application_id AND a.tenant_id=p_tenant_id;

  INSERT INTO public.candidate_application_stage_history (
    id,application_id,stage,note,actor_type,actor_user_id,created_at
  ) VALUES (
    gen_random_uuid(),v_application_id,'interview_completed',
    'Interview completed. The application is under evaluation.',
    'recruitment',auth.uid(),now()
  ) RETURNING id,created_at INTO v_history_id,v_created_at;

  RETURN jsonb_build_object(
    'success',true,'changed',true,'interview_id',p_interview_id,
    'status','completed','stage','interview_completed',
    'history_id',v_history_id,'created_at',v_created_at
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_candidate_interview_responses(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active=true)
     OR NOT public.has_tenant_permission(p_tenant_id,'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',i.id,'application_id',a.id,'candidate_name',a.full_name,
    'candidate_email',a.email,'job_title',j.title,'round_name',i.interview_type,
    'scheduled_at',i.scheduled_at,'duration_minutes',i.duration_minutes,'timezone',i.timezone,
    'location_or_link',i.location_or_link,'candidate_response',i.candidate_response,
    'candidate_response_note',i.candidate_response_note,
    'candidate_proposed_times',i.candidate_proposed_times,
    'candidate_responded_at',i.candidate_responded_at,
    'panel_notes',i.panel_notes,'interview_status',i.status
  ) ORDER BY i.scheduled_at DESC,i.id),'[]'::jsonb)
  INTO v_rows
  FROM public.interviews i
  JOIN public.job_applications a ON a.id=i.application_id AND a.tenant_id=p_tenant_id
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE i.status IN ('scheduled','completed');
  RETURN v_rows;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_save_candidate_interview_panel_notes(
  p_tenant_id uuid,
  p_interview_id uuid,
  p_panel_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_interview_id uuid;
  v_notes text := NULLIF(btrim(COALESCE(p_panel_notes,'')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active=true)
     OR NOT public.has_tenant_permission(p_tenant_id,'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode='42501';
  END IF;
  IF length(COALESCE(v_notes,''))>4000 THEN
    RAISE EXCEPTION 'Interview notes must be 4,000 characters or fewer.' USING errcode='22023';
  END IF;

  SELECT i.id INTO v_interview_id
  FROM public.interviews i
  JOIN public.job_applications a ON a.id=i.application_id AND a.tenant_id=p_tenant_id
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE i.id=p_interview_id AND i.status IN ('scheduled','completed')
  FOR UPDATE OF i;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interview was not found in this organization.' USING errcode='P0002';
  END IF;

  UPDATE public.interviews i SET panel_notes=v_notes WHERE i.id=v_interview_id;
  RETURN jsonb_build_object('success',true,'interview_id',v_interview_id,'panel_notes',v_notes);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_complete_candidate_interview(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_get_candidate_interview_responses(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_save_candidate_interview_panel_notes(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_complete_candidate_interview(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_get_candidate_interview_responses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_save_candidate_interview_panel_notes(uuid,uuid,text) TO authenticated;

COMMIT;
