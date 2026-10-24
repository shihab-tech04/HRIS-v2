-- READ ONLY; check current replacement dependencies before any hosted activation.
-- This is structural, NOT an authenticated acceptance or release approval.
SELECT
  to_regclass('public.candidate_profiles') IS NOT NULL AS candidate_profiles_exists,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_profiles' AND column_name IN ('user_id','profile_status','profile_data','updated_at'))=4 AS required_profile_columns,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id='candidate-documents' AND public IS FALSE) AS candidate_private_bucket,
  to_regprocedure('public.is_live_session()') IS NOT NULL AS session_helper,
  to_regprocedure('public.candidate_add_application_document(text,text,text,text)') IS NULL AS target_rpc_missing,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS hosted_migration_head;
