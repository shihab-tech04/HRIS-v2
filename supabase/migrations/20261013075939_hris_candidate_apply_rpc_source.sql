-- Source-controlled copy of the production Candidate application transaction.
-- The function is tenant-scoped to the current recruitment tenant, requires a
-- live candidate session, validates every selected private document, and lets
-- the database enforce one application per candidate/job pair.
CREATE OR REPLACE FUNCTION public.candidate_apply_to_job(p_job_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'storage'
AS $function$
DECLARE
  v_profile public.candidate_profiles%rowtype;
  v_job public.jobs%rowtype;
  v_id uuid;
  v_cv_id uuid := nullif(p_payload->>'selected_cv_id','')::uuid;
  v_cv_path text;
  v_docs jsonb := coalesce(p_payload->'document_ids','[]'::jsonb);
  v_doc_map jsonb := coalesce(p_payload->'required_document_map','{}'::jsonb);
  v_answers jsonb := coalesce(p_payload->'answers','[]'::jsonb);
  v_doc jsonb;
  v_doc_id text;
  v_doc_path text;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Candidate sign in required.' USING errcode='42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.candidate_profiles
  WHERE user_id=auth.uid() AND profile_status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active candidate account required.' USING errcode='42501'; END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id=p_job_id
    AND tenant_id=public.synesis_tenant_id()
    AND is_published=true
    AND status='published'
    AND is_active=true
    AND (application_deadline IS NULL OR application_deadline>=current_date)
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job is not open for applications.' USING errcode='P0002'; END IF;

  IF coalesce((p_payload#>>'{declarations,accuracyCertified}')::boolean,false) IS NOT TRUE
     OR coalesce((p_payload#>>'{declarations,recruitmentDataConsent}')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Both candidate declarations are required.' USING errcode='22000';
  END IF;

  SELECT document_url INTO v_cv_path
  FROM public.candidate_cvs
  WHERE id=v_cv_id AND candidate_user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'A CV owned by this candidate is required.' USING errcode='23503'; END IF;

  IF v_cv_path IS NOT NULL THEN
    IF split_part(v_cv_path,'/',1)<>auth.uid()::text
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects
         WHERE bucket_id='candidate-documents' AND name=v_cv_path
       ) THEN
      RAISE EXCEPTION 'Selected CV document is unavailable.' USING errcode='23503';
    END IF;
  END IF;

  IF jsonb_typeof(v_answers)<>'array' THEN RAISE EXCEPTION 'Screening answers are invalid.' USING errcode='22000'; END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_job.screening_questions) q
    WHERE coalesce((q->>'required')::boolean,false)=true
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_answers) a
        WHERE a->>'questionId'=q->>'id'
          AND a ? 'answer'
          AND a->'answer' <> 'null'::jsonb
          AND NOT (jsonb_typeof(a->'answer')='string' AND nullif(btrim(a->>'answer'),'') IS NULL)
          AND NOT (jsonb_typeof(a->'answer')='array' AND jsonb_array_length(a->'answer')=0)
      )
  ) THEN RAISE EXCEPTION 'All required screening questions must be answered.' USING errcode='22000'; END IF;

  IF jsonb_typeof(v_docs)<>'array' THEN RAISE EXCEPTION 'Selected documents are invalid.' USING errcode='22000'; END IF;

  FOR v_doc_id IN SELECT jsonb_array_elements_text(v_docs)
  LOOP
    SELECT d INTO v_doc
    FROM jsonb_array_elements(coalesce(v_profile.profile_data->'documents','[]'::jsonb)) d
    WHERE d->>'id'=v_doc_id
    LIMIT 1;

    IF v_doc IS NULL THEN
      RAISE EXCEPTION 'One or more selected documents do not belong to this candidate.' USING errcode='42501';
    END IF;

    v_doc_path := nullif(btrim(coalesce(v_doc->>'fileUrl','')),'');
    IF v_doc_path IS NULL
       OR split_part(v_doc_path,'/',1)<>auth.uid()::text
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects
         WHERE bucket_id='candidate-documents' AND name=v_doc_path
       ) THEN
      RAISE EXCEPTION 'One or more selected candidate documents are unavailable.' USING errcode='23503';
    END IF;
  END LOOP;

  IF cardinality(v_job.required_documents)>0 THEN
    IF jsonb_typeof(v_doc_map)<>'object' THEN RAISE EXCEPTION 'Required document mapping is invalid.' USING errcode='22000'; END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(v_job.required_documents) req
      WHERE NOT (v_doc_map ? req)
         OR nullif(btrim(v_doc_map->>req),'') IS NULL
         OR NOT (v_docs ? (v_doc_map->>req))
    ) THEN
      RAISE EXCEPTION 'Every required document must map to one of the verified selected documents.' USING errcode='22000';
    END IF;
  END IF;

  INSERT INTO public.job_applications(
    tenant_id,job_id,candidate_user_id,full_name,email,phone,
    years_experience,skills,cv_url,cover_letter,application_data
  )
  VALUES (
    v_job.tenant_id,v_job.id,auth.uid(),
    coalesce(nullif(btrim(p_payload->>'full_name'),''),v_profile.full_name,v_profile.email),
    v_profile.email,
    coalesce(nullif(btrim(p_payload->>'phone'),''),v_profile.phone),
    coalesce(nullif(p_payload->>'years_experience','')::numeric,v_profile.years_experience),
    coalesce(array(SELECT jsonb_array_elements_text(coalesce(p_payload->'skills','[]'::jsonb))),v_profile.skills),
    v_cv_path,
    nullif(btrim(coalesce(p_payload->>'cover_letter','')),''),
    p_payload || jsonb_build_object('cv_url',v_cv_path)
  )
  RETURNING id INTO v_id;

  DELETE FROM public.candidate_application_drafts
  WHERE candidate_user_id=auth.uid() AND job_id=p_job_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'You already applied to this job.' USING errcode='23505';
END;
$function$;

REVOKE ALL ON FUNCTION public.candidate_apply_to_job(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_apply_to_job(uuid,jsonb) TO authenticated, service_role;
