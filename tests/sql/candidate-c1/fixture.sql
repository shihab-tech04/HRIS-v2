-- Synthetic data only; this schema is intentionally minimal.
-- Verify the C1 migration revokes direct raw SELECT and anon TRUNCATE.
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY[
  'candidate_application_drafts','candidate_application_stage_history',
  'candidate_assessments','candidate_cvs','candidate_document_requests',
  'candidate_job_alerts','candidate_notifications','candidate_saved_jobs',
  'interviews','job_applications','job_offers','onboarding_handoffs'
 ] LOOP
  EXECUTE format('CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note text)',table_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('GRANT SELECT,TRUNCATE ON TABLE public.%I TO anon',table_name);
  EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated',table_name);
 END LOOP;
END $$;
