-- Projects recovery dependency snapshot for replacement xfuxnljfrgvusbrpvxpa.
-- READ ONLY; source-to-hosted preflight before reviewing PR #94. No identities.
WITH facts AS (
 SELECT current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AS pg17,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261022142012') AS replacement_baseline,
  (SELECT count(*) FROM public.tenant_memberships) AS memberships,
  (SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin) AS superadmins,
  (SELECT count(*) FROM public.tenants WHERE slug='synesis-it' AND is_active) AS active_synesis_tenants,
  to_regclass('public.projects') IS NOT NULL AS projects_present,
  to_regclass('public.project_allocations') IS NOT NULL AS allocations_present,
  to_regprocedure('public.is_live_session()') IS NOT NULL AS live_session_helper,
  to_regprocedure('public.has_tenant_permission(uuid,text)') IS NOT NULL AS permission_helper,
  to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NOT NULL AS employee_helper,
  to_regprocedure('public.hris_get_tenant_project_workspace(uuid)') IS NOT NULL AS project_workspace_rpc,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name IN ('id','tenant_id'))=2 AS employee_fk_columns,
  EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.employees'::regclass AND c.contype IN ('u','p') AND pg_get_constraintdef(c.oid) LIKE '%tenant_id%' AND pg_get_constraintdef(c.oid) LIKE '%id%') AS employee_composite_unique
)
SELECT facts.*,
 CASE WHEN NOT pg17 OR NOT replacement_baseline THEN 'BLOCKED_DATABASE_BASELINE'
 WHEN NOT live_session_helper OR NOT permission_helper OR NOT employee_helper THEN 'BLOCKED_SOURCE_HELPERS'
 WHEN active_synesis_tenants<>1 OR superadmins<>1 THEN 'BLOCKED_TOPOLOGY'
 WHEN projects_present OR allocations_present OR project_workspace_rpc THEN 'REVIEW_PARTIAL_INSTALLATION'
 WHEN NOT employee_fk_columns THEN 'BLOCKED_EMPLOYEE_FK_COLUMNS'
 ELSE 'SOURCE_CANDIDATE_ONLY_BACKUP_AND_ISOLATED_AUTH_TEST_REQUIRED'
 END AS gate
FROM facts;
