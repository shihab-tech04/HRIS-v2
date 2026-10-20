-- Source ACL: supabase/migrations/20261013153500_hris_learning_employee_self_service.sql.
-- New hosted wrapper must preserve the same authenticated-only contract.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_catalog.pg_advisory_xact_lock(20261019,4);
DO $preflight$
BEGIN
 IF to_regprocedure('public.hris_get_my_learning_context(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Learning context prerequisite is absent';
 END IF;
END $preflight$;
REVOKE ALL ON FUNCTION public.hris_get_my_learning_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_learning_context(uuid) TO authenticated, service_role;
DO $postflight$
BEGIN
 IF has_function_privilege('anon','public.hris_get_my_learning_context(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.hris_get_my_learning_context(uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.hris_get_my_learning_context(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Learning context ACL acceptance failed';
 END IF;
END $postflight$;
COMMIT;
