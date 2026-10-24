SELECT public.check_profile_change(
  NOT has_function_privilege('anon', 'public.employee_submit_profile_change_request(uuid,text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.employee_get_my_profile_change_requests(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_list_profile_change_requests(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_review_profile_change_request(uuid,uuid,text,text)', 'EXECUTE'),
  'Anonymous sessions cannot execute profile correction RPCs'
);
SELECT public.check_profile_change(
  has_column_privilege('authenticated', 'public.employee_profile_change_requests', 'reason', 'SELECT')
  AND NOT has_column_privilege('authenticated', 'public.employee_profile_change_requests', 'requested_value', 'SELECT'),
  'Employees cannot read proposed values directly'
);

-- Employee A submits only into tenant A and sees their safe request history.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT public.employee_submit_profile_change_request(
  '11111111-1111-4111-8111-111111111111', 'full_name',
  'Synthetic Corrected Name', 'Correct spelling shown on identity document.'
) AS approved_request_id \gset
SELECT set_config('request.test.approved_id', :'approved_request_id', false);
SELECT public.check_profile_change(
  (SELECT count(*) = 1 FROM public.employee_get_my_profile_change_requests('11111111-1111-4111-8111-111111111111'))
  AND (SELECT status = 'pending' FROM public.employee_get_my_profile_change_requests('11111111-1111-4111-8111-111111111111') LIMIT 1)
  AND (SELECT count(*) = 1 FROM public.employee_profile_change_requests),
  'Employee sees only the status of their tenant-scoped request'
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
    PERFORM public.admin_list_profile_change_requests('11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'Employee listed HR review requests';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_submit_profile_change_request(
      '11111111-1111-4111-8111-111111111111', 'full_name', 'Another Name', 'Duplicate pending request.'
    );
    RAISE EXCEPTION 'Duplicate pending request was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_submit_profile_change_request(
      '11111111-1111-4111-8111-111111111111', NULL, 'x', 'Null field is invalid.'
    );
    RAISE EXCEPTION 'Null field was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_submit_profile_change_request(
      '11111111-1111-4111-8111-111111111111', 'official_email', 'invalid-email', 'Invalid email.'
    );
    RAISE EXCEPTION 'Invalid email was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_submit_profile_change_request(
      '22222222-2222-4222-8222-222222222222', 'full_name', 'Cross Tenant', 'Must be denied.'
    );
    RAISE EXCEPTION 'Cross-tenant submission was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- Inactive memberships lose even their own RPC history.
UPDATE public.tenant_memberships SET status = 'inactive'
WHERE tenant_id = '11111111-1111-4111-8111-111111111111'
  AND user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'yes', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.employee_get_my_profile_change_requests('11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'Inactive employee membership was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
UPDATE public.tenant_memberships SET status = 'active'
WHERE tenant_id = '11111111-1111-4111-8111-111111111111'
  AND user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Employee B is active in tenant B, yet cannot see or alter tenant A requests.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT public.check_profile_change(
  (SELECT count(*) = 0 FROM public.employee_get_my_profile_change_requests('22222222-2222-4222-8222-222222222222'))
  AND (SELECT count(*) = 0 FROM public.employee_profile_change_requests),
  'Tenant B employee cannot discover tenant A request'
);
RESET ROLE;

-- Reviewer B has permission only in tenant B; no global permission grants access to A.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT public.check_profile_change(
  (SELECT count(*) = 0 FROM public.admin_list_profile_change_requests('22222222-2222-4222-8222-222222222222')),
  'Tenant B manager can use the review API in their own tenant'
);
DO $$
BEGIN
  BEGIN
    PERFORM public.admin_list_profile_change_requests('11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'Tenant B manager read tenant A queue';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.admin_review_profile_change_request(
      '11111111-1111-4111-8111-111111111111', current_setting('request.test.approved_id')::uuid, 'approved', NULL
    );
    RAISE EXCEPTION 'Tenant B manager decided tenant A request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- Reviewer A approves; one field changes, a duplicate decision fails, and audit omits the proposed value.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT public.check_profile_change(
  (SELECT count(*) = 1 FROM public.admin_list_profile_change_requests('11111111-1111-4111-8111-111111111111'))
  AND (SELECT requested_value = 'Synthetic Corrected Name' FROM public.admin_list_profile_change_requests('11111111-1111-4111-8111-111111111111') LIMIT 1),
  'Tenant A reviewer sees only tenant A pending values'
);
SELECT public.admin_review_profile_change_request(
  '11111111-1111-4111-8111-111111111111', :'approved_request_id'::uuid,
  'approved', 'Verified against identity document.'
);
DO $$
BEGIN
  BEGIN
    PERFORM public.admin_review_profile_change_request(
      '11111111-1111-4111-8111-111111111111', current_setting('request.test.approved_id')::uuid, 'approved', NULL
    );
    RAISE EXCEPTION 'Duplicate review decision was accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END $$;
SELECT public.check_profile_change(
  (SELECT full_name = 'Synthetic Corrected Name' AND bank_account_no = 'synthetic-bank-value'
   FROM public.employees WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  AND (SELECT status = 'approved' AND review_note = 'Verified against identity document.'
   FROM public.employee_profile_change_requests WHERE id = :'approved_request_id'::uuid),
  'Approval persists the decision and changes only the allowed field'
);
RESET ROLE;
SELECT public.check_profile_change(
  (SELECT count(*) = 1 AND bool_and(details ? 'field_key' AND NOT (details ? 'requested_value'))
   FROM public.admin_audit_logs WHERE target_id = :'approved_request_id'),
  'Audit records the decision without copying sensitive proposed values'
);

-- Rejection records the reason while preserving the employee's current profile value.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT public.employee_submit_profile_change_request(
  '11111111-1111-4111-8111-111111111111', 'official_phone',
  '+880299999999', 'Phone number was typed incorrectly.'
);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
SELECT set_config('request.test.session_active', 'yes', false);
SELECT id AS rejected_request_id FROM public.employee_profile_change_requests
WHERE field_key = 'official_phone' AND status = 'pending' \gset
SELECT public.admin_review_profile_change_request(
  '11111111-1111-4111-8111-111111111111', :'rejected_request_id'::uuid,
  'rejected', 'Please attach current supporting documentation.'
);
SELECT public.check_profile_change(
  (SELECT official_phone = '+880200000001' FROM public.employees WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  AND (SELECT status = 'rejected' AND review_note = 'Please attach current supporting documentation.'
       FROM public.employee_profile_change_requests WHERE id = :'rejected_request_id'::uuid),
  'Rejection leaves the employee profile unchanged and preserves its reason'
);
RESET ROLE;
