-- Run after the synthetic Phase 2A authorization, provisioning, and role
-- journeys, with the staged Phase 2B email wrappers installed.
-- These checks do not create real Auth users or touch a hosted database.
SELECT public.check_phase2a(
 NOT has_function_privilege('anon',
  'public.platform_hris_provision_tenant_by_email(text,text,text,text,text,text)',
  'EXECUTE')
 AND NOT has_function_privilege('authenticated',
  'public._platform_hris_confirmed_user_id_by_email(text)','EXECUTE'),
 'Anonymous provisioning and direct email lookup remain denied');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.test.session_active','yes',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_provision_tenant_by_email(
   'EMAIL_UNAUTH','email-unauth','Unauthorized Email',
   'Asia/Dhaka','en','first-admin@hris.test');
  RAISE EXCEPTION 'Ordinary user provisioned a tenant by email';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT public.platform_hris_provision_tenant_by_email(
 'EMAIL_OK','email-ok','Email Registration','Asia/Dhaka','bn',
 ' FIRST-ADMIN@HRIS.TEST ');
RESET ROLE;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenants WHERE slug='email-ok'
  AND is_active=false AND default_locale='bn')=1
 AND (SELECT count(*) FROM public.tenant_memberships m
  JOIN public.tenants t ON t.id=m.tenant_id
  WHERE t.slug='email-ok'
   AND m.user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   AND m.role='hr_admin' AND m.status='active')=1,
 'Case-normalized confirmed email creates inactive tenant and expected admin');

BEGIN;
UPDATE auth.users SET banned_until=now()+interval '1 day'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_provision_tenant_by_email(
   'EMAIL_BANNED','email-banned','Banned Email','Asia/Dhaka','en',
   'first-admin@hris.test');
  RAISE EXCEPTION 'Banned email provisioned a tenant';
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
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_set_tenant_admin_by_email(
   (SELECT id FROM public.tenants WHERE slug='qa-one'),
   'recruiter@hris.test',true);
  RAISE EXCEPTION 'Deleted email appointed as tenant administrator';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;

SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenants WHERE slug IN ('email-unauth','email-banned'))=0
 AND (SELECT count(*) FROM public.tenant_memberships
  WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
   AND role='hr_recruiter' AND status='active')=1,
 'Denied email operations neither create tenants nor change recruiter membership');
