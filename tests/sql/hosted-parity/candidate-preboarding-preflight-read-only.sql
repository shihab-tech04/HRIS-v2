-- Read-only hosted dependency and absence gate. No identities or PII returned.
SELECT
 to_regclass('public.onboarding_handoffs') IS NOT NULL AS handoffs_table,
 to_regclass('public.job_applications') IS NOT NULL AS applications_table,
 to_regclass('public.job_offers') IS NOT NULL AS offers_table,
 to_regclass('public.candidate_profiles') IS NOT NULL AS candidate_profiles_table,
 to_regprocedure('public.is_live_session()') IS NOT NULL AS live_session_guard,
 to_regprocedure('public.has_tenant_permission(uuid,text)') IS NOT NULL AS tenant_permission_guard,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='onboarding_handoffs' AND column_name IN ('candidate_personal_data','candidate_completed_steps','candidate_submitted_at')) AS existing_preboarding_columns,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('candidate_get_my_preboarding_handoff','candidate_save_my_preboarding_step','hris_get_candidate_preboarding_queue')) AS existing_missing_target_rpcs,
 (SELECT max(version) FROM supabase_migrations.schema_migrations) AS migration_head;
