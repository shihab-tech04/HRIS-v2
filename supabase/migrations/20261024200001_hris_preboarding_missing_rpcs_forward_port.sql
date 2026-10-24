-- Selective forward port from 20261013190200_hris_candidate_preboarding_workflow.sql.
-- Replacement target only; sourced blocks are byte-identical and must be reviewed.
-- SOURCE STAGING. Not hosted approval: fresh independently restored backup, isolated
-- authenticated Candidate/Recruiter negative tests, release control and postflight required.
-- Preserve existing candidate_respond_offer_record and existing handoff RLS policies.
BEGIN;

ALTER TABLE public.onboarding_handoffs
  ADD COLUMN IF NOT EXISTS candidate_personal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS candidate_completed_steps text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS candidate_submitted_at timestamptz;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onboarding_handoffs'::regclass AND conname='onboarding_candidate_personal_data_object') THEN
    ALTER TABLE public.onboarding_handoffs ADD CONSTRAINT onboarding_candidate_personal_data_object
      CHECK (jsonb_typeof(candidate_personal_data)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onboarding_handoffs'::regclass AND conname='onboarding_candidate_completed_steps_valid') THEN
    ALTER TABLE public.onboarding_handoffs ADD CONSTRAINT onboarding_candidate_completed_steps_valid
      CHECK (candidate_completed_steps <@ ARRAY['step_identity','step_emergency','step_payroll','step_policies']::text[]);
  END IF;
END
$constraints$;


CREATE OR REPLACE FUNCTION public.candidate_get_my_preboarding_handoff(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_tenant_id uuid; v_handoff jsonb;
BEGIN
  IF NOT public.is_live_session() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Candidate sign in required.' USING errcode='42501';
  END IF;
  SELECT cp.tenant_id INTO v_tenant_id
  FROM public.candidate_profiles cp
  WHERE cp.user_id=auth.uid() AND cp.profile_status='active';
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Active candidate account required.' USING errcode='42501';
  END IF;

  SELECT jsonb_build_object(
    'id',h.id,'application_id',h.application_id,'status',h.status,
    'candidate_personal_data',h.candidate_personal_data,
    'candidate_completed_steps',h.candidate_completed_steps,
    'candidate_submitted_at',h.candidate_submitted_at,
    'created_at',h.created_at,'updated_at',h.updated_at
  ) INTO v_handoff
  FROM public.onboarding_handoffs h
  JOIN public.job_applications a ON a.id=h.application_id AND a.tenant_id=v_tenant_id
  JOIN public.job_offers o ON o.application_id=a.id AND o.status='accepted'
  WHERE a.id=p_application_id AND a.candidate_user_id=auth.uid();
  RETURN v_handoff;
END
$function$;

CREATE OR REPLACE FUNCTION public.candidate_save_my_preboarding_step(
  p_application_id uuid,p_step_key text,p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_tenant_id uuid;
  v_handoff public.onboarding_handoffs%ROWTYPE;
  v_allowed text[];
  v_required text[];
  v_steps text[];
  v_clean jsonb;
  v_value text;
  v_date date;
BEGIN
  IF NOT public.is_live_session() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Candidate sign in required.' USING errcode='42501';
  END IF;
  SELECT cp.tenant_id INTO v_tenant_id
  FROM public.candidate_profiles cp
  WHERE cp.user_id=auth.uid() AND cp.profile_status='active';
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Active candidate account required.' USING errcode='42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'Enter the required information before saving this step.' USING errcode='22023';
  END IF;

  CASE p_step_key
    WHEN 'step_identity' THEN
      v_allowed:=ARRAY['national_id','passport_number','date_of_birth','nationality','address'];
      v_required:=ARRAY['national_id','date_of_birth','nationality','address'];
    WHEN 'step_emergency' THEN
      v_allowed:=ARRAY['emergency_contact_name','emergency_contact_phone','emergency_contact_relation'];
      v_required:=v_allowed;
    WHEN 'step_payroll' THEN
      v_allowed:=ARRAY['bank_name','bank_account_number','tax_identification_number'];
      v_required:=v_allowed;
    WHEN 'step_policies' THEN
      v_allowed:=ARRAY['policies_accepted'];
      v_required:=v_allowed;
    ELSE
      RAISE EXCEPTION 'Unknown preboarding step.' USING errcode='22023';
  END CASE;

  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT (k=ANY(v_allowed))) THEN
    RAISE EXCEPTION 'This step contains an unsupported field.' USING errcode='22023';
  END IF;
  IF p_step_key='step_policies' THEN
    IF p_payload->'policies_accepted' IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION 'Confirm the policy acknowledgment to submit your packet.' USING errcode='22023';
    END IF;
    v_clean:=jsonb_build_object('policies_accepted',true);
  ELSE
    IF EXISTS (SELECT 1 FROM jsonb_each(p_payload) e WHERE jsonb_typeof(e.value)<>'string') THEN
      RAISE EXCEPTION 'Enter text values for this step.' USING errcode='22023';
    END IF;
    FOREACH v_value IN ARRAY v_required LOOP
      IF NULLIF(btrim(p_payload->>v_value),'') IS NULL THEN
        RAISE EXCEPTION 'Complete each required field before saving this step.' USING errcode='22023';
      END IF;
    END LOOP;
    IF p_step_key='step_identity' AND (p_payload->>'date_of_birth') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Enter a valid date of birth.' USING errcode='22023';
    END IF;
    IF p_step_key='step_identity' THEN
      BEGIN v_date:=(p_payload->>'date_of_birth')::date;
      EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Enter a valid date of birth.' USING errcode='22023'; END;
    END IF;
    IF p_step_key='step_emergency' AND NOT (p_payload->>'emergency_contact_relation'=ANY(ARRAY['Spouse','Parent','Sibling','Guardian','Other'])) THEN
      RAISE EXCEPTION 'Choose a listed emergency-contact relationship.' USING errcode='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each_text(p_payload) e WHERE length(btrim(e.value))>CASE e.key
        WHEN 'bank_account_number' THEN 100 WHEN 'tax_identification_number' THEN 64
        WHEN 'address' THEN 500 WHEN 'national_id' THEN 80 WHEN 'passport_number' THEN 80
        WHEN 'emergency_contact_phone' THEN 80 ELSE 160 END) THEN
      RAISE EXCEPTION 'One or more fields exceed the allowed length.' USING errcode='22023';
    END IF;
    SELECT jsonb_object_agg(e.key,to_jsonb(btrim(e.value))) INTO v_clean FROM jsonb_each_text(p_payload) e;
  END IF;

  SELECT h.* INTO v_handoff
  FROM public.onboarding_handoffs h
  JOIN public.job_applications a ON a.id=h.application_id AND a.tenant_id=v_tenant_id
  WHERE a.id=p_application_id AND a.candidate_user_id=auth.uid()
    AND EXISTS (SELECT 1 FROM public.job_offers o WHERE o.application_id=a.id AND o.status='accepted')
  FOR UPDATE OF h;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted-offer preboarding record was not found.' USING errcode='P0002';
  END IF;
  IF v_handoff.candidate_submitted_at IS NOT NULL OR v_handoff.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'This preboarding packet is locked after submission.' USING errcode='42501';
  END IF;

  v_steps:=ARRAY(SELECT step FROM unnest(ARRAY['step_identity','step_emergency','step_payroll','step_policies']::text[]) AS steps(step)
    WHERE step=ANY(v_handoff.candidate_completed_steps || ARRAY[p_step_key]::text[]));

  UPDATE public.onboarding_handoffs h SET
    candidate_personal_data=h.candidate_personal_data || v_clean,
    candidate_completed_steps=v_steps,
    candidate_submitted_at=CASE WHEN cardinality(v_steps)=4 THEN COALESCE(h.candidate_submitted_at,now()) ELSE h.candidate_submitted_at END,
    status=CASE WHEN h.status='pending' THEN 'in_progress' ELSE h.status END,
    updated_at=now()
  WHERE h.id=v_handoff.id
  RETURNING * INTO v_handoff;

  RETURN jsonb_build_object(
    'id',v_handoff.id,'application_id',v_handoff.application_id,'status',v_handoff.status,
    'candidate_personal_data',v_handoff.candidate_personal_data,
    'candidate_completed_steps',v_handoff.candidate_completed_steps,
    'candidate_submitted_at',v_handoff.candidate_submitted_at,
    'created_at',v_handoff.created_at,'updated_at',v_handoff.updated_at
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_candidate_preboarding_queue(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
      OR NOT public.has_tenant_permission(p_tenant_id,'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'handoff_id',h.id,'application_id',a.id,'candidate_name',a.full_name,
    'candidate_email',a.email,'job_title',j.title,'status',h.status,
    'candidate_personal_data',h.candidate_personal_data,
    'candidate_completed_steps',h.candidate_completed_steps,
    'candidate_submitted_at',h.candidate_submitted_at
  ) ORDER BY h.candidate_submitted_at,h.id),'[]'::jsonb)
  INTO v_rows
  FROM public.onboarding_handoffs h
  JOIN public.job_applications a ON a.id=h.application_id AND a.tenant_id=p_tenant_id
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE h.candidate_submitted_at IS NOT NULL AND h.status IN ('in_progress','completed');
  RETURN v_rows;
END
$function$;


REVOKE ALL ON FUNCTION public.candidate_get_my_preboarding_handoff(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.candidate_save_my_preboarding_step(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_get_candidate_preboarding_queue(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.candidate_get_my_preboarding_handoff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_save_my_preboarding_step(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_get_candidate_preboarding_queue(uuid) TO authenticated;

COMMIT;
