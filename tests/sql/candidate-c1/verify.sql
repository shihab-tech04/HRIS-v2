-- These assertions run against the isolated PostgreSQL 17 fixture only.
DO $$
DECLARE table_name text;
        privilege_name text;
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
  FOREACH privilege_name IN ARRAY ARRAY[
   'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
  ] LOOP
   IF has_table_privilege('anon',format('public.%I',table_name),privilege_name) THEN
    RAISE EXCEPTION 'Candidate C1 fail: anon still has % on %',privilege_name,table_name;
   END IF;
   IF has_table_privilege('authenticated',format('public.%I',table_name),privilege_name) THEN
    RAISE EXCEPTION 'Candidate C1 fail: authenticated still has % on %',privilege_name,table_name;
   END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role',format('public.%I',table_name),'SELECT')
     OR NOT has_table_privilege('service_role',format('public.%I',table_name),'INSERT')
     OR NOT has_table_privilege('service_role',format('public.%I',table_name),'UPDATE')
     OR NOT has_table_privilege('service_role',format('public.%I',table_name),'DELETE') THEN
   RAISE EXCEPTION 'Candidate C1 fail: service_role lost required RPC/backend access on %',table_name;
  END IF;
  RAISE NOTICE 'C1 PASS: all direct client privileges revoked; backend grants preserved: %',table_name;
 END LOOP;
END $$;
