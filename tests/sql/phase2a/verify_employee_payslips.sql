SELECT public.check_phase2a(
  NOT has_function_privilege('anon','public.employee_get_my_payslips()','EXECUTE'),
  'Anonymous users cannot execute payslip RPC'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.test.session_active','yes',false);
SELECT public.check_phase2a(
  jsonb_array_length(public.employee_get_my_payslips())=1
  AND public.employee_get_my_payslips()->0->>'id'='aaaaaaaa-0000-4000-8000-000000000001'
  AND public.employee_get_my_payslips()->0->>'status'='released',
  'A live employee sees only their own released payslips'
);

-- The authenticated role alone is insufficient after a session is revoked.
SELECT set_config('request.test.session_active','no',false);
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_get_my_payslips();
    RAISE EXCEPTION 'A revoked session accessed payslips';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT public.check_phase2a(true,'A revoked session is denied the payslip RPC');

-- A live but unlinked employee identity cannot obtain another employee's record.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('request.test.session_active','yes',false);
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_get_my_payslips();
    RAISE EXCEPTION 'An unlinked identity accessed payslips';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT public.check_phase2a(true,'A live unlinked identity is denied the payslip RPC');

-- A different linked employee sees only their own released row.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT set_config('request.test.session_active','yes',false);
SELECT public.check_phase2a(
  jsonb_array_length(public.employee_get_my_payslips())=1
  AND public.employee_get_my_payslips()->0->>'id'='bbbbbbbb-0000-4000-8000-000000000001',
  'A second live employee sees only their own released payslip'
);
RESET ROLE;
