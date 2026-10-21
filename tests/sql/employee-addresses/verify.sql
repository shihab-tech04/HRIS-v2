SELECT public.check_employee_addresses(
  has_table_privilege('authenticated', 'public.employee_addresses', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.employee_addresses', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.employee_addresses', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.employee_addresses', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.employee_addresses', 'DELETE')
  AND has_function_privilege('authenticated', 'public.hris_own_employee_for_tenant(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.hris_admin_can_read_tenant(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.hris_own_employee_for_tenant(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.hris_admin_can_read_tenant(uuid,text)', 'EXECUTE')
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employee_addresses'::regclass)
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_addresses'
      AND policyname = 'employee_addresses_tenant_guard'
      AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
      AND permissive = 'RESTRICTIVE' AND qual LIKE '%hris_own_employee_for_tenant%'
      AND qual LIKE '%hris_admin_can_read_tenant%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_addresses'
      AND policyname = 'employee_addresses_self_read'
      AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
      AND qual LIKE '%is_live_session%' AND qual LIKE '%employee_for_auth_user%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_addresses'
      AND policyname = 'employee_addresses_tenant_admin_read'
      AND permissive = 'PERMISSIVE' AND qual LIKE '%hris_admin_can_read_tenant%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_addresses'
      AND policyname = 'employee_addresses_admin_read'
  ),
  'Authenticated reads are RLS protected, tenant-scoped, owner-scoped, and read-only'
);

SELECT public.check_employee_addresses(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'employee_addresses'
      AND indexname = 'employee_addresses_employee_id_idx'
  ),
  'The employee address lookup key is indexed'
);

-- An inactive employee session cannot read private address rows.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'no', false);
SELECT set_config('request.test.can_view_employees', 'yes', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 0 FROM public.employee_addresses),
  'An inactive session cannot read addresses even with a global employee permission'
);
RESET ROLE;

-- Employees may read their own addresses after live-session validation.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'no', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 1 AND bool_and(id = 'a1111111-1111-4111-8111-111111111111')
   FROM public.employee_addresses),
  'An active employee sees only their own tenant address rows'
);
RESET ROLE;

-- Tenant one manager and view-only role both see tenant one only.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'yes', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 1 AND bool_and(id = 'a1111111-1111-4111-8111-111111111111')
   FROM public.employee_addresses),
  'Tenant one employee manager sees tenant one addresses only'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'no', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 1 AND bool_and(id = 'a1111111-1111-4111-8111-111111111111')
   FROM public.employee_addresses),
  'A tenant one view-only role reads tenant one addresses and no other tenant'
);
RESET ROLE;

-- Tenant two manager must not inherit tenant one's permission through the
-- legacy global helper; the tenant membership policy still grants tenant two.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'no', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 1 AND bool_and(id = 'a2222222-2222-4222-8222-222222222222')
   FROM public.employee_addresses),
  'Tenant two employee manager sees tenant two addresses only'
);
RESET ROLE;

-- A global-only legacy permission, an inactive membership, and an inactive
-- role must each fail closed.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'yes', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 0 FROM public.employee_addresses),
  'A global employee permission without tenant membership reads no addresses'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.can_view_employees', 'yes', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 0 FROM public.employee_addresses),
  'An inactive tenant membership reads no addresses'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
SELECT set_config('request.test.session_active', 'no', false);
SELECT set_config('request.test.can_view_employees', 'yes', false);
SELECT public.check_employee_addresses(
  (SELECT count(*) = 0 FROM public.employee_addresses),
  'A stale admin session cannot read addresses'
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

-- DML is not enabled as part of the Figma view release.
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.employee_addresses(employee_id, address_type)
      VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Other');
    RAISE EXCEPTION 'Authenticated client inserted an employee address';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.employee_addresses SET district = 'changed';
    RAISE EXCEPTION 'Authenticated client updated an employee address';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.employee_addresses;
    RAISE EXCEPTION 'Authenticated client deleted employee addresses';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;
