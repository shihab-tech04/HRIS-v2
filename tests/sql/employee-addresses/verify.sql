SELECT public.check_employee_addresses(
  has_function_privilege('authenticated', 'public.employee_get_my_addresses_v2()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.employee_get_my_addresses_v2()', 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS f
    CROSS JOIN LATERAL aclexplode(COALESCE(f.proacl, acldefault('f', f.proowner))) AS acl
    WHERE f.oid = 'public.employee_get_my_addresses_v2()'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ),
  'Only authenticated sessions may execute the narrow employee address getter'
);
SELECT public.check_employee_addresses(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, auth']
   FROM pg_proc WHERE oid = 'public.employee_get_my_addresses_v2()'::regprocedure)
  AND pg_get_function_result('public.employee_get_my_addresses_v2()'::regprocedure) =
    'TABLE(id uuid, address_type text, district text, thana text, post_code text, city_village text, road_block_house text)',
  'The getter is security-definer with a fixed search path and exposes only address fields'
);

-- An authenticated employee without an active live session is denied.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'no', false);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.employee_get_my_addresses_v2();
    RAISE EXCEPTION 'Address getter accepted an inactive session';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END
$$;

-- Even with a valid session, direct table SELECT remains hidden by the admin-only RLS policy.
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'no', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 0 FROM public.employee_addresses)
  AND (SELECT count(*) = 1
       AND bool_and(id = 'a1111111-1111-4111-8111-111111111111'
                    AND address_type = 'Present'
                    AND district = 'Dhaka'
                    AND road_block_house = 'Road 27')
       FROM public.employee_get_my_addresses_v2()),
  'An active employee sees only their own address through the narrow getter, not the table'
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
       FROM public.employee_get_my_addresses_v2())
  AND (SELECT count(*) = 0 FROM public.employee_addresses),
  'A different tenant can only read its own address through the getter'
);
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.employee_get_my_addresses_v2();
    RAISE EXCEPTION 'Anonymous session executed the address getter';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;
