-- PHASE 2A STAGING CONTRACT ONLY.
-- NOT APPLIED to hrmis-saas production. Deploy only after isolated staging review.
-- New tenants remain inactive until tenant-wide RBAC and RPC isolation are verified.
BEGIN;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS default_locale text;
DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.tenants'::pg_catalog.regclass
    AND conname = 'hris_tenants_default_locale_check') THEN
  ALTER TABLE public.tenants ADD CONSTRAINT hris_tenants_default_locale_check
   CHECK (default_locale IS NULL OR default_locale IN ('en','bn'));
 END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.platform_hris_is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $func$
 SELECT public.is_live_session() AND EXISTS (
  SELECT 1 FROM public.admin_users a
  JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id = auth.uid() AND a.active IS TRUE AND a.is_super_admin IS TRUE
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
 );
$func$;

CREATE OR REPLACE FUNCTION public.platform_hris_list_tenants()
RETURNS TABLE(id uuid,code text,slug text,name text,is_active boolean,
 timezone text,default_locale text,active_admin_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $func$
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
 END IF;
 RETURN QUERY SELECT t.id,t.code,t.slug,t.name,t.is_active,t.timezone,
 t.default_locale,(
  SELECT count(*) FROM public.tenant_memberships m WHERE m.tenant_id=t.id
   AND m.role='hr_admin' AND m.status='active')::bigint
 FROM public.tenants t ORDER BY t.name,t.id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.platform_hris_provision_tenant(
 p_code text,p_slug text,p_name text,p_timezone text,
 p_default_locale text,p_admin_user_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $func$
DECLARE
 v_id uuid;
 v_code text := upper(btrim(p_code));
 v_slug text := lower(btrim(p_slug));
 v_name text := btrim(p_name);
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
 END IF;
 IF v_code IS NULL OR v_code !~ '^[A-Z0-9_]{2,24}$'
 OR v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 OR pg_catalog.length(v_slug)>80 OR v_name IS NULL
 OR pg_catalog.length(v_name) NOT BETWEEN 2 AND 180
 OR p_default_locale IS NULL OR p_default_locale NOT IN ('en','bn')
 OR p_timezone IS NULL OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone
 ) THEN
  RAISE EXCEPTION 'Invalid tenant configuration' USING ERRCODE = '22023';
 END IF;
 IF p_admin_user_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM auth.users u WHERE u.id=p_admin_user_id
  AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL
  AND (u.banned_until IS NULL OR u.banned_until <= now())
 ) THEN
  RAISE EXCEPTION 'Administrator account must be confirmed and active' USING ERRCODE='22023';
 END IF;
 -- Do not create a membership that the tenant-scoped RBAC resolver cannot
 -- resolve. Hosted legacy membership values exist without matching roles.
 IF NOT EXISTS (
  SELECT 1 FROM public.roles r
  JOIN public.role_permissions rp ON rp.role_id=r.id
    AND rp.permission_id='organization.manage'
  WHERE r.id='hr_admin' AND r.active IS TRUE
 ) THEN
  RAISE EXCEPTION 'Tenant administrator role is not configured for scoped authorization'
    USING ERRCODE='55000';
 END IF;
 INSERT INTO public.tenants(code,slug,name,timezone,default_locale,is_active)
 VALUES(v_code,v_slug,v_name,p_timezone,p_default_locale,FALSE)
 RETURNING public.tenants.id INTO v_id;
 INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
 VALUES(v_id,p_admin_user_id,'hr_admin','active');
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),'PLATFORM_TENANT_PROVISIONED','tenants',v_id::text,
  pg_catalog.jsonb_build_object('code',v_code,'slug',v_slug,'inactive_pending_certification',true));
 RETURN v_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.platform_hris_update_tenant_metadata(
 p_tenant_id uuid,p_name text,p_timezone text,p_default_locale text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $func$
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
 END IF;
 IF p_name IS NULL OR pg_catalog.length(btrim(p_name)) NOT BETWEEN 2 AND 180
 OR p_default_locale IS NULL OR p_default_locale NOT IN ('en','bn')
 OR p_timezone IS NULL OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone
 ) THEN
  RAISE EXCEPTION 'Invalid tenant configuration' USING ERRCODE='22023';
 END IF;
 UPDATE public.tenants t SET name=btrim(p_name), timezone=p_timezone,
 default_locale=p_default_locale, updated_at=now() WHERE t.id=p_tenant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),'PLATFORM_TENANT_METADATA_CHANGED','tenants',p_tenant_id::text,
  pg_catalog.jsonb_build_object('fields',pg_catalog.jsonb_build_array('name','timezone','default_locale')));
END;
$func$;

CREATE OR REPLACE FUNCTION public.platform_hris_set_tenant_admin(
 p_tenant_id uuid,p_user_id uuid,p_enabled boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $func$
DECLARE v_existing text;
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_enabled IS NULL
 OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id=p_tenant_id) THEN
  RAISE EXCEPTION 'Invalid tenant administrator request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_tenant_id::text)::bigint);
 IF p_enabled THEN
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_user_id
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())) THEN
    RAISE EXCEPTION 'Administrator account must be confirmed and active' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id=r.id
      AND rp.permission_id='organization.manage'
    WHERE r.id='hr_admin' AND r.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Tenant administrator role is not configured for scoped authorization'
      USING ERRCODE='55000';
  END IF;
  INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  VALUES(p_tenant_id,p_user_id,'hr_admin','active')
  ON CONFLICT (tenant_id,user_id) DO UPDATE
  SET status='active', updated_at=now()
  WHERE public.tenant_memberships.role='hr_admin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Existing membership cannot be converted to administrator until multi-role assignments are supported'
      USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT m.status INTO v_existing FROM public.tenant_memberships m
   WHERE m.tenant_id=p_tenant_id AND m.user_id=p_user_id
    AND m.role='hr_admin' FOR UPDATE;
  IF NOT FOUND OR v_existing<>'active' THEN
    RAISE EXCEPTION 'No active tenant administrator to revoke' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM public.tenant_memberships m
      WHERE m.tenant_id=p_tenant_id AND m.role='hr_admin' AND m.status='active')<=1 THEN
    RAISE EXCEPTION 'Cannot revoke last tenant administrator' USING ERRCODE='23514';
  END IF;
  UPDATE public.tenant_memberships SET status='inactive',updated_at=now()
   WHERE tenant_id=p_tenant_id AND user_id=p_user_id;
 END IF;
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),CASE WHEN p_enabled THEN 'PLATFORM_TENANT_ADMIN_ASSIGNED'
  ELSE 'PLATFORM_TENANT_ADMIN_REVOKED' END,'tenant_memberships',
  p_tenant_id::text,pg_catalog.jsonb_build_object('member_id',p_user_id::text));
END;
$func$;

REVOKE ALL ON FUNCTION public.platform_hris_is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_list_tenants() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_provision_tenant(text,text,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_update_tenant_metadata(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_set_tenant_admin(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_list_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_provision_tenant(text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_update_tenant_metadata(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_set_tenant_admin(uuid,uuid,boolean) TO authenticated;
COMMIT;
