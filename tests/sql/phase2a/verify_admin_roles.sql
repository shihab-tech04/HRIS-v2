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

BEGIN;
UPDATE auth.users SET banned_until=now()+interval '1 day'
 WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_set_tenant_admin(
   (SELECT id FROM public.tenants WHERE slug='qa-one'),
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
  RAISE EXCEPTION 'Banned account reactivated as tenant administrator';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE auth.users SET deleted_at=now()
 WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_set_tenant_admin(
   (SELECT id FROM public.tenants WHERE slug='qa-one'),
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
  RAISE EXCEPTION 'Deleted account reactivated as tenant administrator';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT public.check_phase2a(
 (SELECT status FROM public.tenant_memberships
  WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
   AND tenant_id=(SELECT id FROM public.tenants WHERE slug='qa-one'))='inactive',
 'Banned and deleted accounts cannot regain administrator membership');

-- A previously valid role can lose its grants; do not reactivate an admin
-- membership under an unprivileged registry entry.
BEGIN;
DELETE FROM public.role_permissions
 WHERE role_id='hr_admin' AND permission_id='organization.manage';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.test.session_active','yes',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_set_tenant_admin(
   (SELECT id FROM public.tenants WHERE slug='qa-one'),
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
  RAISE EXCEPTION 'Admin appointed without a scoped role permission';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenant_memberships m JOIN public.tenants t
  ON t.id=m.tenant_id WHERE t.slug='qa-one'
    AND m.user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    AND m.status='active')=0
 AND (SELECT count(*) FROM public.role_permissions
  WHERE role_id='hr_admin' AND permission_id='organization.manage')=1,
 'Removed role permission blocks administrator appointment atomically');

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
