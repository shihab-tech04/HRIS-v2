-- Drop only tables created by the preceding Candidate C1 synthetic fixture.
DROP TABLE IF EXISTS
  public.candidate_profiles,
  public.candidate_published_jobs,
  public.jobs,
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
  public.onboarding_handoffs;
