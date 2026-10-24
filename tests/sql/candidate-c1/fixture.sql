-- Synthetic data only; this schema is intentionally minimal.
-- Model broad legacy/default grants so the migrations prove they remove
-- direct client access rather than passing because no access was present.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
  CREATE ROLE anon NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
  CREATE ROLE service_role NOLOGIN;
 END IF;
END $$;

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

 -- These seven tables are read/written through security-definer RPCs. Simulate
 -- legacy broad grants, including PUBLIC inheritance, before applying the fix.
 FOREACH table_name IN ARRAY ARRAY[
  'candidate_application_stage_history','candidate_assessments',
  'candidate_document_requests','interviews','job_applications',
  'job_offers','onboarding_handoffs'
 ] LOOP
  EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO PUBLIC',table_name);
  EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO anon, authenticated, service_role',table_name);
 END LOOP;
END $$;
