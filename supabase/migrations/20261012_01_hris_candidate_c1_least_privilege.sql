-- Existing Candidate C1 permission correction (no row mutation).
-- Public job browsing remains through candidate_public_jobs_source().
-- Direct raw table reads expose internal reviewer notes despite row-level checks.
REVOKE SELECT ON TABLE
  public.candidate_application_stage_history,
  public.job_applications,
  public.interviews,
  public.candidate_assessments,
  public.candidate_document_requests,
  public.job_offers,
  public.onboarding_handoffs
FROM authenticated;

-- Anonymous database sessions do not require TRUNCATE on candidate records.
-- REVOKE is narrower than deleting tables, rows, RLS policies or entire grants.
REVOKE TRUNCATE ON TABLE
  public.candidate_application_drafts,
  public.candidate_application_stage_history,
  public.candidate_assessments,
  public.candidate_cvs,
  public.candidate_document_requests,
  public.candidate_job_alerts,
  public.candidate_notifications,
  public.candidate_saved_jobs,
  public.interviews,
  public.job_applications,
  public.job_offers,
  public.onboarding_handoffs
FROM anon;
