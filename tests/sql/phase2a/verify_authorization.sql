-- Real RLS and RPC enforcement against synthetic identities in Postgres 17.
CREATE FUNCTION public.check_phase2a(pass boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT coalesce(pass,false) THEN
  RAISE EXCEPTION 'PHASE2A FAIL: %',label;
 END IF;
 RAISE NOTICE 'PHASE2A PASS: %',label;
END $$;
SELECT public.check_phase2a(
 NOT has_function_privilege('anon','public.platform_hris_list_tenants()','EXECUTE'),
 'Anonymous tenant listing denied');
SELECT public.check_phase2a(
 NOT has_function_privilege('anon','public.hris_can_bootstrap_tenant_membership()','EXECUTE'),
 'Anonymous bootstrap helper denied');
SELECT public.check_phase2a(
 EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
 AND tablename='tenant_memberships'
 AND policyname='hris_first_admin_platform_guard'
 AND permissive='RESTRICTIVE' AND cmd='INSERT'),
 'Additional bootstrap guard is restrictive');

-- Existing domain-only identity is not a platform superadmin.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.jwt.claim.email','staff@synesisit.info',false);
SELECT set_config('request.test.session_active','yes',false);
DO $$
BEGIN
 BEGIN
  INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
   VALUES ((SELECT id FROM public.tenants WHERE slug='synesis-it'),
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc','hr_admin','active');
  RAISE EXCEPTION 'Domain user was incorrectly allowed to self-assign admin';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
DO $$
BEGIN
 BEGIN
  PERFORM public.platform_hris_list_tenants();
  RAISE EXCEPTION 'Unprivileged user listed all tenants';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenant_memberships)=0,
 'Unprivileged domain email cannot create first admin');

-- Privileged identity can use existing empty-tenant bootstrap.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.email','platform@synesisit.info',false);
SELECT set_config('request.test.session_active','yes',false);
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
 VALUES ((SELECT id FROM public.tenants WHERE slug='synesis-it'),
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hr_admin','active');
RESET ROLE;
SELECT public.check_phase2a(
 (SELECT count(*) FROM public.tenant_memberships
 WHERE role='hr_admin' AND status='active')=1,
 'Valid first-admin flow continues for platform superadmin');
