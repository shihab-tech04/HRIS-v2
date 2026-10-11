-- Provisioning contract executed against the isolated synthetic PostgreSQL fixture.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.jwt.claim.email','staff@synesisit.info',false);
SELECT set_config('request.test.session_active','yes',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_provision_tenant('UNAUTH','unauth','Unauthorized',
   'Asia/Dhaka','en','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'Unauthorized tenant creation succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.email','platform@synesisit.info',false);
SELECT set_config('request.test.session_active','no',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_provision_tenant('EXPIRED','expired','Expired Session',
   'Asia/Dhaka','en','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'Expired session provisioned a tenant';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

SELECT set_config('request.test.session_active','yes',false);
SELECT public.platform_hris_provision_tenant('QA_ONE','qa-one','Synthetic QA One',
 'Asia/Dhaka','en','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
RESET ROLE;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenants WHERE slug='qa-one'
 AND is_active=false AND default_locale='en')=1,
 'Provisioned tenant is inactive and persists in PostgreSQL');
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenant_memberships m
 JOIN public.tenants t ON t.id=m.tenant_id WHERE t.slug='qa-one'
 AND m.user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 AND m.role='hr_admin' AND m.status='active')=1,
 'Provisioned tenant has authorized initial administrator');
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.admin_audit_logs
 WHERE action='PLATFORM_TENANT_PROVISIONED')=1,
 'Provisioning produces server-side audit evidence');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.test.session_active','yes',false);
SELECT public.platform_hris_update_tenant_metadata(
 (SELECT id FROM public.tenants WHERE slug='qa-one'),
 'Synthetic QA Updated','Asia/Tokyo','bn');
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_provision_tenant('QA_ONE','duplicate-code','Duplicate',
   'Asia/Dhaka','en','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  RAISE EXCEPTION 'Duplicate tenant code was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.platform_hris_provision_tenant('BAD_TIME','invalid-time','Invalid TZ',
   'Mars/Martian','en','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  RAISE EXCEPTION 'Invalid timezone was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT public.check_phase2a(
 (SELECT name='Synthetic QA Updated' AND default_locale='bn' AND is_active=false
  FROM public.tenants WHERE slug='qa-one'),
 'Tenant metadata persists without activating tenancy');
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenants)=2,
 'Rejected provisioning attempts leave no tenants');
