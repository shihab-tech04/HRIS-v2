-- These assertions run against the isolated PostgreSQL 17 fixture only.
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY[
  'candidate_application_drafts','candidate_application_stage_history',
  'candidate_assessments','candidate_cvs','candidate_document_requests',
  'candidate_job_alerts','candidate_notifications','candidate_saved_jobs',
  'interviews','job_applications','job_offers','onboarding_handoffs'
 ] LOOP
  IF has_table_privilege('anon',format('public.%I',table_name),'TRUNCATE') THEN
   RAISE EXCEPTION 'Candidate C1 fail: anon can still TRUNCATE %',table_name;
  END IF;
  RAISE NOTICE 'C1 PASS: anon TRUNCATE restricted: %',table_name;
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY[
  'candidate_application_stage_history','job_applications','interviews',
  'candidate_assessments','candidate_document_requests','job_offers','onboarding_handoffs'
 ] LOOP
  IF has_table_privilege('authenticated',format('public.%I',table_name),'SELECT') THEN
   RAISE EXCEPTION 'Candidate C1 fail: auth can still read raw staff fields: %',table_name;
  END IF;
  RAISE NOTICE 'C1 PASS: raw authenticated SELECT restricted: %',table_name;
 END LOOP;
END $$;
