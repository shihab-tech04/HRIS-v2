-- Synthetic two-tenant check of the production candidate context function.
BEGIN;

INSERT INTO public.candidate_profiles
  (user_id,tenant_id,email,full_name,profile_status,skills,profile_data)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','candidate-a@c1.test','Candidate A','active',ARRAY['sql'],jsonb_build_object('marker','profile-a')),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','candidate-b@c1.test','Candidate B','active',ARRAY['design'],jsonb_build_object('marker','profile-b')),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','candidate-inactive@c1.test','Inactive Candidate','inactive',ARRAY[]::text[],'{}'::jsonb);

INSERT INTO public.candidate_published_jobs
  (id,tenant_id,reference_number,title,department_name,location_name,status,is_published,is_active,published_at)
VALUES
  ('10101010-1010-4010-8010-101010101010','11111111-1111-4111-8111-111111111111','A-1','Tenant A Role','Engineering','Dhaka','published',true,true,now()),
  ('20202020-2020-4020-8020-202020202020','22222222-2222-4222-8222-222222222222','B-1','Tenant B Role','Design','Remote','published',true,true,now());

INSERT INTO public.jobs (id,tenant_id,reference_number,title,workplace_type,employment_type)
VALUES
  ('11111110-1111-4111-8111-111111111110','11111111-1111-4111-8111-111111111111','A-1','Tenant A Role','Hybrid','Full-time'),
  ('22222220-2222-4222-8222-222222222220','22222222-2222-4222-8222-222222222222','B-1','Tenant B Role','Remote','Full-time');

INSERT INTO public.job_applications
  (id,tenant_id,job_id,candidate_user_id,full_name,email,stage,status_note,application_data)
VALUES
  ('30303030-3030-4030-8030-303030303030','11111111-1111-4111-8111-111111111111','11111110-1111-4111-8111-111111111110','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Candidate A','candidate-a@c1.test','interview','private current staff status','{}'),
  ('40404040-4040-4040-8040-404040404040','22222222-2222-4222-8222-222222222222','22222220-2222-4222-8222-222222222220','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Candidate B','candidate-b@c1.test','withdrawn','candidate withdrawal note B','{}');

INSERT INTO public.candidate_application_stage_history
  (id,application_id,stage,note,actor_type,actor_user_id,created_at)
VALUES
  ('51515151-5151-4151-8151-515151515151','30303030-3030-4030-8030-303030303030','interview','private staff note A','employee','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','2026-01-01T00:00:00Z'),
  ('52525252-5252-4252-8252-525252525252','30303030-3030-4030-8030-303030303030','interview','candidate-visible note A','candidate','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-01-02T00:00:00Z'),
  ('53535353-5353-4353-8353-535353535353','40404040-4040-4040-8040-404040404040','screening','private staff note B','employee','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','2026-01-01T00:00:00Z');

INSERT INTO public.interviews
  (id,application_id,scheduled_at,interview_type,panel_notes,status,panel_members)
VALUES
  ('61616161-6161-4161-8161-616161616161','30303030-3030-4030-8030-303030303030',now(),'Video','private panel notes A','scheduled',ARRAY['Hiring Manager']),
  ('62626262-6262-4262-8262-626262626262','40404040-4040-4040-8040-404040404040',now(),'Video','private panel notes B','scheduled',ARRAY['Hiring Manager']);

INSERT INTO public.candidate_assessments
  (id,application_id,title,assessment_type,instructions,deadline_date,status,review_note,reviewed_by)
VALUES
  ('71717171-7171-4171-8171-717171717171','30303030-3030-4030-8030-303030303030','Assessment A','Technical','Complete this task',current_date,'submitted','private review note A','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('72727272-7272-4272-8272-727272727272','40404040-4040-4040-8040-404040404040','Assessment B','Technical','Complete this task',current_date,'submitted','private review note B','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

INSERT INTO public.candidate_document_requests
  (id,application_id,document_title,description,due_date,status,verification_note,verified_by)
VALUES
  ('81818181-8181-4181-8181-818181818181','30303030-3030-4030-8030-303030303030','Document A','Upload document',current_date,'submitted','private verification note A','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('82828282-8282-4282-8282-828282828282','40404040-4040-4040-8040-404040404040','Document B','Upload document',current_date,'submitted','private verification note B','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

INSERT INTO public.job_offers
  (id,application_id,offered_title,salary_currency,status,issued_by,pay_period)
VALUES
  ('91919191-9191-4191-8191-919191919191','30303030-3030-4030-8030-303030303030','Role A','BDT','pending','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','monthly'),
  ('92929292-9292-4292-8292-929292929292','40404040-4040-4040-8040-404040404040','Role B','BDT','pending','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','monthly');

INSERT INTO auth.sessions (id,user_id,not_after)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()+interval '1 hour'),
  ('bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()+interval '1 hour'),
  ('cccccccc-0000-4000-8000-000000000003','cccccccc-cccc-4ccc-8ccc-cccccccccccc',now()+interval '1 hour');

DO $$
BEGIN
  IF has_function_privilege('anon','public.candidate_get_recruitment_context()','EXECUTE') THEN
    RAISE EXCEPTION 'C1 fail: anon can execute candidate context RPC';
  END IF;
  IF NOT has_function_privilege('authenticated','public.candidate_get_recruitment_context()','EXECUTE') THEN
    RAISE EXCEPTION 'C1 fail: authenticated cannot execute candidate context RPC';
  END IF;
  IF has_function_privilege('anon','public.get_my_candidate_profile()','EXECUTE')
     OR has_function_privilege('anon','public.candidate_update_profile(jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_my_candidate_profile()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.candidate_update_profile(jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.get_my_candidate_profile()','EXECUTE')
     OR NOT has_function_privilege('service_role','public.candidate_update_profile(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'C1 fail: candidate profile RPC grants changed';
  END IF;
  RAISE NOTICE 'C1 PASS: candidate context RPC execute grant is authenticated-only';
END $$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_context jsonb;
  v_profile jsonb;
  v_inactive_denied boolean := false;
  v_inactive_update_denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","session_id":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',true);
  v_context := public.candidate_get_recruitment_context();
  IF v_context->'profile'->>'user_id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     OR v_context->'profile'->>'tenant_id' <> '11111111-1111-4111-8111-111111111111'
     OR jsonb_array_length(v_context->'jobs') <> 1
     OR v_context::text LIKE '%candidate-b@c1.test%'
     OR v_context::text LIKE '%private staff note A%'
     OR v_context::text LIKE '%private panel notes A%'
     OR v_context::text LIKE '%private review note A%'
     OR v_context::text LIKE '%private verification note A%' THEN
    RAISE EXCEPTION 'C1 fail: tenant A context leaked another tenant or restricted staff data: %',v_context;
  END IF;
  IF v_context->'applications'->0->'stage_history'->0 ? 'actor_user_id'
     OR v_context->'applications'->0->'stage_history'->0 ? 'note'
     OR v_context->'applications'->0->'stage_history'->1->>'note' <> 'candidate-visible note A'
     OR v_context->'applications'->0 ? 'status_note'
     OR v_context->'interviews'->0 ? 'panel_notes'
     OR v_context->'interviews'->0 ? 'created_by'
     OR v_context->'assessments'->0 ? 'review_note'
     OR v_context->'assessments'->0 ? 'reviewed_by'
     OR v_context->'document_requests'->0 ? 'verification_note'
     OR v_context->'document_requests'->0 ? 'verified_by'
     OR v_context->'offers'->0 ? 'issued_by' THEN
    RAISE EXCEPTION 'C1 fail: tenant A context sanitization or candidate note visibility changed: %',v_context;
  END IF;
  RAISE NOTICE 'C1 PASS: tenant A sees only its profile/data and sanitized review fields';

  v_profile := public.get_my_candidate_profile();
  IF v_profile->>'user_id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     OR v_profile->>'tenant_id' <> '11111111-1111-4111-8111-111111111111' THEN
    RAISE EXCEPTION 'C1 fail: tenant A profile RPC returned the wrong row: %',v_profile;
  END IF;
  v_profile := public.candidate_update_profile(jsonb_build_object(
    'full_name','Candidate A Updated','headline','A-only headline','skills',jsonb_build_array('sql','react'),
    'tenant_id','22222222-2222-4222-8222-222222222222','profile_status','inactive','email','forged@example.test'
  ));
  IF v_profile->>'full_name' <> 'Candidate A Updated'
     OR v_profile->>'headline' <> 'A-only headline'
     OR v_profile->>'tenant_id' <> '11111111-1111-4111-8111-111111111111'
     OR v_profile->>'profile_status' <> 'active'
     OR v_profile->>'email' <> 'candidate-a@c1.test'
     OR NOT (v_profile->'skills' ? 'react') THEN
    RAISE EXCEPTION 'C1 fail: tenant A profile update crossed tenant or protected fields: %',v_profile;
  END IF;
  RAISE NOTICE 'C1 PASS: tenant A reads and updates only its active profile fields';

  PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
  PERFORM set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","session_id":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}',true);
  v_context := public.candidate_get_recruitment_context();
  IF v_context->'profile'->>'user_id' <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     OR v_context->'profile'->>'tenant_id' <> '22222222-2222-4222-8222-222222222222'
     OR jsonb_array_length(v_context->'jobs') <> 1
     OR v_context::text LIKE '%candidate-a@c1.test%'
     OR v_context::text LIKE '%private staff note B%'
     OR v_context::text LIKE '%private panel notes B%'
     OR v_context::text LIKE '%private review note B%'
     OR v_context::text LIKE '%private verification note B%' THEN
    RAISE EXCEPTION 'C1 fail: tenant B context leaked another tenant or restricted staff data: %',v_context;
  END IF;
  IF v_context->'applications'->0->>'status_note' <> 'candidate withdrawal note B'
     OR v_context->'interviews'->0 ? 'panel_notes'
     OR v_context->'assessments'->0 ? 'review_note'
     OR v_context->'document_requests'->0 ? 'verification_note'
     OR v_context->'offers'->0 ? 'issued_by' THEN
    RAISE EXCEPTION 'C1 fail: tenant B candidate-authored withdrawal note or sanitization changed: %',v_context;
  END IF;
  RAISE NOTICE 'C1 PASS: tenant B is not pinned to synesis-it and sees only its own sanitized context';

  v_profile := public.get_my_candidate_profile();
  IF v_profile->>'user_id' <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     OR v_profile->>'tenant_id' <> '22222222-2222-4222-8222-222222222222' THEN
    RAISE EXCEPTION 'C1 fail: tenant B profile RPC returned the wrong row: %',v_profile;
  END IF;
  v_profile := public.candidate_update_profile(jsonb_build_object(
    'full_name','Candidate B Updated','headline','B-only headline',
    'tenant_id','11111111-1111-4111-8111-111111111111'
  ));
  IF v_profile->>'full_name' <> 'Candidate B Updated'
     OR v_profile->>'headline' <> 'B-only headline'
     OR v_profile->>'tenant_id' <> '22222222-2222-4222-8222-222222222222'
     OR v_profile->>'email' <> 'candidate-b@c1.test' THEN
    RAISE EXCEPTION 'C1 fail: tenant B profile update crossed tenant or protected fields: %',v_profile;
  END IF;
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","session_id":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',true);
  v_profile := public.get_my_candidate_profile();
  IF v_profile->>'full_name' <> 'Candidate A Updated' OR v_profile->>'headline' <> 'A-only headline' THEN
    RAISE EXCEPTION 'C1 fail: tenant B profile update changed tenant A data: %',v_profile;
  END IF;
  RAISE NOTICE 'C1 PASS: tenant B updates do not mutate tenant A profile';

  PERFORM set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
  PERFORM set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","session_id":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}',true);
  BEGIN
    PERFORM public.candidate_get_recruitment_context();
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_inactive_denied := true;
  END;
  IF NOT v_inactive_denied THEN
    RAISE EXCEPTION 'C1 fail: inactive candidate profile reached the context RPC';
  END IF;
  IF public.get_my_candidate_profile() IS NOT NULL THEN
    RAISE EXCEPTION 'C1 fail: inactive candidate profile RPC returned a profile';
  END IF;
  BEGIN
    PERFORM public.candidate_update_profile('{"full_name":"Should Not Save"}'::jsonb);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_inactive_update_denied := true;
  END;
  IF NOT v_inactive_update_denied THEN
    RAISE EXCEPTION 'C1 fail: inactive candidate profile update was not denied';
  END IF;
  RAISE NOTICE 'C1 PASS: inactive candidate profile read is empty and update is denied';
END $$;

RESET ROLE;
DELETE FROM auth.sessions
WHERE id IN (
  'aaaaaaaa-0000-4000-8000-000000000001',
  'bbbbbbbb-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000003'
);

COMMIT;
