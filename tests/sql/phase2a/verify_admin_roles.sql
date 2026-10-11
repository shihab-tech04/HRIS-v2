-- Valid active platform superadmin; test role conversion and last-admin rules.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.email','platform@synesisit.info',false);
SELECT set_config('request.test.session_active','yes',false);

-- Add a second tenant administrator; revoke it without losing first admin.
SELECT public.platform_hris_set_tenant_admin(
 (SELECT id FROM public.tenants WHERE slug='qa-one'),
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT public.platform_hris_set_tenant_admin(
 (SELECT id FROM public.tenants WHERE slug='qa-one'),
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);

DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_set_tenant_admin(
   (SELECT id FROM public.tenants WHERE slug='qa-one'),
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
  RAISE EXCEPTION 'Removing last active admin was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenant_memberships m JOIN public.tenants t
 ON t.id=m.tenant_id WHERE t.slug='qa-one' AND m.role='hr_admin'
 AND m.status='active')=1,
 'Last active administrator cannot be revoked');

-- Existing recruiter identity cannot be silently converted into admin.
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
 VALUES((SELECT id FROM public.tenants WHERE slug='qa-one'),
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','hr_recruiter','active');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_set_tenant_admin(
   (SELECT id FROM public.tenants WHERE slug='qa-one'),
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
  RAISE EXCEPTION 'Recruiter role overwritten';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenant_memberships
 WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
 AND role='hr_recruiter' AND status='active')=1,
 'Recruiter membership preserved following denied admin assignment');

SELECT public.check_phase2a(
 (SELECT count(*) FROM public.admin_audit_logs
 WHERE action='PLATFORM_TENANT_ADMIN_ASSIGNED')=1
 AND (SELECT count(*) FROM public.admin_audit_logs
 WHERE action='PLATFORM_TENANT_ADMIN_REVOKED')=1,
 'Administrator assignment and revocation are audited');
