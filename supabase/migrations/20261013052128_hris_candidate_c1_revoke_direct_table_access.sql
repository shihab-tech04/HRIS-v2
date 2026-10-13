-- Candidate data in these tables is accessed through candidate/staff RPCs.
-- RLS policies alone do not remove table privileges or inherited PUBLIC grants.
-- Keep every client role off the raw tables; this leaves the SQL RPC path and
-- server-only service_role access intact.
REVOKE ALL PRIVILEGES ON TABLE
  public.candidate_application_stage_history,
  public.job_applications,
  public.interviews,
  public.candidate_assessments,
  public.candidate_document_requests,
  public.job_offers,
  public.onboarding_handoffs
FROM PUBLIC, anon, authenticated;
