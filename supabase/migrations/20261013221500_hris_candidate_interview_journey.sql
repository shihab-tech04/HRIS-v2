-- Tenant-scoped scheduling and candidate response for the existing Interviews UI.
-- Interview records remain private behind these RPCs; no direct table grants are added.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.interviews FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.hris_schedule_candidate_interview(
  p_tenant_id uuid,
  p_application_id uuid,
  p_round_name text,
  p_format text,
  p_scheduled_at timestamp without time zone,
  p_duration_minutes integer,
  p_location_or_link text DEFAULT NULL,
  p_panel_members text[] DEFAULT '{}',
  p_instructions text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_interview_id uuid;
  v_application public.job_applications%ROWTYPE;
  v_round text := NULLIF(btrim(COALESCE(p_round_name,'')), '');
  v_format text := NULLIF(btrim(COALESCE(p_format,'')), '');
  v_location text := NULLIF(btrim(COALESCE(p_location_or_link,'')), '');
  v_panel text[];
  v_timezone text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT public.has_tenant_permission(p_tenant_id,'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT COALESCE(NULLIF(t.timezone,''),'UTC') INTO v_timezone
  FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active=true;
  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active organization not found.' USING errcode='P0002';
  END IF;
  IF v_round IS NULL OR length(v_round)>120
     OR v_format IS NULL OR v_format NOT IN ('Video Call','In-person','Phone Call')
     OR p_scheduled_at IS NULL OR p_scheduled_at<=(now() AT TIME ZONE v_timezone)
     OR p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 480 THEN
    RAISE EXCEPTION 'Enter a valid interview round, format, future date and duration.' USING errcode='22023';
  END IF;
  IF v_format='Video Call' AND (v_location IS NULL OR v_location !~* '^https://') THEN
    RAISE EXCEPTION 'Enter a secure video meeting link.' USING errcode='22023';
  ELSIF v_format='In-person' AND v_location IS NULL THEN
    RAISE EXCEPTION 'Enter the interview location.' USING errcode='22023';
  END IF;
  IF COALESCE(array_length(p_panel_members,1),0)>20
     OR EXISTS (SELECT 1 FROM unnest(COALESCE(p_panel_members,'{}')) x WHERE length(btrim(x))>120) THEN
    RAISE EXCEPTION 'Review the panel member names and try again.' USING errcode='22023';
  END IF;
  SELECT COALESCE(array_agg(unique_members.name ORDER BY unique_members.first_position), '{}')
    INTO v_panel
  FROM (
    SELECT btrim(m.name) AS name,min(m.position) AS first_position
    FROM unnest(COALESCE(p_panel_members,'{}')) WITH ORDINALITY AS m(name,position)
    WHERE btrim(m.name)<>''
    GROUP BY btrim(m.name)
  ) unique_members;
  IF p_instructions IS NOT NULL AND length(p_instructions)>4000 THEN
    RAISE EXCEPTION 'Interview instructions are too long.' USING errcode='22023';
  END IF;

  SELECT a.* INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE a.id=p_application_id AND a.tenant_id=p_tenant_id
    AND a.stage NOT IN ('withdrawn','rejected','offer_extended','offer_accepted','offer_declined','hired');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found in this organization or is no longer active.' USING errcode='P0002';
  END IF;

  -- Serialize invitations for one application so concurrent recruiter requests
  -- cannot create duplicate active slots. Direct table writes remain revoked.
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text),hashtext(p_application_id::text));
  -- A new invitation is permitted after a candidate asks to reschedule. Preserve
  -- the prior response on its cancelled row for audit and candidate history.
  IF EXISTS (
    SELECT 1 FROM public.interviews i
    WHERE i.application_id=p_application_id AND i.status='scheduled'
      AND i.candidate_response IN ('invited','confirmed')
  ) THEN
    RAISE EXCEPTION 'An interview invitation is already active for this application.' USING errcode='23505';
  END IF;
  UPDATE public.interviews i SET status='cancelled'
  WHERE i.application_id=p_application_id AND i.status='scheduled'
    AND i.candidate_response='reschedule_requested';

  INSERT INTO public.interviews(
    id,application_id,scheduled_at,interview_type,location_or_link,panel_notes,
    status,created_by,candidate_response,duration_minutes,timezone,instructions,panel_members
  ) VALUES (
    gen_random_uuid(),p_application_id,p_scheduled_at AT TIME ZONE v_timezone,
    v_round || ' — ' || v_format,v_location,NULL,
    'scheduled',auth.uid(),'invited',p_duration_minutes,
    v_timezone,
    NULLIF(btrim(COALESCE(p_instructions,'')),''),v_panel
  ) RETURNING id INTO v_interview_id;

  UPDATE public.job_applications SET stage='interview_scheduled',updated_at=now()
  WHERE id=p_application_id AND tenant_id=p_tenant_id;
  INSERT INTO public.candidate_application_stage_history(
    id,application_id,stage,note,actor_type,actor_user_id,created_at
  ) VALUES (
    gen_random_uuid(),p_application_id,'interview_scheduled',
    'An interview invitation is ready for your response.','recruitment',auth.uid(),now()
  );
  RETURN jsonb_build_object('interview_id',v_interview_id,'application_id',p_application_id,'status','scheduled','timezone',v_timezone);
END
$function$;

CREATE OR REPLACE FUNCTION public.candidate_respond_interview(
  p_interview_id uuid,
  p_response text,
  p_reason text DEFAULT NULL,
  p_proposed_times text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_tenant_id uuid;
  v_updated uuid;
  v_reason text := NULLIF(btrim(COALESCE(p_reason,'')), '');
  v_times text := NULLIF(btrim(COALESCE(p_proposed_times,'')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Candidate sign in required.' USING errcode='42501';
  END IF;
  SELECT cp.tenant_id INTO v_tenant_id FROM public.candidate_profiles cp
  WHERE cp.user_id=auth.uid() AND cp.profile_status='active';
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Active candidate account required.' USING errcode='42501';
  END IF;
  IF p_response IS NULL OR p_response NOT IN ('confirmed','declined','reschedule_requested')
     OR (p_response='reschedule_requested' AND (v_reason IS NULL OR v_times IS NULL))
     OR length(COALESCE(v_reason,''))>2000 OR length(COALESCE(v_times,''))>2000 THEN
    RAISE EXCEPTION 'Enter a valid response and the requested reschedule details.' USING errcode='22023';
  END IF;
  UPDATE public.interviews i SET
    candidate_response=p_response,
    candidate_response_note=v_reason,
    candidate_proposed_times=CASE WHEN p_response='reschedule_requested' THEN v_times ELSE NULL END,
    candidate_responded_at=now()
  FROM public.job_applications a
  WHERE i.id=p_interview_id AND i.application_id=a.id
    AND a.candidate_user_id=auth.uid() AND a.tenant_id=v_tenant_id
    AND i.status='scheduled' AND i.candidate_response='invited'
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id=a.job_id AND j.tenant_id=v_tenant_id)
  RETURNING i.id INTO v_updated;
  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'Open interview invitation not found for this candidate.' USING errcode='P0002';
  END IF;
  RETURN jsonb_build_object('success',true,'response',p_response,'interview_id',v_updated);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_candidate_interview_responses(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
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
    'candidate_responded_at',i.candidate_responded_at
  ) ORDER BY i.scheduled_at DESC,i.id),'[]'::jsonb)
  INTO v_rows
  FROM public.interviews i
  JOIN public.job_applications a ON a.id=i.application_id AND a.tenant_id=p_tenant_id
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE i.status='scheduled';
  RETURN v_rows;
END
$function$;

REVOKE ALL ON FUNCTION public.hris_schedule_candidate_interview(uuid,uuid,text,text,timestamp without time zone,integer,text,text[],text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.candidate_respond_interview(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_get_candidate_interview_responses(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_schedule_candidate_interview(uuid,uuid,text,text,timestamp without time zone,integer,text,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_respond_interview(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_get_candidate_interview_responses(uuid) TO authenticated;

COMMIT;
