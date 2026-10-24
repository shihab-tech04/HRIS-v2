-- Candidate recruitment context is a per-user SECURITY DEFINER projection.
-- Keep its Data API entry point authenticated and retain the server-side
-- service role for trusted application and test operations.
BEGIN;

REVOKE ALL ON FUNCTION public.candidate_get_recruitment_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_get_recruitment_context() TO authenticated, service_role;

COMMIT;
