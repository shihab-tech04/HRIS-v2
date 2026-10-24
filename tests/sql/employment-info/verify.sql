SELECT public.check_employment_info(
  has_function_privilege('authenticated', 'public.employee_get_my_employment_info_v1(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.employee_get_my_employment_info_v1(uuid)', 'EXECUTE')
  AND (SELECT prosecdef FROM pg_proc WHERE oid = 'public.employee_get_my_employment_info_v1(uuid)'::regprocedure)
  AND (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.employee_get_my_employment_info_v1(uuid)'::regprocedure)
  AND position('salary' in lower(pg_get_function_result('public.employee_get_my_employment_info_v1(uuid)'::regprocedure))) = 0
  AND position('bank' in lower(pg_get_function_result('public.employee_get_my_employment_info_v1(uuid)'::regprocedure))) = 0,
  'The employee RPC is SECURITY DEFINER with a locked search path, authenticated-only execution, and an allowlisted result without pay or bank fields'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT public.check_employment_info(
  (SELECT joining_date = '2022-05-01'::date
      AND employment_type = 'Permanent'
      AND department_name = 'Synthetic Analytics'
      AND department_code = 'ANL'
      AND designation_title = 'Senior Analyst'
      AND designation_code = 'SA-01'
      AND manager_name = 'Synthetic Manager'
      AND work_location_name = 'Synthetic Dhaka HQ'
      AND grade_name = 'Synthetic Grade 7'
      AND grade_code = 'G7'
      AND NOT to_jsonb(info) ? 'min_salary'
      AND NOT to_jsonb(info) ? 'bank_account_no'
   FROM public.employee_get_my_employment_info_v1('11111111-1111-4111-8111-111111111111') AS info),
  'An active employee sees the requested employment fields and no salary or bank values'
);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.employee_get_my_employment_info_v1('22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'Employee read another tenant employment record';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT public.check_employment_info(
  (SELECT department_name = 'Other Tenant Department'
      AND designation_title = 'Other Tenant Role'
      AND work_location_name = 'Other tenant office'
   FROM public.employee_get_my_employment_info_v1('22222222-2222-4222-8222-222222222222')),
  'A second tenant employee sees only their linked employment information'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'no', false);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.employee_get_my_employment_info_v1('11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'Inactive session read employment information';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.employee_get_my_employment_info_v1('11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'Anonymous session read employment information';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;
