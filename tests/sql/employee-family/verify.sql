SELECT public.check_employee_family(
  has_table_privilege('authenticated', 'public.employee_family_members', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.employee_family_members', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.employee_family_members', 'DELETE')
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employee_family_members'::regclass)
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_family_members'
      AND policyname = 'employee_family_members_self_read'
      AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
      AND qual LIKE '%is_live_session%' AND qual LIKE '%employee_for_auth_user%'
  ),
  'Family rows are readable by authenticated sessions only, direct writes stay disabled, and self-read is tied to a live employee session'
);
SELECT public.check_employee_family(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_family_members'
      AND policyname = 'employee_family_admin_read' AND cmd = 'SELECT'
  )
  AND EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND tablename = 'employee_family_members'
      AND indexname = 'employee_family_members_employee_id_idx'
  ),
  'The existing administrator read policy remains and the employee lookup key is indexed'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'no', false);
SELECT set_config('request.test.can_view_employees', 'no', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 0 FROM public.employee_family_members),
  'An inactive session cannot read employee family rows'
);

SELECT set_config('request.test.session_active', 'yes', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 1 AND bool_and(id = 'a1111111-1111-4111-8111-111111111111'
                                    AND name = 'Synthetic Dependent One'
                                    AND relationship = 'Child'
                                    AND date_of_birth = '2015-06-17'::date)
   FROM public.employee_family_members),
  'An active employee can read only their own family rows'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'no', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 1 AND bool_and(id = 'a2222222-2222-4222-8222-222222222222')
   FROM public.employee_family_members),
  'A second tenant cannot discover the first employee family rows'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'yes', false);
SELECT public.check_employee_family(
  (SELECT count(*) = 2 FROM public.employee_family_members),
  'The existing authorized administrator policy still exposes rows to employee viewers'
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
