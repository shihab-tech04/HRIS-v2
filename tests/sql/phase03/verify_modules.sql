-- Test the actual platform RPC and tenant-row guards, not UI-only flags.
-- The fixture and assertion files run in separate psql connections, so establish
-- the synthetic JWT/session context in this connection before assuming the role.
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_catalog.set_config('request.test.session_active','yes',false);
SET ROLE authenticated;
DO $assert$
DECLARE v_first uuid;v_second uuid;v_enabled boolean;v_affected bigint;
BEGIN
 SELECT id INTO v_first FROM public.tenants WHERE slug='synesis-it';
 SELECT id INTO v_second FROM public.tenants WHERE slug='second-tenant';
 PERFORM public.platform_hris_set_tenant_module(v_first,'travel',false);
 SELECT m.enabled INTO v_enabled FROM public.platform_hris_list_tenant_modules(v_first) m
  WHERE m.module_key='travel';
 IF v_enabled THEN RAISE EXCEPTION 'Travel was not disabled'; END IF;
 IF NOT (SELECT m.enabled FROM public.platform_hris_list_tenant_modules(v_second) m
         WHERE m.module_key='travel') THEN
  RAISE EXCEPTION 'Cross-tenant module state leaked';
 END IF;
 IF (SELECT count(*) FROM public.platform_hris_list_tenant_modules(v_first)) <> 3 THEN
  RAISE EXCEPTION 'Module list incomplete';
 END IF;
 -- Historical records remain visible through the ORIGINAL tenant read policy.
 IF (SELECT count(*) FROM public.travel_requests WHERE tenant_id=v_first AND note='historical travel') <> 1 THEN
  RAISE EXCEPTION 'Historical authorized travel read disappeared';
 END IF;
 BEGIN
  INSERT INTO public.travel_requests(tenant_id,note) VALUES(v_first,'must block');
  RAISE EXCEPTION 'Disabled travel accepted a new row';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE public.travel_requests SET note='must block' WHERE tenant_id=v_first;
  RAISE EXCEPTION 'Disabled travel accepted historical edits';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  DELETE FROM public.travel_requests WHERE tenant_id=v_first;
  RAISE EXCEPTION 'Disabled travel accepted historical deletion';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- Both modules jointly control the shared expense/travel link table.
 BEGIN
  INSERT INTO public.expense_travel_links(tenant_id,note) VALUES(v_first,'must block');
  RAISE EXCEPTION 'Travel link bypassed a disabled module';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 INSERT INTO public.travel_requests(tenant_id,note) VALUES(v_second,'tenant B still live');
 BEGIN
  UPDATE public.travel_requests SET tenant_id=v_first WHERE tenant_id=v_second;
  RAISE EXCEPTION 'Cross-tenant update bypassed target module state';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 INSERT INTO public.expense_claims(tenant_id,note) VALUES(v_first,'expenses still live');
 INSERT INTO public.learning_enrollments(tenant_id,note) VALUES(v_first,'learning still live');
 PERFORM public.platform_hris_set_tenant_module(v_first,'expenses',false);
 BEGIN
  INSERT INTO public.expense_claims(tenant_id,note) VALUES(v_first,'must block');
  RAISE EXCEPTION 'Disabled expense accepted a new claim';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF (SELECT count(*) FROM public.expense_claims WHERE tenant_id=v_first) <> 2 THEN
  RAISE EXCEPTION 'Historical claims were destroyed';
 END IF;
 IF (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='expense-receipts'
   AND EXISTS(SELECT 1 FROM public.expense_claims c WHERE c.tenant_id=v_first
     AND o.name LIKE '%' || c.id::text || '%')) <> 1 THEN
  RAISE EXCEPTION 'Historical receipt read disappeared';
 END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   SELECT 'expense-receipts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || c.id::text || '/new.pdf'
   FROM public.expense_claims c WHERE c.tenant_id=v_first LIMIT 1;
  RAISE EXCEPTION 'Disabled expense receipt upload was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 DELETE FROM storage.objects o WHERE o.bucket_id='expense-receipts'
   AND EXISTS(SELECT 1 FROM public.expense_claims c WHERE c.tenant_id=v_first
     AND o.name LIKE '%' || c.id::text || '%');
 GET DIAGNOSTICS v_affected=ROW_COUNT;
 IF v_affected<>0 THEN RAISE EXCEPTION 'Disabled expense receipt deletion was allowed'; END IF;
 PERFORM public.platform_hris_set_tenant_module(v_first,'learning',false);
 BEGIN
  INSERT INTO public.learning_enrollments(tenant_id,note) VALUES(v_first,'must block');
  RAISE EXCEPTION 'Disabled learning accepted new enrollment';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='learning-completion-evidence'
   AND o.name LIKE '%/' || v_first::text || '/%') <> 1 THEN
  RAISE EXCEPTION 'Historical learning evidence read disappeared';
 END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   VALUES('learning-completion-evidence',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || v_first::text || '/unused/new.pdf');
  RAISE EXCEPTION 'Disabled learning evidence upload was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 UPDATE storage.objects SET name=name || '-edited' WHERE bucket_id='learning-completion-evidence'
   AND name LIKE '%/' || v_first::text || '/%';
 GET DIAGNOSTICS v_affected=ROW_COUNT;
 IF v_affected<>0 THEN RAISE EXCEPTION 'Disabled learning evidence edit was allowed'; END IF;
 -- An unrelated bucket retains its existing permissive test policy.
 INSERT INTO storage.objects(bucket_id,name) VALUES('unrelated-bucket','other/file.pdf');
 IF (SELECT count(*) FROM public.admin_audit_logs WHERE action='PLATFORM_TENANT_MODULE_CHANGED') <> 3 THEN
  RAISE EXCEPTION 'Module changes missing audit records';
 END IF;
 PERFORM public.platform_hris_set_tenant_module(v_first,'travel',false);
 IF (SELECT count(*) FROM public.admin_audit_logs WHERE action='PLATFORM_TENANT_MODULE_CHANGED') <> 3 THEN
  RAISE EXCEPTION 'No-op transition wrote duplicate audit';
 END IF;
 BEGIN
  PERFORM public.platform_hris_set_tenant_module(v_first,'unknown',false);
  RAISE EXCEPTION 'Unrecognized module was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END;
$assert$;

-- A non-platform administrator must be refused even though a confirmed
-- account exists, and cannot alter the module table via the API.
SELECT pg_catalog.set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
DO $assert$
DECLARE v_first uuid;
BEGIN
 SELECT id INTO v_first FROM public.tenants WHERE slug='synesis-it';
 BEGIN
  PERFORM public.platform_hris_set_tenant_module(v_first,'travel',true);
  RAISE EXCEPTION 'Non-platform admin toggled a tenant module';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.platform_hris_list_tenant_modules(v_first);
  RAISE EXCEPTION 'Non-platform admin listed tenant settings';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  INSERT INTO public.tenant_module_settings(tenant_id,module_key,enabled)
   VALUES(v_first,'travel',true);
  RAISE EXCEPTION 'Direct module write was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF (SELECT count(*) FROM public.travel_requests) <> 0 THEN
  RAISE EXCEPTION 'Non-member accessed tenant history';
 END IF;
END;
$assert$;
RESET ROLE;
