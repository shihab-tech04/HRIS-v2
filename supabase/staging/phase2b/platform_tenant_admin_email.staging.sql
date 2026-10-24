-- PHASE 2B STAGING CONTRACT ONLY.
-- Resolves only an exact, confirmed Auth email for existing tenant-admin workflows.
-- It creates no Auth identities, sends no email, and does not change tenant activation.
BEGIN;

CREATE OR REPLACE FUNCTION public._platform_hris_confirmed_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
BEGIN
  IF NOT public.platform_hris_is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' OR length(v_email) > 320 OR v_email ~ '[[:space:]]'
     OR position('@' IN v_email) < 2
     OR position('.' IN substring(v_email FROM position('@' IN v_email) + 1)) < 2 THEN
    RAISE EXCEPTION 'Enter a valid administrator email address.' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_user_id
  FROM auth.users AS u
  WHERE lower(u.email) = v_email
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'An active, confirmed Auth account was not found for this email.' USING ERRCODE = '22023';
  END IF;
  RETURN v_user_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_hris_provision_tenant_by_email(
  p_code text,
  p_slug text,
  p_name text,
  p_timezone text,
  p_default_locale text,
  p_admin_email text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_admin_user_id uuid;
BEGIN
  IF NOT public.platform_hris_is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  v_admin_user_id := public._platform_hris_confirmed_user_id_by_email(p_admin_email);
  RETURN public.platform_hris_provision_tenant(
    p_code, p_slug, p_name, p_timezone, p_default_locale, v_admin_user_id
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_hris_set_tenant_admin_by_email(
  p_tenant_id uuid,
  p_admin_email text,
  p_enabled boolean
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_admin_user_id uuid;
BEGIN
  IF NOT public.platform_hris_is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid tenant administrator request' USING ERRCODE = '22023';
  END IF;
  v_admin_user_id := public._platform_hris_confirmed_user_id_by_email(p_admin_email);
  PERFORM public.platform_hris_set_tenant_admin(p_tenant_id, v_admin_user_id, p_enabled);
END
$function$;

REVOKE ALL ON FUNCTION public._platform_hris_confirmed_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_hris_provision_tenant_by_email(text,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_set_tenant_admin_by_email(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_provision_tenant_by_email(text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_set_tenant_admin_by_email(uuid,text,boolean) TO authenticated;

COMMIT;
