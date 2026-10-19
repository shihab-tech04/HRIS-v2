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
    ('public.employee_submit_profile_change_request(uuid,text,text,text)', '20261017130000'),
    ('public.employee_get_my_profile_change_requests(uuid)', '20261017130000'),
    ('public.admin_list_profile_change_requests(uuid)', '20261017130000'),
    ('public.admin_review_profile_change_request(uuid,uuid,text,text)', '20261017130000')
),
required_internal_procedures(signature, source) AS (
  VALUES
    ('private.hris_record_employee_shift_change()', '20261017095321')
),
required_prerequisites(kind, signature, source) AS (
  VALUES
    ('function', 'public.has_tenant_permission(uuid,text)', '20261012091930'),
    ('function', 'public.hris_is_active_tenant_member(uuid)', '20261012230100'),
    ('table', 'public.roster_change_notifications', '20261016230201'),
    ('table', 'public.employee_shift_assignment_changes', '20261017095321')
),
retired_procedures(signature, source) AS (
  VALUES
    ('public.employee_submit_profile_change_request(text,text,text)', '20261017130000'),
    ('public.employee_get_my_profile_change_requests()', '20261017130000'),
    ('public.admin_list_profile_change_requests()', '20261017130000'),
    ('public.admin_review_profile_change_request(uuid,text,text)', '20261017130000')
),
required_policies(table_name, policy_name, expected_permissive, source) AS (
  VALUES
    ('notices', 'hris_notices_membership_guard', 'RESTRICTIVE', '20261017030000'),
    ('employee_profile_change_requests', 'employee_profile_change_read_own_or_authorized_review', 'PERMISSIVE', '20261017130000')
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
      ELSE to_regclass(signature) IS NOT NULL END,
    kind || ' exists'
  FROM required_prerequisites
  UNION ALL
  SELECT 'retired_overload', signature, source, to_regprocedure(signature) IS NULL,
    'legacy tenant-implicit RPC absent'
  FROM retired_procedures
  UNION ALL
  SELECT 'policy', 'public.' || table_name || '/' || policy_name, source,
    EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = table_name
        AND p.policyname = policy_name AND p.permissive = expected_permissive
        AND CASE
          WHEN table_name = 'employee_profile_change_requests'
            THEN p.qual LIKE '%hris_profile_change_active_member%'
          WHEN table_name = 'notices'
            THEN p.qual LIKE '%hris_own_employee_for_tenant%'
              AND NOT EXISTS (
                SELECT 1 FROM pg_policies legacy
                WHERE legacy.schemaname = 'public'
                  AND legacy.tablename = 'notices'
                  AND legacy.policyname = 'hris_notices_legacy_security_guard'
              )
          ELSE FALSE
        END
    ), 'tenant-scoped predicate; legacy notices guard absent where applicable'
  FROM required_policies
)
SELECT kind, object, source AS source_version, passed, requirement
FROM checks ORDER BY passed, kind, object;
