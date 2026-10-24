-- Let authorized recruitment managers persist internal notes on an existing
-- interview record without exposing the private field to candidate APIs.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_candidate_interview_responses(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
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
    'panel_notes',i.panel_notes
  ) ORDER BY i.scheduled_at DESC,i.id),'[]'::jsonb)
  INTO v_rows
  FROM public.interviews i
  JOIN public.job_applications a ON a.id=i.application_id AND a.tenant_id=p_tenant_id
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE i.status='scheduled';
  RETURN v_rows;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_save_candidate_interview_panel_notes(
  p_tenant_id uuid,
  p_interview_id uuid,
  p_panel_notes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_interview_id uuid;
  v_notes text := NULLIF(btrim(COALESCE(p_panel_notes,'')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active=true)
     OR NOT public.has_tenant_permission(p_tenant_id,'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode='42501';
  END IF;
  IF length(COALESCE(v_notes,'')) > 4000 THEN
    RAISE EXCEPTION 'Interview notes must be 4,000 characters or fewer.' USING errcode='22023';
  END IF;

  SELECT i.id INTO v_interview_id
  FROM public.interviews i
  JOIN public.job_applications a ON a.id=i.application_id AND a.tenant_id=p_tenant_id
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE i.id=p_interview_id AND i.status='scheduled'
  FOR UPDATE OF i;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scheduled interview was not found in this organization.' USING errcode='P0002';
  END IF;

  UPDATE public.interviews i SET panel_notes=v_notes WHERE i.id=v_interview_id;
  RETURN jsonb_build_object('success',true,'interview_id',v_interview_id,'panel_notes',v_notes);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_candidate_interview_responses(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hris_save_candidate_interview_panel_notes(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hris_get_candidate_interview_responses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_save_candidate_interview_panel_notes(uuid,uuid,text) TO authenticated;

COMMIT;
