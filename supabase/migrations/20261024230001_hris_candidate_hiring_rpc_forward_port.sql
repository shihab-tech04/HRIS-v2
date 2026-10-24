-- Forward-only hosted release port: Candidate and recruiter hiring workflow RPCs.
-- Target: replacement Supabase xfuxnljfrgvusbrpvxpa only.
-- Preserves the newest canonical Main definitions; does not synthesize historical ledger entries.
-- Source migration SHA-256 provenance:
--   20261020121500_hris_candidate_activation_employee_id.sql: 5231f975d8c086c90ff3c5208d56e6a705702ee3ab01da310b47f83d8f771752
--   20261013170556_hris_candidate_assessment_journey.sql: cd353ab9208c8e2f643f6c72577f3900a19cddb7e5274d9ff6dbb96363c75bc3
--   20261013221500_hris_candidate_interview_journey.sql: 1d89b09b75d9b821164147a8c9e2c27df8e890800d870c713e7cbfa168275cff
--   20261016081154_hris_candidate_interview_completion.sql: 470bf92c794bb69ca60160d42b2b4bd722b517d80a835c313cdec7a57b7d735d
--   20261013132335_hris_recruitment_offer_issue.sql: d55e1f08a504c4385e6352edad559a8b1e02600ed02f4bea5a2b276a91c1486a
--   20261014012249_recruiter_application_stage_transition.sql: 78a45b8621365b6cb414730e99ec6f2b2b19b7743e073ce456bde7ae3a2e6d23
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

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

REVOKE ALL PRIVILEGES ON TABLE public.interviews FROM PUBLIC,anon,authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.job_offers FROM PUBLIC, anon, authenticated;

-- Source: 20261020121500_hris_candidate_activation_employee_id.sql :: public.hris_activate_candidate_employee
CREATE OR REPLACE FUNCTION public.hris_activate_candidate_employee(
  p_tenant_id uuid,
  p_application_id uuid,
  p_employee_number text,
  p_joining_date date,
  p_details_verified boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.job_applications%ROWTYPE;
  v_handoff public.onboarding_handoffs%ROWTYPE;
  v_candidate_user_id uuid;
  v_candidate_active boolean := false;
  v_employee_id uuid;
  v_employee_role_count integer := 0;
  v_employee_role_id text;
  v_existing_role text;
  v_existing_membership_status text;
  v_tenant_timezone text;
  v_tenant_today date;
  v_employee_number text := btrim(COALESCE(p_employee_number,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'A current HRIS session is required.' USING errcode='42501';
  END IF;
  IF p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'employees.manage') THEN
    RAISE EXCEPTION 'Employee-management access for this organization is required.' USING errcode='42501';
  END IF;
  IF v_employee_number = '' OR char_length(v_employee_number)>32 THEN
    RAISE EXCEPTION 'Enter an employee number of up to 32 characters.' USING errcode='22023';
  END IF;
  IF p_joining_date IS NULL THEN
    RAISE EXCEPTION 'Confirm the employee joining date.' USING errcode='22023';
  END IF;
  IF p_details_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirm that the submitted details were verified before activation.' USING errcode='22023';
  END IF;

  SELECT t.timezone, (now() AT TIME ZONE t.timezone)::date
    INTO v_tenant_timezone, v_tenant_today
  FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_tenant_timezone IS NULL OR v_tenant_timezone = '' THEN
    RAISE EXCEPTION 'The organization time zone is not configured.' USING errcode='55000';
  END IF;
  IF p_joining_date > v_tenant_today THEN
    RAISE EXCEPTION 'The confirmed joining date has not arrived; activation is available on or after that date.' USING errcode='55000';
  END IF;

  SELECT a.* INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=a.tenant_id
  WHERE a.id=p_application_id AND a.tenant_id=p_tenant_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate application was not found in this organization.' USING errcode='P0002';
  END IF;

  v_candidate_user_id := v_application.candidate_user_id;
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.candidate_profiles cp ON cp.user_id=u.id
    WHERE u.id=v_candidate_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND u.last_sign_in_at IS NOT NULL
      AND cp.tenant_id=p_tenant_id
      AND cp.profile_status='active'
  ) INTO v_candidate_active;
  IF NOT v_candidate_active OR v_candidate_user_id IS NULL THEN
    RAISE EXCEPTION 'The candidate Auth identity is not active in this organization.' USING errcode='42501';
  END IF;

  SELECT h.* INTO v_handoff
  FROM public.onboarding_handoffs h
  WHERE h.application_id=p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate preboarding handoff was not found.' USING errcode='P0002';
  END IF;

  -- A committed response may be lost in transit. Return the same activation
  -- on retry, but only when the original employee and membership still agree.
  IF v_handoff.employee_id IS NOT NULL THEN
    SELECT e.id INTO v_employee_id
    FROM public.employees e
    JOIN public.tenant_memberships m
      ON m.tenant_id=e.tenant_id AND m.user_id=e.user_id AND m.status='active'
    JOIN public.roles r ON r.id=m.role AND r.active IS TRUE AND lower(btrim(r.name))='employee'
    WHERE e.id=v_handoff.employee_id AND e.tenant_id=p_tenant_id
      AND e.user_id=v_candidate_user_id
      AND e.employee_number=v_employee_number
      AND e.joining_date=p_joining_date;
    IF v_employee_id IS NULL OR v_handoff.verified_at IS NULL
       OR v_handoff.verified_by IS NULL OR v_handoff.status <> 'completed'
       OR v_application.stage <> 'hired' THEN
      RAISE EXCEPTION 'The completed handoff does not match its employee record.' USING errcode='23514';
    END IF;
    RETURN jsonb_build_object('success',true,'employee_id',v_employee_id,'idempotent',true);
  END IF;

  IF v_application.stage <> 'offer_accepted'
     OR NOT EXISTS (SELECT 1 FROM public.job_offers o
       WHERE o.application_id=p_application_id AND o.status='accepted') THEN
    RAISE EXCEPTION 'An accepted offer is required before employee activation.' USING errcode='42501';
  END IF;
  IF v_handoff.candidate_submitted_at IS NULL
     OR COALESCE(cardinality(v_handoff.candidate_completed_steps),0)<>4
     OR NOT COALESCE(v_handoff.candidate_completed_steps @> ARRAY[
       'step_identity','step_emergency','step_payroll','step_policies'
     ]::text[],false)
     OR v_handoff.status NOT IN ('submitted_for_verification','in_progress') THEN
    RAISE EXCEPTION 'The completed four-section preboarding packet must be submitted before activation.' USING errcode='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees e
      WHERE e.tenant_id=p_tenant_id AND e.user_id=v_candidate_user_id) THEN
    RAISE EXCEPTION 'This Auth identity is already linked to an employee in this organization.' USING errcode='23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees e
      WHERE e.tenant_id=p_tenant_id AND e.employee_number=v_employee_number) THEN
    RAISE EXCEPTION 'That employee number is already assigned in this organization.' USING errcode='23505';
  END IF;

  SELECT count(*)::integer, min(r.id)
    INTO v_employee_role_count, v_employee_role_id
  FROM public.roles r
  WHERE r.active IS TRUE AND lower(btrim(r.name))='employee';
  IF v_employee_role_count <> 1 OR v_employee_role_id IS NULL THEN
    RAISE EXCEPTION 'The active Employee role is not configured for this organization.' USING errcode='55000';
  END IF;
  SELECT r.id INTO v_employee_role_id
  FROM public.roles r
  WHERE r.id=v_employee_role_id AND r.active IS TRUE
    AND lower(btrim(r.name))='employee'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The active Employee role changed during activation.' USING errcode='55000';
  END IF;

  SELECT m.role, m.status INTO v_existing_role, v_existing_membership_status
  FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=v_candidate_user_id
  FOR UPDATE;
  IF FOUND AND (v_existing_role <> v_employee_role_id OR v_existing_membership_status <> 'active') THEN
    RAISE EXCEPTION 'The candidate already has a different organization membership; it was not changed.' USING errcode='23514';
  END IF;

  INSERT INTO public.employees (
    id,tenant_id,user_id,employee_number,full_name,official_email,joining_date,employment_status
  ) VALUES (
    gen_random_uuid(),p_tenant_id,v_candidate_user_id,v_employee_number,
    v_application.full_name,v_application.email,p_joining_date,'active'
  ) RETURNING id INTO v_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee record creation did not complete.' USING errcode='23514';
  END IF;

  IF v_existing_role IS NULL THEN
    INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
    VALUES (p_tenant_id,v_candidate_user_id,v_employee_role_id,'active')
    ON CONFLICT (tenant_id,user_id) DO NOTHING;
    SELECT m.role, m.status INTO v_existing_role, v_existing_membership_status
    FROM public.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.user_id=v_candidate_user_id
    FOR UPDATE;
    IF v_existing_role <> v_employee_role_id OR v_existing_membership_status <> 'active' THEN
      RAISE EXCEPTION 'The candidate organization membership changed during activation.' USING errcode='23514';
    END IF;
  END IF;

  UPDATE public.onboarding_handoffs h SET
    status='completed',employee_id=v_employee_id,verified_at=now(),verified_by=auth.uid(),updated_at=now()
  WHERE h.id=v_handoff.id;
  UPDATE public.job_applications a SET
    stage='hired',status_note='Employee activation completed.',updated_at=now()
  WHERE a.id=p_application_id AND a.tenant_id=p_tenant_id AND a.stage='offer_accepted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate application changed during activation.' USING errcode='40001';
  END IF;
  INSERT INTO public.candidate_application_stage_history (
    id,application_id,stage,note,actor_type,actor_user_id,created_at
  ) VALUES (
    gen_random_uuid(),p_application_id,'hired','Employee activation completed.','recruitment',auth.uid(),now()
  );
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (
    auth.uid(),'candidate.employee.activated','employee',v_employee_id::text,
    jsonb_build_object(
      'tenant_id',p_tenant_id,
      'application_id',p_application_id,
      'candidate_user_id',v_candidate_user_id,
      'employee_number',v_employee_number,
      'joining_date',p_joining_date
    )
  );

  RETURN jsonb_build_object('success',true,'employee_id',v_employee_id,'idempotent',false);
END
$function$;
REVOKE ALL ON FUNCTION public.hris_activate_candidate_employee(uuid,uuid,text,date,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_activate_candidate_employee(uuid,uuid,text,date,boolean) TO authenticated,service_role;

-- Source: 20261013170556_hris_candidate_assessment_journey.sql :: public.hris_assign_candidate_assessment
CREATE OR REPLACE FUNCTION public.hris_assign_candidate_assessment(
  p_tenant_id uuid,
  p_application_id uuid,
  p_title text,
  p_assessment_type text,
  p_instructions text,
  p_deadline_date date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.job_applications%ROWTYPE;
  v_assessment_id uuid;
  v_title text := NULLIF(btrim(COALESCE(p_title, '')), '');
  v_type text := NULLIF(btrim(COALESCE(p_assessment_type, '')), '');
  v_instructions text := NULLIF(btrim(COALESCE(p_instructions, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'A current recruiter session is required.' USING errcode = '42501';
  END IF;
  IF p_tenant_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE
    ) OR NOT public.has_tenant_permission(p_tenant_id, 'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode = '42501';
  END IF;
  IF v_title IS NULL OR length(v_title) > 200 THEN
    RAISE EXCEPTION 'Enter an assessment title (up to 200 characters).' USING errcode = '22023';
  END IF;
  IF v_type IS NULL OR length(v_type) > 100 THEN
    RAISE EXCEPTION 'Enter an assessment type (up to 100 characters).' USING errcode = '22023';
  END IF;
  IF v_instructions IS NULL OR length(v_instructions) > 10000 THEN
    RAISE EXCEPTION 'Enter candidate instructions (up to 10,000 characters).' USING errcode = '22023';
  END IF;
  IF p_deadline_date IS NULL OR p_deadline_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose an assessment deadline that has not passed.' USING errcode = '22023';
  END IF;

  SELECT a.*
  INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = a.tenant_id
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application was not found in this organization.' USING errcode = 'P0002';
  END IF;
  IF v_application.stage IN ('withdrawn', 'rejected', 'offer_accepted', 'hired') THEN
    RAISE EXCEPTION 'An assessment cannot be assigned to a closed application.' USING errcode = '22023';
  END IF;

  INSERT INTO public.candidate_assessments (
    id, application_id, title, assessment_type, instructions,
    deadline_date, status, created_by, created_at
  ) VALUES (
    gen_random_uuid(), p_application_id, v_title, v_type, v_instructions,
    p_deadline_date, 'pending', auth.uid(), now()
  ) RETURNING id INTO v_assessment_id;

  RETURN jsonb_build_object('success', true, 'assessment_id', v_assessment_id, 'status', 'pending');
END
$function$;
REVOKE ALL ON FUNCTION public.hris_assign_candidate_assessment(uuid,uuid,text,text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_assign_candidate_assessment(uuid,uuid,text,text,text,date) TO authenticated, service_role;

-- Source: 20261013170556_hris_candidate_assessment_journey.sql :: public.hris_get_candidate_assessments
CREATE OR REPLACE FUNCTION public.hris_get_candidate_assessments(
  p_tenant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
    OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE)
    OR NOT public.has_tenant_permission(p_tenant_id, 'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ca.id,
    'application_id', ca.application_id,
    'candidate_name', a.full_name,
    'job_title', j.title,
    'title', ca.title,
    'assessment_type', ca.assessment_type,
    'instructions', ca.instructions,
    'deadline_date', ca.deadline_date,
    'status', ca.status,
    'submission_data', ca.submission_data,
    'submitted_at', ca.submitted_at,
    'review_note', ca.review_note,
    'reviewed_at', ca.reviewed_at,
    'created_at', ca.created_at
  ) ORDER BY ca.created_at DESC, ca.id), '[]'::jsonb)
  INTO v_payload
  FROM public.candidate_assessments ca
  JOIN public.job_applications a ON a.id = ca.application_id AND a.tenant_id = p_tenant_id
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = p_tenant_id;

  RETURN v_payload;
END
$function$;
REVOKE ALL ON FUNCTION public.hris_get_candidate_assessments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_candidate_assessments(uuid) TO authenticated, service_role;

-- Source: 20261013170556_hris_candidate_assessment_journey.sql :: public.hris_review_candidate_assessment
CREATE OR REPLACE FUNCTION public.hris_review_candidate_assessment(
  p_tenant_id uuid,
  p_assessment_id uuid,
  p_review_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_assessment public.candidate_assessments%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_review_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
    OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE)
    OR NOT public.has_tenant_permission(p_tenant_id, 'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode = '42501';
  END IF;
  IF length(COALESCE(v_note, '')) > 5000 THEN
    RAISE EXCEPTION 'Review note must be 5,000 characters or fewer.' USING errcode = '22023';
  END IF;

  SELECT ca.* INTO v_assessment
  FROM public.candidate_assessments ca
  JOIN public.job_applications a ON a.id = ca.application_id AND a.tenant_id = p_tenant_id
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = p_tenant_id
  WHERE ca.id = p_assessment_id
  FOR UPDATE OF ca;
  IF NOT FOUND OR v_assessment.status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'Submitted assessment was not found in this organization.' USING errcode = 'P0002';
  END IF;

  UPDATE public.candidate_assessments ca
  SET status = 'reviewed', review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE ca.id = p_assessment_id;

  RETURN jsonb_build_object('success', true, 'assessment_id', p_assessment_id, 'status', 'reviewed');
END
$function$;
REVOKE ALL ON FUNCTION public.hris_review_candidate_assessment(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_review_candidate_assessment(uuid,uuid,text) TO authenticated, service_role;

-- Source: 20261013221500_hris_candidate_interview_journey.sql :: public.hris_schedule_candidate_interview
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
REVOKE ALL ON FUNCTION public.hris_schedule_candidate_interview(uuid,uuid,text,text,timestamp without time zone,integer,text,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_schedule_candidate_interview(uuid,uuid,text,text,timestamp without time zone,integer,text,text[],text) TO authenticated;

-- Source: 20261016081154_hris_candidate_interview_completion.sql :: public.hris_complete_candidate_interview
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
REVOKE ALL ON FUNCTION public.hris_complete_candidate_interview(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_complete_candidate_interview(uuid,uuid) TO authenticated;

-- Source: 20261016081154_hris_candidate_interview_completion.sql :: public.hris_get_candidate_interview_responses
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
REVOKE ALL ON FUNCTION public.hris_get_candidate_interview_responses(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_candidate_interview_responses(uuid) TO authenticated;

-- Source: 20261016081154_hris_candidate_interview_completion.sql :: public.hris_save_candidate_interview_panel_notes
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
REVOKE ALL ON FUNCTION public.hris_save_candidate_interview_panel_notes(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_save_candidate_interview_panel_notes(uuid,uuid,text) TO authenticated;

-- Source: 20261013132335_hris_recruitment_offer_issue.sql :: public.hris_issue_candidate_offer
CREATE OR REPLACE FUNCTION public.hris_issue_candidate_offer(
  p_tenant_id uuid,
  p_application_id uuid,
  p_salary_amount numeric,
  p_salary_currency text,
  p_pay_period text,
  p_proposed_joining_date date,
  p_response_deadline date,
  p_terms text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.job_applications%ROWTYPE;
  v_job_title text;
  v_salary_currency text := upper(btrim(COALESCE(p_salary_currency, '')));
  v_terms text := NULLIF(btrim(COALESCE(p_terms, '')), '');
  v_offer_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'A current recruiter session is required.' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE
    ) OR NOT public.has_tenant_permission(p_tenant_id, 'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode = '42501';
  END IF;
  IF p_salary_amount IS NULL OR p_salary_amount <= 0 THEN
    RAISE EXCEPTION 'Enter the authorized offer amount.' USING errcode = '22023';
  END IF;
  IF v_salary_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Enter a three-letter offer currency code.' USING errcode = '22023';
  END IF;
  IF p_pay_period IS NULL OR p_pay_period NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Choose a supported pay period.' USING errcode = '22023';
  END IF;
  IF p_proposed_joining_date IS NULL THEN
    RAISE EXCEPTION 'Enter the proposed joining date.' USING errcode = '22023';
  END IF;
  IF p_response_deadline IS NULL OR p_response_deadline < CURRENT_DATE THEN
    RAISE EXCEPTION 'Enter a response deadline that has not passed.' USING errcode = '22023';
  END IF;
  IF v_terms IS NULL OR length(v_terms) > 10000 THEN
    RAISE EXCEPTION 'Enter the offer terms (up to 10,000 characters).' USING errcode = '22023';
  END IF;

  -- Lock the tenant-matched application so concurrent clicks cannot issue two
  -- open offers for the same candidate.
  SELECT a.*
  INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = a.tenant_id
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application was not found in this organization.' USING errcode = 'P0002';
  END IF;
  SELECT j.title INTO v_job_title
  FROM public.jobs j
  WHERE j.id = v_application.job_id AND j.tenant_id = p_tenant_id;
  IF v_application.stage IN ('withdrawn', 'rejected', 'offer_accepted', 'hired') THEN
    RAISE EXCEPTION 'An offer cannot be issued for a closed application.' USING errcode = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.job_offers o
    WHERE o.application_id = p_application_id AND o.status = 'issued'
  ) THEN
    RAISE EXCEPTION 'An open offer already exists for this application.' USING errcode = '23505';
  END IF;

  INSERT INTO public.job_offers (
    id, application_id, offered_title, salary_amount, salary_currency,
    proposed_joining_date, terms, status, issued_by, issued_at,
    response_deadline, pay_period
  ) VALUES (
    gen_random_uuid(), p_application_id, v_job_title, p_salary_amount,
    v_salary_currency, p_proposed_joining_date, v_terms, 'issued', auth.uid(),
    now(), p_response_deadline, p_pay_period
  ) RETURNING id INTO v_offer_id;

  UPDATE public.job_applications a
  SET stage = 'offer_extended', status_note = 'Offer issued to candidate.', updated_at = now()
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id;

  INSERT INTO public.candidate_application_stage_history (
    id, application_id, stage, note, actor_type, actor_user_id
  ) VALUES (
    gen_random_uuid(), p_application_id, 'offer_extended',
    'An employment offer was issued.', 'recruitment', auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id, 'stage', 'offer_extended');
END
$function$;
REVOKE ALL ON FUNCTION public.hris_issue_candidate_offer(uuid,uuid,numeric,text,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_issue_candidate_offer(uuid,uuid,numeric,text,text,date,date,text) TO authenticated, service_role;

-- Source: 20261014012249_recruiter_application_stage_transition.sql :: public.hris_update_candidate_application_stage
CREATE OR REPLACE FUNCTION public.hris_update_candidate_application_stage(
  p_tenant_id uuid,
  p_application_id uuid,
  p_stage text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.job_applications%ROWTYPE;
  v_stage text := lower(btrim(COALESCE(p_stage, '')));
  v_history_id uuid;
  v_created_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'A current recruiter session is required.' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE
    ) OR NOT public.has_tenant_permission(p_tenant_id, 'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode = '42501';
  END IF;
  IF v_stage NOT IN ('under_review', 'screening', 'rejected') THEN
    RAISE EXCEPTION 'Choose an available review, screening, or rejection stage.' USING errcode = '22023';
  END IF;

  SELECT a.* INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = a.tenant_id
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application was not found in this organization.' USING errcode = 'P0002';
  END IF;

  -- Make network retries safe without creating duplicate history entries.
  IF v_application.stage = v_stage THEN
    RETURN jsonb_build_object('success', true, 'changed', false, 'stage', v_stage);
  END IF;

  IF v_application.stage IN ('withdrawn', 'rejected', 'offer_extended', 'offer_accepted', 'offer_declined', 'hired') THEN
    RAISE EXCEPTION 'A closed or offered application cannot be moved to another review stage.' USING errcode = '22023';
  END IF;
  IF v_stage = 'under_review' AND v_application.stage NOT IN ('applied', 'submitted') THEN
    RAISE EXCEPTION 'This application cannot move back to review.' USING errcode = '22023';
  END IF;
  IF v_stage = 'screening' AND v_application.stage NOT IN ('applied', 'submitted', 'under_review') THEN
    RAISE EXCEPTION 'This application cannot move back to screening.' USING errcode = '22023';
  END IF;

  UPDATE public.job_applications a
  SET stage = v_stage, updated_at = now()
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id;

  INSERT INTO public.candidate_application_stage_history (
    id, application_id, stage, note, actor_type, actor_user_id, created_at
  ) VALUES (
    gen_random_uuid(), p_application_id, v_stage,
    CASE v_stage
      WHEN 'under_review' THEN 'Application moved to review.'
      WHEN 'screening' THEN 'Application moved to screening.'
      ELSE 'Application was not selected.'
    END,
    'recruitment', auth.uid(), now()
  ) RETURNING id, created_at INTO v_history_id, v_created_at;

  RETURN jsonb_build_object(
    'success', true, 'changed', true, 'stage', v_stage,
    'history_id', v_history_id, 'created_at', v_created_at
  );
END
$function$;
REVOKE ALL ON FUNCTION public.hris_update_candidate_application_stage(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_update_candidate_application_stage(uuid,uuid,text) TO authenticated, service_role;

COMMIT;
