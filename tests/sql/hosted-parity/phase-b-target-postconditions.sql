-- WS02 Phase B: post-migration structural contract for replacement HRIS.
-- READ-ONLY. This file is a necessary SQL gate, NOT hosted Auth certification.
-- Every installed_after must be true following WS05's authorized application.
WITH checks(gate, installed_after, requirement) AS (
 SELECT '01 private buckets', (SELECT count(*)=3 AND bool_and(public=false) FROM storage.buckets
  WHERE id IN ('candidate-documents','employee-documents','attendance-evidence')),
  'all protected buckets remain private'
 UNION ALL SELECT '02 tenant Storage guard restrictive',
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND policyname='hris_private_storage_tenant_read_guard' AND permissive='RESTRICTIVE'
  AND cmd='SELECT' AND qual LIKE '%private.hris_storage_owner_tenant_read%'),
  'all permissive Storage SELECT policies intersect authorized object-owner tenant'
 UNION ALL SELECT '03 three object SELECT policies guarded',
  (SELECT count(*)=3 FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND permissive='PERMISSIVE'
     AND policyname IN ('candidate_documents_own_select',
                       'employee_documents_own_select','attendance_evidence_own_select')
     AND qual LIKE '%private.hris_storage_owner_tenant_read%'),
  'no broad permission-only SELECT on the three sensitive buckets'
 UNION ALL SELECT '04 old owner-only guard retired',
  (SELECT count(*)=0 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
     AND policyname='employee_documents_storage_owner_guard'),
  'permit authorized same-tenant retained-document review without relaxing new guard'
 UNION ALL SELECT '05 object resolver installed and scoped',
  EXISTS (
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='private' AND p.oid=to_regprocedure('private.hris_storage_owner_tenant_read(text,text)')
     AND p.prosecdef AND pg_get_functiondef(p.oid) LIKE '%has_tenant_permission%'
     AND pg_get_functiondef(p.oid) LIKE '%employee_documents%'
     AND pg_get_functiondef(p.oid) LIKE '%attendance_corrections%'
     AND pg_get_functiondef(p.oid) LIKE '%candidate_profiles%'
  ), 'owner, document, evidence and candidate tenant joins present'
 UNION ALL SELECT '06 object resolver grants',
  to_regprocedure('private.hris_storage_owner_tenant_read(text,text)') IS NOT NULL
  AND coalesce(has_function_privilege('authenticated',
    to_regprocedure('private.hris_storage_owner_tenant_read(text,text)'),'EXECUTE'),false)
  AND NOT coalesce(has_function_privilege('anon',
    to_regprocedure('private.hris_storage_owner_tenant_read(text,text)'),'EXECUTE'),true),
  'authenticated-only boolean lookup; no anonymous execute'
 UNION ALL SELECT '07 address restrictive guard',
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_addresses'
    AND policyname='employee_addresses_tenant_guard' AND permissive='RESTRICTIVE'
    AND qual LIKE '%hris_own_employee_for_tenant%' AND qual LIKE '%hris_admin_can_read_tenant%'),
  'self and authorized tenant admin, no unscoped alternate permissive access'
 UNION ALL SELECT '08 address permitted admin policy',
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_addresses'
    AND policyname='employee_addresses_tenant_admin_read' AND permissive='PERMISSIVE'
    AND qual LIKE '%hris_admin_can_read_tenant%')
  AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_addresses'
    AND policyname='employee_addresses_admin_read'),
  'retire legacy address admin policy'
 UNION ALL SELECT '09 family restrictive guard',
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_family_members'
    AND policyname='employee_family_tenant_guard' AND permissive='RESTRICTIVE'
    AND qual LIKE '%hris_employee_family_own_row%' AND qual LIKE '%hris_employee_family_admin_can_read%'),
  'family rows guarded by active tenant member and owner'
 UNION ALL SELECT '10 family owner/reviewer helpers',
  to_regprocedure('public.hris_employee_family_own_row(uuid)') IS NOT NULL
  AND to_regprocedure('public.hris_employee_family_admin_can_read(uuid)') IS NOT NULL,
  'explicit business ownership resolver and active tenant reviewer'
 UNION ALL SELECT '11 leave ACL authenticated read-only',
  NOT has_table_privilege('anon','public.leave_types','SELECT')
  AND has_table_privilege('authenticated','public.leave_types','SELECT')
  AND NOT has_table_privilege('authenticated','public.leave_types','INSERT')
  AND NOT has_table_privilege('authenticated','public.leave_types','UPDATE')
  AND NOT has_table_privilege('authenticated','public.leave_types','DELETE'),
  'direct client write denied; no anon table SELECT'
 UNION ALL SELECT '12 preserve candidate/staff jobs access',
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='jobs'
    AND policyname='jobs_staff_tenant_read' AND qual LIKE '%has_tenant_permission%')
  AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='jobs'
    AND policyname='jobs_candidate_related_read'
    AND qual LIKE '%hris_candidate_can_read_related_job%'),
  'do not overwrite equivalent existing jobs DDL'
 UNION ALL SELECT '13 protected decision RPC privileges',
  to_regprocedure('public.admin_resolve_leave_request(uuid,text,text)') IS NOT NULL
  AND NOT coalesce(has_function_privilege('anon',to_regprocedure('public.admin_resolve_leave_request(uuid,text,text)'),'EXECUTE'),true)
  AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.admin_resolve_leave_request(uuid,text,text)'),'EXECUTE'),false)
  AND to_regprocedure('public.admin_resolve_attendance_correction(uuid,text,text)') IS NOT NULL
  AND NOT coalesce(has_function_privilege('anon',to_regprocedure('public.admin_resolve_attendance_correction(uuid,text,text)'),'EXECUTE'),true)
  AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.admin_resolve_attendance_correction(uuid,text,text)'),'EXECUTE'),false),
  'authenticated-only leave and attendance decision calls'
 UNION ALL SELECT '14 sole Super Admin and protection',
  (SELECT count(*)=1 FROM public.admin_users WHERE active AND is_super_admin)
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_users'::regclass
      AND tgname='trg_protect_super_admin' AND NOT tgisinternal),
  'sole supreme authority and protected updates'
)
SELECT gate,coalesce(installed_after,false) AS installed_after,requirement
FROM checks ORDER BY gate;
