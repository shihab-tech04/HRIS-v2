-- Assertions following the hosted-shape transaction rehearsal.
DO $assert$
BEGIN
 IF (SELECT count(*) FROM public.roles WHERE id='hr_admin'
       AND active AND NOT is_system) <> 1
   OR (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin'
       AND permission_id='organization.manage') <> 1
   OR (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin') <> 1
   OR (SELECT count(*) FROM public.role_permissions WHERE role_id='hris_system_admin') <> 2
   OR (SELECT count(*) FROM public.tenant_memberships) <> 1
   OR (SELECT count(*) FROM public.tenant_memberships
       WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
         AND role='hr_admin' AND status='active') <> 1
   OR (SELECT count(*) FROM public.admin_users WHERE active AND NOT is_super_admin) <> 1
   OR (SELECT count(*) FROM public.admin_audit_logs
       WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED' AND actor_id IS NULL) <> 1
 THEN
   RAISE EXCEPTION 'Phase03 hosted-shape postflight mismatch';
 END IF;
END;
$assert$;

-- The hardened helper must exclude non-Super Admin, deleted, banned and
-- unconfirmed identities even if a JWT exists.
SELECT pg_catalog.set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $assert$ BEGIN
 IF public.hris_can_bootstrap_tenant_membership() THEN
  RAISE EXCEPTION 'Other legacy admin incorrectly authorized';
 END IF;
END; $assert$;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $assert$ BEGIN
 IF NOT public.hris_can_bootstrap_tenant_membership() THEN
  RAISE EXCEPTION 'Eligible platform Super Admin incorrectly rejected';
 END IF;
END; $assert$;
UPDATE auth.users SET banned_until=now()+interval '1 day'
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $assert$ BEGIN
 IF public.hris_can_bootstrap_tenant_membership() THEN
  RAISE EXCEPTION 'Banned Super Admin incorrectly authorized';
 END IF;
END; $assert$;
UPDATE auth.users SET banned_until=NULL,deleted_at=now()
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $assert$ BEGIN
 IF public.hris_can_bootstrap_tenant_membership() THEN
  RAISE EXCEPTION 'Deleted Super Admin incorrectly authorized';
 END IF;
END; $assert$;
