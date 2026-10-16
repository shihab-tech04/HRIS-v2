SELECT public.check_employee_addresses(
  has_table_privilege('authenticated', 'public.employee_addresses', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.employee_addresses', 'SELECT')
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employee_addresses'::regclass)
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_addresses'
      AND policyname = 'employee_addresses_self_read'
      AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
      AND qual LIKE '%is_live_session%' AND qual LIKE '%employee_for_auth_user%'
  ),
  'Employee address SELECT is granted to authenticated only and RLS scopes the new policy to a live employee session'
);
SELECT public.check_employee_addresses(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'employee_addresses' AND indexname = 'employee_addresses_employee_id_idx'),
  'The employee address lookup key is indexed'
);

-- An authenticated employee without an active live session is denied.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'no', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 0 FROM public.employee_addresses),
  'Address RLS returns no rows for an inactive live session'
);

-- The employee policy adds only the current employee's rows; the admin policy remains independent.
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'no', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 1
       AND bool_and(id = 'a1111111-1111-4111-8111-111111111111'
                    AND address_type = 'Present'
                    AND district = 'Dhaka'
                    AND road_block_house = 'Road 27')
       FROM public.employee_addresses),
  'An active employee sees only their own address rows through RLS'
);
RESET ROLE;

-- A second tenant cannot discover the first employee's address.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'no', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 1
       AND bool_and(id = 'a2222222-2222-4222-8222-222222222222'
                    AND address_type = 'Permanent'
                    AND district = 'Cumilla')
       FROM public.employee_addresses),
  'A different tenant can only read its own address through RLS'
);
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.employee_addresses;
    RAISE EXCEPTION 'Anonymous session read employee addresses';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;
