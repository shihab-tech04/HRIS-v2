-- WS02 Phase B: replacement-HRIS-only BEFORE gate.
-- READ-ONLY. Run immediately before WS05-approved protected migration.
-- Every expected_before flag must be true; any deviation is an absolute STOP.
-- This is a snapshot contract, not a license to run production DDL.
WITH checks(gate, expected_before, why) AS (
 SELECT '01 PostgreSQL 17', current_setting('server_version_num')::int BETWEEN 170000 AND 179999,
        'reviewed migrations are PostgreSQL 17 tested'
 UNION ALL SELECT '02 clone-history head', COALESCE((SELECT max(version)='20261022142012' FROM supabase_migrations.schema_migrations),false),
        'source migration versions are not the clone ledger; do not invent rows'
 UNION ALL SELECT '03 single active Super Admin', (SELECT count(*)=1 FROM public.admin_users WHERE active AND is_super_admin),
        'never create another supreme principal'
 UNION ALL SELECT '04 protected user/member fixture untouched', (SELECT count(*)=1 FROM auth.users)
        AND (SELECT count(*)=1 FROM public.tenants)
        AND (SELECT count(*)=0 FROM public.tenant_memberships),
        'no synthetic test principals on hosted main'
 UNION ALL SELECT '05 three required buckets private', (SELECT count(*)=3 AND bool_and(public=false) FROM storage.buckets
        WHERE id IN ('candidate-documents','employee-documents','attendance-evidence')),
        'none of the three sensitive buckets is public'
 UNION ALL SELECT '06 private Storage currently empty', (SELECT count(*)=0 FROM storage.objects
        WHERE bucket_id IN ('candidate-documents','employee-documents','attendance-evidence')),
        'snapshot the object inventory and stop if it changes'
 UNION ALL SELECT '07 three old permissive SELECT policies', (SELECT count(*)=3 FROM pg_policies
        WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND permissive='PERMISSIVE'
        AND policyname IN ('candidate_documents_own_select','employee_documents_own_select','attendance_evidence_own_select')),
        'these are the three reviewed replacement targets'
 UNION ALL SELECT '08 no new Storage guard yet', (SELECT count(*)=0 FROM pg_policies
        WHERE schemaname='storage' AND tablename='objects' AND policyname='hris_private_storage_tenant_read_guard')
        AND to_regprocedure('private.hris_storage_owner_tenant_read(text,text)') IS NULL,
        'do not silently overwrite a newer deployment'
 UNION ALL SELECT '09 addresses legacy policy + no new guard', (SELECT count(*)=1 FROM pg_policies
        WHERE schemaname='public' AND tablename='employee_addresses' AND policyname='employee_addresses_admin_read')
        AND (SELECT count(*)=0 FROM pg_policies
        WHERE schemaname='public' AND tablename='employee_addresses' AND policyname='employee_addresses_tenant_guard'),
        'source introduces a restrictive tenant read guard'
 UNION ALL SELECT '10 family legacy policy + no new guard', (SELECT count(*)=1 FROM pg_policies
        WHERE schemaname='public' AND tablename='employee_family_members' AND policyname='employee_family_admin_read')
        AND (SELECT count(*)=0 FROM pg_policies
        WHERE schemaname='public' AND tablename='employee_family_members' AND policyname='employee_family_tenant_guard'),
        'source introduces explicit member-scoped reviewer and self resolver'
 UNION ALL SELECT '11 family helpers not yet installed',
        to_regprocedure('public.hris_employee_family_own_row(uuid)') IS NULL
        AND to_regprocedure('public.hris_employee_family_admin_can_read(uuid)') IS NULL,
        'do not replace an already-advanced family contract'
 UNION ALL SELECT '12 leave_type excess anon SELECT',
        has_table_privilege('anon','public.leave_types','SELECT')
        AND has_table_privilege('authenticated','public.leave_types','SELECT')
        AND NOT has_table_privilege('authenticated','public.leave_types','INSERT')
        AND NOT has_table_privilege('authenticated','public.leave_types','UPDATE')
        AND NOT has_table_privilege('authenticated','public.leave_types','DELETE'),
        'retain authenticated read; revoke anon SELECT and client write grants'
 UNION ALL SELECT '13 jobs existing staff tenant read',
        (SELECT count(*)=1 FROM pg_policies WHERE schemaname='public' AND tablename='jobs'
         AND policyname='jobs_staff_tenant_read' AND qual LIKE '%has_tenant_permission%')
        AND (SELECT count(*)=1 FROM pg_policies WHERE schemaname='public' AND tablename='jobs'
         AND policyname='jobs_candidate_related_read' AND qual LIKE '%private.hris_candidate_can_read_related_job%')
        AND NOT has_table_privilege('authenticated','public.jobs','INSERT')
        AND NOT has_table_privilege('authenticated','public.jobs','UPDATE'),
        'preserve already deployed jobs equivalent instead of replaying source version'
 UNION ALL SELECT '14 existing required Auth guards',
        to_regprocedure('public.is_live_session()') IS NOT NULL
        AND to_regprocedure('public.has_tenant_permission(uuid,text)') IS NOT NULL
        AND to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NOT NULL
        AND to_regprocedure('public.hris_admin_can_read_tenant(uuid,text)') IS NOT NULL,
        'abort if reviewed function dependencies have drifted'
 UNION ALL SELECT '15 Super Admin trigger retained',
        (SELECT count(*)=1 FROM pg_trigger WHERE tgrelid='public.admin_users'::regclass
         AND tgname='trg_protect_super_admin' AND NOT tgisinternal),
        'protect the sole supreme admin'
)
SELECT gate,coalesce(expected_before,false) AS expected_before,why
FROM checks ORDER BY gate;
