-- Phase 03 SA12 — staged only; depends on all Phase 04/05 module tables.
-- Never apply until matching hosted RPC/table contracts and Auth/browser tests pass.
-- Defaults remain enabled for existing tenants; disabling blocks ALL new writes
-- (including edits/deletes) while existing SELECT policies remain unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_module_settings (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 module_key text NOT NULL CHECK (module_key IN ('travel','expenses','learning')),
 enabled boolean NOT NULL DEFAULT true,
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,module_key)
);
ALTER TABLE public.tenant_module_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_module_settings FROM PUBLIC,anon,authenticated;
-- No public/anonymous/authenticated table-level policies or write grants.
-- The platform RPC is the only application mutation surface.

CREATE OR REPLACE FUNCTION private.hris_optional_module_enabled(
 p_tenant_id uuid,p_module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
 SELECT p_tenant_id IS NOT NULL
   AND p_module_key IN ('travel','expenses','learning')
   AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id)
   AND coalesce((SELECT s.enabled FROM public.tenant_module_settings s
      WHERE s.tenant_id=p_tenant_id AND s.module_key=p_module_key),true);
$fn$;
REVOKE ALL ON FUNCTION private.hris_optional_module_enabled(uuid,text)
 FROM PUBLIC,anon,authenticated;

-- Row triggers enforce writes even inside SECURITY DEFINER workflow RPCs or
-- through direct table access. Cross-tenant UPDATEs check both tenant IDs.
CREATE OR REPLACE FUNCTION private.hris_optional_module_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
 v_module text := TG_ARGV[0];
 v_old_tenant uuid;
 v_new_tenant uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN v_old_tenant := OLD.tenant_id; END IF;
 IF TG_OP <> 'DELETE' THEN v_new_tenant := NEW.tenant_id; END IF;
 IF (v_old_tenant IS NOT NULL AND NOT private.hris_optional_module_enabled(v_old_tenant,v_module))
    OR (v_new_tenant IS NOT NULL AND NOT private.hris_optional_module_enabled(v_new_tenant,v_module)) THEN
  RAISE EXCEPTION 'Optional module % is disabled for this tenant',v_module
    USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.hris_optional_module_write_guard()
 FROM PUBLIC,anon,authenticated;

-- A fixed allowlist: both Travel and Expenses protect expense_travel_links.
-- This deliberately fails if any needed table has not yet been deployed.
DO $install$
DECLARE v_row record; v_trigger text;
BEGIN
 FOR v_row IN SELECT * FROM (VALUES
  ('travel_requests','travel'),
  ('travel_status_history','travel'),
  ('travel_request_notifications','travel'),
  ('expense_travel_links','travel'),
  ('expense_categories','expenses'),
  ('expense_claims','expenses'),
  ('expense_claim_receipts','expenses'),
  ('expense_claim_status_history','expenses'),
  ('expense_travel_links','expenses'),
  ('learning_programs','learning'),
  ('learning_sessions','learning'),
  ('learning_enrollments','learning'),
  ('learning_completion_events','learning'),
  ('learning_completion_notifications','learning')
 ) AS allowed(table_name,module_key) LOOP
  IF pg_catalog.to_regclass(pg_catalog.format('public.%I',v_row.table_name)) IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=v_row.table_name
                      AND c.column_name='tenant_id') THEN
   RAISE EXCEPTION 'Missing Phase 03 module guard prerequisite: %',v_row.table_name
     USING ERRCODE='55000';
  END IF;
  v_trigger := 'hris_optional_' || v_row.module_key || '_write_guard';
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tg
                 WHERE tg.tgrelid=pg_catalog.to_regclass(pg_catalog.format('public.%I',v_row.table_name))
                   AND tg.tgname=v_trigger) THEN
   EXECUTE pg_catalog.format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.hris_optional_module_write_guard(%L)',
    v_trigger,v_row.table_name,v_row.module_key);
  END IF;
 END LOOP;
END;
$install$;

-- Expense receipts and Learning completion evidence also enter through the
-- Storage API. Protect those writes without changing any historical reads.
-- Expense object path: <auth-user>/<claim-id>/<file>.
-- Learning evidence path: <auth-user>/<tenant-id>/<enrollment-id>/<file>.
CREATE OR REPLACE FUNCTION private.hris_storage_optional_module_enabled(
 p_bucket_id text,p_object_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
 IF p_bucket_id='expense-receipts' THEN
  RETURN EXISTS (SELECT 1 FROM public.expense_claims c
   WHERE c.id::text=(storage.foldername(p_object_name))[2]
     AND private.hris_optional_module_enabled(c.tenant_id,'expenses'));
 ELSIF p_bucket_id='learning-completion-evidence' THEN
  RETURN EXISTS (SELECT 1 FROM public.tenants t
   WHERE t.id::text=(storage.foldername(p_object_name))[2]
     AND private.hris_optional_module_enabled(t.id,'learning'));
 END IF;
 RETURN true; -- Unrelated Storage buckets keep their existing policies.
END;
$fn$;
REVOKE ALL ON FUNCTION private.hris_storage_optional_module_enabled(text,text)
 FROM PUBLIC,anon,authenticated;
-- RLS expressions run with the active authenticated role even when their
-- helper function itself is SECURITY DEFINER.
GRANT EXECUTE ON FUNCTION private.hris_storage_optional_module_enabled(text,text)
 TO authenticated;

CREATE POLICY hris_optional_module_storage_insert
 ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (private.hris_storage_optional_module_enabled(bucket_id,name));
CREATE POLICY hris_optional_module_storage_update
 ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (private.hris_storage_optional_module_enabled(bucket_id,name))
 WITH CHECK (private.hris_storage_optional_module_enabled(bucket_id,name));
CREATE POLICY hris_optional_module_storage_delete
 ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING (private.hris_storage_optional_module_enabled(bucket_id,name));

CREATE OR REPLACE FUNCTION public.platform_hris_list_tenant_modules(p_tenant_id uuid)
RETURNS TABLE(module_key text,enabled boolean,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id=p_tenant_id) THEN
  RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002';
 END IF;
 RETURN QUERY SELECT k.module_key,coalesce(s.enabled,true),s.updated_at
 FROM (VALUES('travel'::text),('expenses'::text),('learning'::text)) k(module_key)
 LEFT JOIN public.tenant_module_settings s
 ON s.tenant_id=p_tenant_id AND s.module_key=k.module_key
 ORDER BY k.module_key;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_hris_set_tenant_module(
 p_tenant_id uuid,p_module_key text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_previous boolean;
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF p_tenant_id IS NULL OR p_module_key NOT IN ('travel','expenses','learning')
    OR p_module_key IS NULL OR p_enabled IS NULL THEN
  RAISE EXCEPTION 'Invalid optional-module request' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 SELECT coalesce((SELECT s.enabled FROM public.tenant_module_settings s
    WHERE s.tenant_id=p_tenant_id AND s.module_key=p_module_key),true)
 INTO v_previous;
 IF v_previous IS NOT DISTINCT FROM p_enabled THEN RETURN; END IF;
 INSERT INTO public.tenant_module_settings(tenant_id,module_key,enabled,updated_by)
 VALUES(p_tenant_id,p_module_key,p_enabled,auth.uid())
 ON CONFLICT(tenant_id,module_key) DO UPDATE SET
  enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),'PLATFORM_TENANT_MODULE_CHANGED','tenant_module_settings',p_tenant_id::text,
  pg_catalog.jsonb_build_object('module',p_module_key,'from_enabled',v_previous,
    'to_enabled',p_enabled,'history_retained',true));
END;
$fn$;

REVOKE ALL ON FUNCTION public.platform_hris_list_tenant_modules(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.platform_hris_set_tenant_module(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_list_tenant_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_set_tenant_module(uuid,text,boolean) TO authenticated;
COMMIT;
