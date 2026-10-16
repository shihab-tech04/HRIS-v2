SELECT public.check_profile_change(
  NOT has_function_privilege('anon', 'public.employee_submit_profile_change_request(text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.employee_get_my_profile_change_requests()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_list_profile_change_requests()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_review_profile_change_request(uuid,text,text)', 'EXECUTE'),
  'Anonymous sessions cannot execute profile correction RPCs'
);
SELECT public.check_profile_change(
  has_column_privilege('authenticated', 'public.employee_profile_change_requests', 'reason', 'SELECT')
  AND NOT has_column_privilege('authenticated', 'public.employee_profile_change_requests', 'requested_value', 'SELECT'),
  'Employees may not read proposed values directly from the request table'
);

-- Employee submits a protected field correction and sees only its safe history.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.self_service_manage', 'no', false);
SELECT public.employee_submit_profile_change_request('full_name', 'Synthetic Corrected Name', 'Correct spelling shown on identity document.') AS approved_request_id \gset
SELECT public.check_profile_change(
  (SELECT count(*) = 1 FROM public.employee_get_my_profile_change_requests())
  AND (SELECT status = 'pending' FROM public.employee_get_my_profile_change_requests() LIMIT 1),
  'Employee sees the status of their own submitted request'
);
SELECT public.check_profile_change(
  (SELECT count(*) = 1 FROM public.employee_profile_change_requests),
  'Employee RLS scope returns only their own request'
);
DO $$
BEGIN
  BEGIN
    PERFORM requested_value FROM public.employee_profile_change_requests;
    RAISE EXCEPTION 'Employee read a protected proposed value';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.admin_list_profile_change_requests();
    RAISE EXCEPTION 'Employee listed HR review requests';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_submit_profile_change_request('full_name', 'Another Name', 'Duplicate pending request.');
    RAISE EXCEPTION 'Duplicate pending request was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_submit_profile_change_request(NULL, 'x', 'Null field is invalid.');
    RAISE EXCEPTION 'Null field was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_submit_profile_change_request('official_email', 'invalid-email', 'Invalid email must be rejected.');
    RAISE EXCEPTION 'Invalid email was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
RESET ROLE;

-- A separate employee cannot discover the first employee's request.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.self_service_manage', 'no', false);
SELECT public.check_profile_change(
  (SELECT count(*) = 0 FROM public.employee_get_my_profile_change_requests())
  AND (SELECT count(*) = 0 FROM public.employee_profile_change_requests),
  'Another tenant cannot view an employee request'
);
RESET ROLE;

-- Authorized HR review approves the correction, applies only the allowed field,
-- and records an audit event containing no proposed value or financial detail.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT set_config('request.test.self_service_manage', 'yes', false);
SELECT public.check_profile_change(
  (SELECT count(*) = 1 FROM public.admin_list_profile_change_requests())
  AND (SELECT requested_value = 'Synthetic Corrected Name' FROM public.admin_list_profile_change_requests() LIMIT 1),
  'Authorized HR reviewer sees pending values'
);
SELECT public.admin_review_profile_change_request(:'approved_request_id'::uuid, 'approved', 'Verified against identity document.');
SELECT public.check_profile_change(
  (SELECT full_name = 'Synthetic Corrected Name' AND bank_account_no = 'synthetic-bank-value'
   FROM public.employees WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'Approval updates only the requested employee field and preserves financial data'
);
SELECT public.check_profile_change(
  (SELECT status = 'approved' AND review_note = 'Verified against identity document.'
   FROM public.employee_profile_change_requests WHERE id = :'approved_request_id'::uuid),
  'Approval decision and reviewer note persist'
);
-- Inspect the audit table as the migration owner, not as the authenticated reviewer.
RESET ROLE;
SELECT public.check_profile_change(
  (SELECT count(*) = 1 AND bool_and(details ? 'field_key' AND NOT (details ? 'requested_value'))
   FROM public.admin_audit_logs WHERE target_id = :'approved_request_id'),
  'Audit record records the decision without copying the sensitive proposed value'
);

-- Authorized HR rejection leaves the employee record unchanged.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.self_service_manage', 'no', false);
SELECT public.employee_submit_profile_change_request('official_phone', '+880299999999', 'Phone number was typed incorrectly.');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
SELECT set_config('request.test.self_service_manage', 'yes', false);
SELECT id AS rejected_request_id FROM public.employee_profile_change_requests WHERE field_key = 'official_phone' AND status = 'pending' \gset
SELECT public.admin_review_profile_change_request(:'rejected_request_id'::uuid, 'rejected', 'Please attach a current supporting document.');
SELECT public.check_profile_change(
  (SELECT official_phone = '+880200000001' FROM public.employees WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  AND (SELECT status = 'rejected' AND review_note = 'Please attach a current supporting document.'
       FROM public.employee_profile_change_requests WHERE field_key = 'official_phone'),
  'Rejection stores its note without changing the employee profile'
);
RESET ROLE;
