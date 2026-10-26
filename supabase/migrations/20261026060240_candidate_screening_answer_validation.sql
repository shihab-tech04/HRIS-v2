-- Forward-only server validation for persisted Candidate screening questions.
-- Mirrors the seven question types used by the Candidate application and rejects
-- malformed definitions, unknown IDs, duplicates, invalid values, and options.
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
  v_questions jsonb;
  v_question jsonb;
  v_answer_item jsonb;
  v_answer jsonb;
  v_question_id text;
  v_question_type text;
  v_value text;
  v_required boolean;
  v_answer_empty boolean;
  v_question_count integer;
  v_answer_count integer;
  v_screening_date date;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Candidate sign in required.' USING errcode='42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.candidate_profiles
  WHERE user_id=auth.uid()
    AND tenant_id=public.synesis_tenant_id()
    AND profile_status='active';
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

  v_questions := coalesce(v_job.screening_questions, '[]'::jsonb);
  IF jsonb_typeof(v_questions)<>'array' THEN
    RAISE EXCEPTION 'The screening questionnaire is invalid.' USING errcode='22000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_questions) AS q(value)
    WHERE jsonb_typeof(q.value)<>'object'
       OR nullif(btrim(q.value->>'id'),'') IS NULL
       OR char_length(btrim(q.value->>'id'))>100
       OR nullif(btrim(coalesce(q.value->>'questionText',q.value->>'question','')),'') IS NULL
       OR char_length(btrim(coalesce(q.value->>'questionText',q.value->>'question','')))>1000
       OR coalesce(q.value->>'type','') NOT IN ('short_text','long_text','number','yes_no','single_select','multi_select','date')
       OR (q.value ? 'required' AND jsonb_typeof(q.value->'required')<>'boolean')
  ) THEN
    RAISE EXCEPTION 'A screening question has an invalid ID, prompt, required flag, or type.' USING errcode='22000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_questions) AS q(value)
    WHERE q.value->>'type' IN ('single_select','multi_select')
      AND jsonb_typeof(q.value->'options') IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION 'Selection questions require a valid options array.' USING errcode='22000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_questions) AS q(value)
    WHERE q.value->>'type' IN ('single_select','multi_select')
      AND q.value->'options'='[]'::jsonb
  ) THEN
    RAISE EXCEPTION 'Selection questions require at least one option.' USING errcode='22000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_questions) AS q(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN q.value->>'type' IN ('single_select','multi_select')
        THEN q.value->'options' ELSE '[]'::jsonb END
    ) AS opt(value)
    WHERE jsonb_typeof(opt.value)<>'string'
       OR nullif(btrim(opt.value #>> '{}'),'') IS NULL
       OR char_length(btrim(opt.value #>> '{}'))>200
  ) THEN
    RAISE EXCEPTION 'Selection question options must be non-empty text values.' USING errcode='22000';
  END IF;
  IF EXISTS (
    SELECT q.value->>'id'
    FROM jsonb_array_elements(v_questions) AS q(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN q.value->>'type' IN ('single_select','multi_select')
        THEN q.value->'options' ELSE '[]'::jsonb END
    ) AS opt(value)
    WHERE q.value->>'type' IN ('single_select','multi_select')
    GROUP BY q.value->>'id'
    HAVING count(*)<>count(DISTINCT btrim(opt.value #>> '{}'))
  ) THEN
    RAISE EXCEPTION 'Selection question options must be unique.' USING errcode='22000';
  END IF;
  SELECT count(*)::integer, count(DISTINCT btrim(q.value->>'id'))::integer
    INTO v_question_count, v_answer_count
  FROM jsonb_array_elements(v_questions) AS q(value);
  IF v_question_count<>v_answer_count THEN
    RAISE EXCEPTION 'Screening question IDs must be unique.' USING errcode='22000';
  END IF;

  IF jsonb_typeof(v_answers)<>'array' THEN
    RAISE EXCEPTION 'Screening answers are invalid.' USING errcode='22000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_answers) AS a(value)
    WHERE jsonb_typeof(a.value)<>'object'
       OR jsonb_typeof(a.value->'questionId')<>'string'
       OR nullif(btrim(a.value->>'questionId'),'') IS NULL
       OR char_length(btrim(a.value->>'questionId'))>100
       OR NOT (a.value ? 'answer')
  ) THEN
    RAISE EXCEPTION 'Every screening answer must identify one question and include an answer value.' USING errcode='22000';
  END IF;
  SELECT count(*)::integer, count(DISTINCT btrim(a.value->>'questionId'))::integer
    INTO v_answer_count, v_question_count
  FROM jsonb_array_elements(v_answers) AS a(value);
  IF v_answer_count<>v_question_count THEN
    RAISE EXCEPTION 'Duplicate screening answers are not allowed.' USING errcode='22000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_answers) AS a(value)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_questions) AS q(value)
      WHERE btrim(q.value->>'id')=btrim(a.value->>'questionId')
    )
  ) THEN
    RAISE EXCEPTION 'A screening answer refers to an unknown question.' USING errcode='22000';
  END IF;

  FOR v_question IN SELECT q.value FROM jsonb_array_elements(v_questions) AS q(value)
  LOOP
    v_question_id := btrim(v_question->>'id');
    v_question_type := v_question->>'type';
    v_required := coalesce((v_question->>'required')::boolean,false);
    v_answer_item := NULL;
    SELECT a.value INTO v_answer_item
    FROM jsonb_array_elements(v_answers) AS a(value)
    WHERE btrim(a.value->>'questionId')=v_question_id;
    IF NOT FOUND THEN
      IF v_required THEN
        RAISE EXCEPTION 'All required screening questions must be answered.' USING errcode='22000';
      END IF;
      CONTINUE;
    END IF;

    v_answer := v_answer_item->'answer';
    v_answer_empty := v_answer IS NULL OR v_answer='null'::jsonb
      OR (jsonb_typeof(v_answer)='string' AND btrim(v_answer #>> '{}')='')
      OR v_answer='[]'::jsonb;
    IF v_answer_empty THEN
      IF v_required THEN
        RAISE EXCEPTION 'All required screening questions must be answered.' USING errcode='22000';
      END IF;
      CONTINUE;
    END IF;

    IF v_question_type IN ('short_text','long_text') THEN
      IF jsonb_typeof(v_answer)<>'string' OR char_length(v_answer #>> '{}')>5000 THEN
        RAISE EXCEPTION 'A screening text answer has an invalid value.' USING errcode='22000';
      END IF;
    ELSIF v_question_type='number' THEN
      IF jsonb_typeof(v_answer)<>'number' THEN
        RAISE EXCEPTION 'A screening number answer must be numeric.' USING errcode='22000';
      END IF;
    ELSIF v_question_type='yes_no' THEN
      IF jsonb_typeof(v_answer)<>'string' OR lower(v_answer #>> '{}') NOT IN ('yes','no') THEN
        RAISE EXCEPTION 'A yes or no screening answer must be Yes or No.' USING errcode='22000';
      END IF;
    ELSIF v_question_type='date' THEN
      IF jsonb_typeof(v_answer)<>'string' OR (v_answer #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'A screening date answer must use YYYY-MM-DD.' USING errcode='22000';
      END IF;
      BEGIN
        v_screening_date := (v_answer #>> '{}')::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'A screening date answer is not a valid calendar date.' USING errcode='22000';
      END;
      IF v_screening_date::text<>(v_answer #>> '{}') THEN
        RAISE EXCEPTION 'A screening date answer is not a valid calendar date.' USING errcode='22000';
      END IF;
    ELSIF v_question_type='single_select' THEN
      IF jsonb_typeof(v_answer)<>'string' THEN
        RAISE EXCEPTION 'A single-select answer must be one of the listed options.' USING errcode='22000';
      END IF;
      v_value := btrim(v_answer #>> '{}');
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_question->'options') AS opt(value)
        WHERE btrim(opt.value)=v_value
      ) THEN
        RAISE EXCEPTION 'A single-select answer is not an available option.' USING errcode='22000';
      END IF;
    ELSIF v_question_type='multi_select' THEN
      IF jsonb_typeof(v_answer)<>'array' THEN
        RAISE EXCEPTION 'A multi-select answer must be a list of listed options.' USING errcode='22000';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_answer) AS selected(value)
        WHERE jsonb_typeof(selected.value)<>'string'
          OR nullif(btrim(selected.value #>> '{}'),'') IS NULL
      ) THEN
        RAISE EXCEPTION 'Every multi-select answer must be a listed option.' USING errcode='22000';
      END IF;
      SELECT count(*)::integer, count(DISTINCT btrim(selected.value #>> '{}'))::integer
        INTO v_answer_count, v_question_count
      FROM jsonb_array_elements(v_answer) AS selected(value);
      IF v_answer_count<>v_question_count THEN
        RAISE EXCEPTION 'Duplicate multi-select answers are not allowed.' USING errcode='22000';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_answer) AS selected(value)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(v_question->'options') AS opt(value)
          WHERE btrim(opt.value)=btrim(selected.value)
        )
      ) THEN
        RAISE EXCEPTION 'A multi-select answer is not an available option.' USING errcode='22000';
      END IF;
    END IF;
  END LOOP;

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
    id,tenant_id,job_id,candidate_user_id,full_name,email,phone,
    years_experience,skills,cv_url,cover_letter,application_data
  )
  VALUES (
    gen_random_uuid(),v_job.tenant_id,v_job.id,auth.uid(),
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
