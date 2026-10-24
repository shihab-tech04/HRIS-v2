-- Recruiters assign assessments through tenant-scoped RPCs; candidates submit
-- once through their owner-scoped RPC; private review state stays manager-only.
BEGIN;

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

CREATE OR REPLACE FUNCTION public.candidate_submit_assessment(
  p_assessment_id uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_status text;
  v_deadline date;
  v_submission_text text;
  v_file_url text;
  v_file_name text;
  v_submission jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active candidate session is required.' USING errcode = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Provide assessment submission details.' USING errcode = '22023';
  END IF;
  v_submission_text := NULLIF(btrim(COALESCE(p_payload ->> 'submission_text', '')), '');
  v_file_url := NULLIF(btrim(COALESCE(p_payload ->> 'file_url', '')), '');
  v_file_name := NULLIF(btrim(COALESCE(p_payload ->> 'file_name', '')), '');
  IF v_submission_text IS NULL AND v_file_url IS NULL THEN
    RAISE EXCEPTION 'Provide written work or a secure HTTPS submission link.' USING errcode = '22023';
  END IF;
  IF length(COALESCE(v_submission_text, '')) > 10000 THEN
    RAISE EXCEPTION 'Written submission must be 10,000 characters or fewer.' USING errcode = '22023';
  END IF;
  IF v_file_url IS NOT NULL AND (length(v_file_url) > 2000 OR v_file_url !~* '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'Submission links must use HTTPS and be 2,000 characters or fewer.' USING errcode = '22023';
  END IF;
  IF length(COALESCE(v_file_name, '')) > 255 THEN
    RAISE EXCEPTION 'Submission file name must be 255 characters or fewer.' USING errcode = '22023';
  END IF;

  SELECT a.tenant_id, ca.status, ca.deadline_date
  INTO v_tenant_id, v_status, v_deadline
  FROM public.candidate_assessments ca
  JOIN public.job_applications a ON a.id = ca.application_id
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = a.tenant_id
  JOIN public.candidate_profiles cp ON cp.user_id = auth.uid()
    AND cp.tenant_id = a.tenant_id AND cp.profile_status = 'active'
  WHERE ca.id = p_assessment_id AND a.candidate_user_id = auth.uid()
  FOR UPDATE OF ca;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending assessment was not found for this candidate.' USING errcode = 'P0002';
  END IF;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This assessment can no longer accept a submission.' USING errcode = 'P0002';
  END IF;
  IF v_deadline < CURRENT_DATE THEN
    RAISE EXCEPTION 'The assessment deadline has passed.' USING errcode = '22023';
  END IF;

  v_submission := jsonb_build_object(
    'submission_text', v_submission_text,
    'file_url', v_file_url,
    'file_name', v_file_name
  );
  UPDATE public.candidate_assessments ca
  SET status = 'submitted', submission_data = v_submission, submitted_at = now()
  WHERE ca.id = p_assessment_id;

  RETURN jsonb_build_object('success', true, 'assessment_id', p_assessment_id, 'status', 'submitted');
END
$function$;

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

REVOKE ALL ON FUNCTION public.hris_assign_candidate_assessment(uuid,uuid,text,text,text,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.candidate_submit_assessment(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_get_candidate_assessments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_review_candidate_assessment(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_assign_candidate_assessment(uuid,uuid,text,text,text,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_submit_assessment(uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_candidate_assessments(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_review_candidate_assessment(uuid,uuid,text) TO authenticated, service_role;

COMMIT;
