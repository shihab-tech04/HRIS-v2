-- Drop only tables created by the preceding Candidate C1 synthetic fixture.
-- Storage policies reference candidate_profiles and must be removed first.
DROP POLICY IF EXISTS c1_apply_storage_insert_own ON storage.objects;
DROP POLICY IF EXISTS c1_apply_storage_delete_own ON storage.objects;

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
