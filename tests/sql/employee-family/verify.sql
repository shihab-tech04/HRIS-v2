SELECT public.check_employee_family(
  has_table_privilege('authenticated', 'public.employee_family_members', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.employee_family_members', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'TRIGGER')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'REFERENCES')
  AND NOT has_function_privilege('anon', 'public.hris_employee_family_own_row(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.hris_employee_family_admin_can_read(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.hris_employee_family_own_row(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.hris_employee_family_admin_can_read(uuid)', 'EXECUTE')
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employee_family_members'::regclass)
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_family_members'
      AND policyname = 'employee_family_members_self_read'
      AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
      AND qual LIKE '%hris_employee_family_own_row%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_family_members'
      AND policyname = 'employee_family_admin_read'
      AND qual LIKE '%hris_employee_family_admin_can_read%'
      AND qual NOT LIKE '%has_permission%'
  ),
  'Family reads are RLS protected, admin reads require tenant membership permissions, and direct writes/extra privileges are disabled'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'no', false);
SELECT set_config('request.test.global_permission', 'yes', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 0 FROM public.employee_family_members),
  'An inactive session cannot read family rows even with a global permission'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.global_permission', 'yes', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 1 AND bool_and(id = 'a1111111-1111-4111-8111-111111111111')
   FROM public.employee_family_members),
  'An employee sees only their own linked family rows'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.global_permission', 'yes', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 1 AND bool_and(id = 'a1111111-1111-4111-8111-111111111111')
   FROM public.employee_family_members),
  'Tenant one HR sees tenant one family rows only'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.global_permission', 'no', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 1 AND bool_and(id = 'a1111111-1111-4111-8111-111111111111')
   FROM public.employee_family_members),
  'A tenant employee viewer sees only family rows in their authorized tenant'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.global_permission', 'yes', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 1 AND bool_and(id = 'a2222222-2222-4222-8222-222222222222')
   FROM public.employee_family_members),
  'Tenant two HR sees tenant two family rows only'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.global_permission', 'yes', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 0 FROM public.employee_family_members),
  'An inactive tenant membership cannot read family rows'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.global_permission', 'yes', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 0 FROM public.employee_family_members),
  'A global permission without tenant membership cannot read family rows'
);
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.employee_family_members;
    RAISE EXCEPTION 'Anonymous session read employee family members';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;
