-- Atomically register a candidate-owned, privately stored supporting document.
-- The application RPC later revalidates ownership, metadata and object presence.
CREATE OR REPLACE FUNCTION public.candidate_add_application_document(
  p_title text,
  p_file_name text,
  p_file_path text,
  p_content_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'storage'
AS $function$
DECLARE
  v_profile public.candidate_profiles%rowtype;
  v_documents jsonb;
  v_document jsonb;
  v_extension text;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Candidate sign in required.' USING errcode='42501';
  END IF;

  IF nullif(btrim(p_title),'') IS NULL OR length(btrim(p_title))>120 THEN
    RAISE EXCEPTION 'Document title must be between 1 and 120 characters.' USING errcode='22000';
  END IF;
  IF nullif(btrim(p_file_name),'') IS NULL OR length(btrim(p_file_name))>255 THEN
    RAISE EXCEPTION 'A valid document filename is required.' USING errcode='22000';
  END IF;
  v_extension := lower(split_part(btrim(p_file_name),'.',array_length(string_to_array(btrim(p_file_name),'.'),1)));
  IF v_extension NOT IN ('pdf','doc','docx') THEN
    RAISE EXCEPTION 'Upload a PDF or Word document.' USING errcode='22000';
  END IF;
  IF p_content_type NOT IN (
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ) THEN
    RAISE EXCEPTION 'Unsupported document type.' USING errcode='22000';
  END IF;

  SELECT * INTO v_profile
  FROM public.candidate_profiles
  WHERE user_id=auth.uid() AND profile_status='active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active candidate account required.' USING errcode='42501'; END IF;

  IF p_file_path IS NULL
     OR split_part(p_file_path,'/',1)<>auth.uid()::text
     OR split_part(p_file_path,'/',2)<>'application-documents'
     OR split_part(p_file_path,'/',3)='' OR split_part(p_file_path,'/',4)<>''
     OR lower(p_file_path) !~ '\.(pdf|doc|docx)$'
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects
       WHERE bucket_id='candidate-documents' AND name=p_file_path
     ) THEN
    RAISE EXCEPTION 'Uploaded document is not available in your private candidate storage.' USING errcode='42501';
  END IF;

  v_documents := coalesce(v_profile.profile_data->'documents','[]'::jsonb);
  IF jsonb_typeof(v_documents)<>'array' THEN
    RAISE EXCEPTION 'Candidate document profile data is invalid; contact HR support.' USING errcode='22000';
  END IF;

  v_document := jsonb_build_object(
    'id',gen_random_uuid(),
    'title',btrim(p_title),
    'fileName',btrim(p_file_name),
    'fileUrl',p_file_path,
    'contentType',p_content_type,
    'uploadedAt',now()
  );

  UPDATE public.candidate_profiles
  SET profile_data=jsonb_set(
    coalesce(profile_data,'{}'::jsonb),
    '{documents}',
    v_documents || jsonb_build_array(v_document),
    true
  ), updated_at=now()
  WHERE user_id=auth.uid() AND profile_status='active';

  RETURN v_document;
END;
$function$;

REVOKE ALL ON FUNCTION public.candidate_add_application_document(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_add_application_document(text,text,text,text) TO authenticated, service_role;
