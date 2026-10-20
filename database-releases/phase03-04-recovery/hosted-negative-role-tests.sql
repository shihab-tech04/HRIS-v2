BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
DO $tests$
DECLARE ok integer:=0;
BEGIN
 BEGIN PERFORM public.platform_hris_list_tenants(); RAISE EXCEPTION 'Unexpected platform access'; EXCEPTION WHEN insufficient_privilege THEN ok:=ok+1; END;
 BEGIN PERFORM public.platform_hris_list_tenant_modules(NULL::uuid); RAISE EXCEPTION 'Unexpected module access'; EXCEPTION WHEN insufficient_privilege THEN ok:=ok+1; END;
 BEGIN PERFORM public.platform_hris_set_tenant_module(NULL::uuid,'travel',false); RAISE EXCEPTION 'Unexpected module mutation'; EXCEPTION WHEN insufficient_privilege THEN ok:=ok+1; END;
 BEGIN PERFORM 1 FROM public.tenant_module_settings; RAISE EXCEPTION 'Unexpected direct module table access'; EXCEPTION WHEN insufficient_privilege THEN ok:=ok+1; END;
 PERFORM set_config('hris.recovery.auth_negative_count',ok::text,true);
END $tests$;
SET LOCAL ROLE anon;
DO $tests$
DECLARE ok integer:=0;
BEGIN
 BEGIN PERFORM public.platform_hris_list_tenants(); RAISE EXCEPTION 'Unexpected anonymous platform access'; EXCEPTION WHEN insufficient_privilege THEN ok:=ok+1; END;
 BEGIN PERFORM public.hris_can_read_learning_catalog(NULL::uuid); RAISE EXCEPTION 'Unexpected anonymous learning access'; EXCEPTION WHEN insufficient_privilege THEN ok:=ok+1; END;
 BEGIN PERFORM 1 FROM public.tenant_module_settings; RAISE EXCEPTION 'Unexpected anonymous table access'; EXCEPTION WHEN insufficient_privilege THEN ok:=ok+1; END;
 PERFORM set_config('hris.recovery.anon_negative_count',ok::text,true);
END $tests$;
RESET ROLE;
SELECT current_setting('hris.recovery.auth_negative_count')::integer AS authenticated_without_session_denials,current_setting('hris.recovery.anon_negative_count')::integer AS anonymous_denials;
ROLLBACK;