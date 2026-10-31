-- Gate B: read-only catalog checks for the 17 October employee SQL contract.
-- Safe for hosted SQL Editor / execute_sql: this file does not mutate schema or data.
-- PASS here is only prerequisite/API parity; authenticated journey acceptance is separate.
WITH required_procedures(signature, source) AS (
  VALUES
    ('private.hris_get_my_employee_documents(uuid)', '20261017010000'),
    ('public.hris_get_my_employee_documents(uuid)', '20261017010000'),
    ('public.hris_get_my_employee_identity_card(uuid)', '20261017020000'),
    ('public.hris_get_my_dashboard_data(uuid)', '20261017060001'),
    ('public.hris_get_my_pending_requests(uuid)', '20261017060000'),
    ('public.hris_employee_submit_attendance_correction(uuid,jsonb)', '20261017074518'),
    ('public.hris_get_tenant_employee_directory_v2(uuid,text,uuid,uuid,text,integer,integer)', '20261017092147'),
    ('public.hris_change_tenant_employee_shift(uuid,uuid,uuid,uuid)', '20261017095321'),
    ('public.hris_get_my_shift_changes(uuid,date,date)', '20261017095321'),
    ('public.hris_profile_change_active_member(uuid)', '20261017130000'),
    ('private.hris_profile_document_is_unlinked(uuid,text)', '20261027040642'),
    ('public.hris_notices_super_admin_tenant_member(uuid)', '20261017030000'),
    ('public.employee_get_my_profile_v1(uuid)', '20261027040642'),
    ('public.employee_delete_my_profile_record_v1(uuid,text,uuid)', '20261027040642'),
    ('public.employee_save_my_education_v1(uuid,jsonb)', '20261027040642'),
    ('public.employee_save_my_experience_v1(uuid,jsonb)', '20261027040642'),
    ('public.employee_save_my_family_member_v1(uuid,jsonb)', '20261027040642'),
    ('public.employee_save_my_bank_v1(uuid,jsonb)', '20261027040642'),
    ('public.employee_save_my_training_v1(uuid,jsonb)', '20261027040642'),
    ('public.employee_save_my_certification_v1(uuid,jsonb)', '20261027040642'),
    ('public.employee_submit_profile_change_request(uuid,text,text,text)', '20261027040642'),
    ('public.employee_get_my_profile_change_requests(uuid)', '20261017130000'),
    ('public.admin_list_profile_change_requests(uuid)', '20261017130000'),
    ('public.admin_review_profile_change_request(uuid,uuid,text,text)', '20261027040642')
),
required_internal_procedures(signature, source) AS (
  VALUES
    ('private.hris_record_employee_shift_change()', '20261017095321'),
    ('private.hris_profile_own_employee(uuid)', '20261027040642')
),
required_prerequisites(kind, signature, source) AS (
  VALUES
    ('function', 'public.has_tenant_permission(uuid,text)', '20261012091930'),
    ('function', 'public.hris_is_active_tenant_member(uuid)', '20261012230100'),
    ('table', 'public.roster_change_notifications', '20261016230201'),
    ('table', 'public.employee_shift_assignment_changes', '20261017095321'),
    ('protected_table', 'public.employee_bank_details', '20261027040642'),
    ('private_bucket', 'employee-documents', '20261027040642')
),
retired_procedures(signature, source) AS (
  VALUES
    ('public.employee_submit_profile_change_request(text,text,text)', '20261017130000'),
    ('public.employee_get_my_profile_change_requests()', '20261017130000'),
    ('public.admin_list_profile_change_requests()', '20261017130000'),
    ('public.admin_review_profile_change_request(uuid,text,text)', '20261017130000')
),
revoked_procedures(signature, source) AS (
  VALUES
    ('public.employee_get_my_profile()', '20261027040642'),
    ('public.employee_update_my_profile(jsonb)', '20261027040642'),
    ('public.employee_update_my_bank(jsonb)', '20261027040642'),
    ('public.employee_save_my_addresses_v2(jsonb)', '20261027040642'),
    ('public.employee_save_my_education_v2(jsonb)', '20261027040642'),
    ('public.employee_save_my_experience_v2(jsonb)', '20261027040642'),
    ('public.employee_save_my_family_members_v2(jsonb)', '20261027040642'),
    ('public.employee_replace_my_profile_section(text,jsonb)', '20261027040642')
),
required_policies(schemaname, table_name, policy_name, expected_permissive, source) AS (
  VALUES
    ('public', 'notices', 'hris_notices_membership_guard', 'RESTRICTIVE', '20261017030000'),
    ('public', 'employee_profile_change_requests', 'employee_profile_change_read_own_or_authorized_review', 'PERMISSIVE', '20261017130000'),
    ('storage', 'objects', 'employee_profile_certificate_insert', 'PERMISSIVE', '20261027040642'),
    ('storage', 'objects', 'employee_profile_certificate_orphan_delete', 'PERMISSIVE', '20261027040642'),
    ('storage', 'objects', 'employee_profile_certificate_select_namespace_guard', 'RESTRICTIVE', '20261030114500'),
    ('storage', 'objects', 'employee_profile_certificate_insert_namespace_guard', 'RESTRICTIVE', '20261030114500'),
    ('storage', 'objects', 'employee_profile_certificate_update_namespace_guard', 'RESTRICTIVE', '20261030114500'),
    ('storage', 'objects', 'employee_profile_certificate_delete_namespace_guard', 'RESTRICTIVE', '20261030114500'),
    ('storage', 'objects', 'employee_documents_own_insert', 'PERMISSIVE', 'replacement-baseline'),
    ('storage', 'objects', 'employee_documents_own_update', 'PERMISSIVE', 'replacement-baseline'),
    ('storage', 'objects', 'employee_documents_own_delete', 'PERMISSIVE', 'replacement-baseline')
),
checks AS (
  SELECT 'required_rpc'::text AS kind, signature AS object, source,
    COALESCE(to_regprocedure(signature) IS NOT NULL
      AND has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
      AND NOT has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false) AS passed,
    'exists, authenticated executable, anon not executable'::text AS requirement
  FROM required_procedures
  UNION ALL
  SELECT 'internal_trigger', signature, source,
    COALESCE(to_regprocedure(signature) IS NOT NULL
      AND NOT has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
      AND NOT has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false),
    'exists, not executable by authenticated or anon'
  FROM required_internal_procedures
  UNION ALL
  SELECT 'prerequisite', signature, source,
    CASE WHEN kind = 'function' THEN to_regprocedure(signature) IS NOT NULL
      WHEN kind = 'protected_table' THEN to_regclass(signature) IS NOT NULL
        AND COALESCE((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid=to_regclass(signature)),false)
        AND NOT has_table_privilege('authenticated',to_regclass(signature),'SELECT')
        AND NOT has_table_privilege('anon',to_regclass(signature),'SELECT')
        AND NOT has_table_privilege('service_role',to_regclass(signature),'SELECT')
      WHEN kind = 'private_bucket' THEN EXISTS (
        SELECT 1 FROM storage.buckets b WHERE b.id=signature AND b.public IS FALSE
      )
      ELSE to_regclass(signature) IS NOT NULL END,
    CASE WHEN kind='private_bucket' THEN 'private storage bucket exists' ELSE kind || ' exists' END
  FROM required_prerequisites
  UNION ALL
  SELECT 'retired_overload', signature, source, to_regprocedure(signature) IS NULL,
    'legacy tenant-implicit RPC absent'
  FROM retired_procedures
  UNION ALL
  SELECT 'revoked_legacy_rpc', signature, source,
    COALESCE(to_regprocedure(signature) IS NULL OR (
      NOT has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
      AND NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE')
      AND NOT has_function_privilege('service_role',to_regprocedure(signature),'EXECUTE')
    ),false),
    'tenantless profile RPC is absent or unavailable to application roles'
  FROM revoked_procedures
  UNION ALL
  SELECT 'policy', schemaname || '.' || table_name || '/' || policy_name, source,
    EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = required_policies.schemaname AND p.tablename = required_policies.table_name
        AND p.policyname = policy_name AND p.permissive = expected_permissive
        AND CASE
          WHEN policy_name = 'employee_profile_change_read_own_or_authorized_review'
            THEN p.qual LIKE '%hris_profile_change_active_member%'
          WHEN policy_name = 'hris_notices_membership_guard'
            THEN p.qual LIKE '%hris_own_employee_for_tenant%'
              AND p.qual LIKE '%hris_notices_super_admin_tenant_member%'
              AND p.qual NOT LIKE '%is_active_admin%'
              AND NOT EXISTS (
                SELECT 1 FROM pg_policies legacy
                WHERE legacy.schemaname = 'public'
                  AND legacy.tablename = 'notices'
                  AND legacy.policyname = 'hris_notices_legacy_security_guard'
              )
          WHEN policy_name = 'employee_profile_certificate_insert'
            THEN p.with_check LIKE '%employee-documents%'
              AND p.with_check LIKE '%hris_profile_change_active_member%'
              AND p.with_check LIKE '%profile-certificates%'
          WHEN policy_name = 'employee_profile_certificate_orphan_delete'
            THEN p.qual LIKE '%hris_profile_document_is_unlinked%'
              AND p.qual LIKE '%profile-certificates%'
          WHEN policy_name = 'employee_profile_certificate_select_namespace_guard'
             THEN p.cmd='SELECT'
               AND p.qual LIKE '%profile-certificates%'
               AND p.qual LIKE '%array_position%'
               AND p.qual LIKE '%is_live_session%'
               AND p.qual LIKE '%hris_profile_change_active_member%'
               AND p.qual LIKE '%hris_own_employee_for_tenant%'
               AND p.qual LIKE '%has_tenant_permission%'
               AND p.qual LIKE '%employees.view%'
               AND p.qual LIKE '%employees.manage%'
           WHEN policy_name = 'employee_profile_certificate_insert_namespace_guard'
            THEN p.with_check LIKE '%array_position%'
              AND p.with_check LIKE '%profile-certificates%'
              AND p.with_check LIKE '%hris_profile_change_active_member%'
              AND p.with_check LIKE '%hris_own_employee_for_tenant%'
          WHEN policy_name = 'employee_profile_certificate_update_namespace_guard'
            THEN p.qual LIKE '%array_position%'
              AND p.with_check LIKE '%array_position%'
              AND p.qual LIKE '%profile-certificates%'
              AND p.with_check LIKE '%profile-certificates%'
          WHEN policy_name = 'employee_profile_certificate_delete_namespace_guard'
            THEN p.qual LIKE '%array_position%'
              AND p.qual LIKE '%profile-certificates%'
              AND p.qual LIKE '%hris_profile_change_active_member%'
              AND p.qual LIKE '%hris_own_employee_for_tenant%'
              AND p.qual LIKE '%hris_profile_document_is_unlinked%'
          WHEN policy_name = 'employee_documents_own_insert'
            THEN p.cmd='INSERT'
              AND p.with_check LIKE '%employee-documents%'
              AND p.with_check LIKE '%foldername%'
              AND p.with_check LIKE '%employee_for_auth_user%'
          WHEN policy_name = 'employee_documents_own_update'
            THEN p.cmd='UPDATE'
              AND p.qual LIKE '%employee-documents%'
              AND p.qual LIKE '%foldername%'
              AND p.with_check LIKE '%employee-documents%'
              AND p.with_check LIKE '%foldername%'
          WHEN policy_name = 'employee_documents_own_delete'
            THEN p.cmd='DELETE'
              AND p.qual LIKE '%employee-documents%'
              AND p.qual LIKE '%foldername%'
          ELSE FALSE
        END
    ), 'tenant-scoped predicate; legacy notices guard absent where applicable'
  FROM required_policies
)
SELECT kind, object, source AS source_version, passed, requirement
FROM checks ORDER BY passed, kind, object;
