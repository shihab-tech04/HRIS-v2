-- Read-only hosted release preflight: these RPCs are already used by HRIS UI.
-- Missing functions or unsafe grants keep the hosted acceptance gate CLOSED.
-- Do not use this query to provision roles, grant access or replay migrations.
WITH required_rpc(feature, signature) AS (
  VALUES
    ('HR01 contact read', 'public.hris_get_tenant_employee_contact_details(uuid,uuid)'),
    ('HR01 contact write', 'public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)'),
    ('Recruitment list', 'public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer)'),
    ('Recruitment stage', 'public.hris_update_candidate_application_stage(uuid,uuid,text)'),
    ('Recruitment offer', 'public.hris_issue_candidate_offer(uuid,uuid,numeric,text,text,date,date,text)'),
    ('Interview schedule', 'public.hris_schedule_candidate_interview(uuid,uuid,text,text,timestamp without time zone,integer,text,text[],text)'),
    ('Interview responses', 'public.hris_get_candidate_interview_responses(uuid)'),
    ('Interview panel notes', 'public.hris_save_candidate_interview_panel_notes(uuid,uuid,text)'),
    ('Interview completion', 'public.hris_complete_candidate_interview(uuid,uuid)')
)
SELECT
  feature,
  signature,
  to_regprocedure(signature) IS NOT NULL AS function_exists,
  COALESCE(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), FALSE) AS authenticated_execute,
  COALESCE(has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), FALSE) AS anonymous_execute,
  to_regprocedure(signature) IS NOT NULL
    AND COALESCE(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), FALSE)
    AND NOT COALESCE(has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), FALSE) AS required_grant_gate
FROM required_rpc
ORDER BY feature;
