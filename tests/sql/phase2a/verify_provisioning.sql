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

-- An allow-listed membership string is not enough. Without a registered,
-- enabled tenant-admin role and an organization-management grant, tenant
-- creation must fail atomically before it writes the tenant or membership.
RESET ROLE;
BEGIN;
UPDATE public.roles SET active=false WHERE id='hr_admin';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.test.session_active','yes',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_provision_tenant('NO_ROLE','no-role','Missing Admin Role',
   'Asia/Dhaka','en','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'Tenant created with an inactive administrator role';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenants WHERE slug='no-role')=0
 AND (SELECT active FROM public.roles WHERE id='hr_admin') IS TRUE,
 'Missing tenant-admin role blocks provisioning with no retained records');

-- The confirmed-email bit is not enough: a banned/deleted Auth identity must
-- not receive new tenant authority. Both negative journeys are atomic.
BEGIN;
UPDATE auth.users SET banned_until=now()+interval '1 day'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.test.session_active','yes',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_provision_tenant('BANNED','banned-admin','Banned Admin',
   'Asia/Dhaka','en','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'Banned user appointed first tenant administrator';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE auth.users SET deleted_at=now()
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.test.session_active','yes',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_provision_tenant('DELETED','deleted-admin','Deleted Admin',
   'Asia/Dhaka','en','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  RAISE EXCEPTION 'Deleted user appointed first tenant administrator';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenants WHERE slug IN ('banned-admin','deleted-admin'))=0
 AND (SELECT count(*) FROM public.tenant_memberships)=1,
 'Banned and deleted first-admin accounts are rejected without partial tenant writes');

SELECT set_config('request.test.session_active','yes',false);
SET ROLE authenticated;
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
