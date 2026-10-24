-- READ ONLY: verify prerequisites and exact missing contract before replacement activation.
SELECT
  to_regclass('public.tenants') IS NOT NULL AS tenants_table,
  to_regclass('public.jobs') IS NOT NULL AS jobs_table,
  to_regclass('public.job_applications') IS NOT NULL AS applications_table,
  to_regclass('public.candidate_application_stage_history') IS NOT NULL AS stage_history_table,
  to_regprocedure('public.is_live_session()') IS NOT NULL AS live_session_guard,
  to_regprocedure('public.hris_admin_can_read_tenant(uuid,text)') IS NOT NULL AS tenant_permission_guard,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name IN ('id','tenant_id','reference_number','title'))=4 AS job_columns,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='job_applications' AND column_name IN ('id','tenant_id','job_id','full_name','stage','applied_at'))=6 AS application_columns,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_application_stage_history' AND column_name IN ('id','application_id','stage','created_at'))=4 AS stage_history_columns,
  to_regprocedure('public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer)') IS NULL AS target_rpc_missing,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS hosted_migration_head;
