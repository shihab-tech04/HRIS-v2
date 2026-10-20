WITH checks AS (
SELECT 'sole_super_admin' AS test,(SELECT count(*)=1 FROM public.admin_users WHERE active AND is_super_admin) AS passed
UNION ALL SELECT 'second_admin_unassigned',NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN public.tenant_memberships m ON m.user_id=a.user_id WHERE a.active AND NOT a.is_super_admin AND lower(m.status)='active')
UNION ALL SELECT 'minimal_hr_admin_grant',(SELECT count(*)=1 AND bool_and(permission_id='organization.manage') FROM public.role_permissions WHERE role_id='hr_admin')
UNION ALL SELECT 'legacy_role_45_preserved',(SELECT count(*)=45 FROM public.role_permissions WHERE role_id='hris_system_admin')
UNION ALL SELECT 'one_active_membership',(SELECT count(*)=1 FROM public.tenant_memberships WHERE lower(status)='active')
UNION ALL SELECT 'no_module_defaults_seeded',NOT EXISTS(SELECT 1 FROM public.tenant_module_settings)
UNION ALL SELECT 'module_config_no_authenticated_table_access',NOT has_table_privilege('authenticated','public.tenant_module_settings','SELECT,INSERT,UPDATE,DELETE')
UNION ALL SELECT 'module_config_no_anonymous_table_access',NOT has_table_privilege('anon','public.tenant_module_settings','SELECT,INSERT,UPDATE,DELETE')
UNION ALL SELECT 'six_new_tables_rls',(SELECT count(*)=6 AND bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(ARRAY['employee_shift_assignment_changes','learning_completion_events','learning_completion_notifications','roster_change_notifications','tenant_module_settings','travel_request_notifications']))
UNION ALL SELECT 'fourteen_module_write_guards',(SELECT count(*)=14 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('hris_optional_travel_write_guard','hris_optional_expenses_write_guard','hris_optional_learning_write_guard'))
UNION ALL SELECT 'three_restrictive_storage_guards',(SELECT count(*)=3 AND bool_and(permissive='RESTRICTIVE') FROM pg_policies WHERE schemaname='storage' AND policyname IN ('hris_optional_module_storage_insert','hris_optional_module_storage_update','hris_optional_module_storage_delete'))
UNION ALL SELECT 'legacy_notices_guard_retired',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notices' AND policyname='hris_notices_legacy_security_guard')
UNION ALL SELECT 'learning_helper_anon_denied',NOT has_function_privilege('anon','public.hris_can_read_learning_catalog(uuid)','EXECUTE')
UNION ALL SELECT 'learning_helper_authenticated_callable',has_function_privilege('authenticated','public.hris_can_read_learning_catalog(uuid)','EXECUTE')
UNION ALL SELECT 'learning_null_tenant_denied',public.hris_can_read_learning_catalog(NULL::uuid)=false
UNION ALL SELECT 'platform_requires_live_session',public.platform_hris_is_super_admin()=false
UNION ALL SELECT 'only_one_new_history_record',(SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE version>'20261019100443')
) SELECT * FROM checks ORDER BY test;