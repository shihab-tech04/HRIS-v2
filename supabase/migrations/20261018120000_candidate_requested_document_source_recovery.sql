-- Phase 06 source recovery: this exact callable body/signature already exists
-- on hosted HRIS Supabase as inspected read-only on 2026-10-18.
-- Preserve behavior and grants; do not replay before semantic migration-history
-- reconciliation and disposable Auth/RLS tests. This file is not a hosted write.
BEGIN;

CREATE OR REPLACE FUNCTION public.candidate_submit_requested_document(
  p_request_id uuid, p_file_name text, p_file_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'storage'
AS $function$
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Candidate sign in required.' USING errcode='42501';
  END IF;
  IF nullif(btrim(coalesce(p_file_name,'')),'') IS NULL
     OR nullif(btrim(coalesce(p_file_path,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Uploaded document is required.' USING errcode='22000';
  END IF;
  IF split_part(p_file_path,'/',1)<>auth.uid()::text THEN
    RAISE EXCEPTION 'Invalid candidate document path.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id='candidate-documents' AND name=p_file_path
  ) THEN
    RAISE EXCEPTION 'Uploaded document was not found in candidate storage.' USING errcode='P0002';
  END IF;

  UPDATE public.candidate_document_requests dr
  SET submitted_file_name=btrim(p_file_name),
      submitted_file_path=btrim(p_file_path),
      submitted_at=now(),status='submitted'
  FROM public.job_applications a
  WHERE dr.id=p_request_id
    AND a.id=dr.application_id
    AND a.candidate_user_id=auth.uid()
    AND dr.status='pending'
    AND dr.due_date>=current_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open document request not found or due date has passed.' USING errcode='P0002';
  END IF;
  RETURN jsonb_build_object('success',true,'status','submitted');
END;
$function$;

REVOKE ALL ON FUNCTION public.candidate_submit_requested_document(uuid,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_submit_requested_document(uuid,text,text)
  TO authenticated;

COMMIT;
