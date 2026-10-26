-- Require the separately approved Phase 21 security sign-off before a new tenant can activate.
-- The certifier claim is assigned only through trusted Supabase Auth Admin app_metadata.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.platform_tenant_security_certifications (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  security_signoff_complete boolean NOT NULL CHECK (security_signoff_complete IS TRUE),
  evidence_reference text NOT NULL
    CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 500),
  certified_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  certified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.platform_tenant_security_certifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.platform_tenant_security_certifications
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.platform_tenant_security_certifications IS
  'Private record of the separately approved Phase 21 security sign-off required to activate a tenant.';
COMMENT ON COLUMN private.platform_tenant_security_certifications.evidence_reference IS
  'Reference to the approved security sign-off record. Do not store credentials or secrets here.';
COMMENT ON COLUMN private.platform_tenant_security_certifications.certified_by IS
  'Authenticated platform Super Admin whose trusted Auth app_metadata carries hris_tenant_security_certifier=true.';

CREATE OR REPLACE FUNCTION private.platform_hris_current_user_can_certify_tenant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.is_live_session()
    AND public.platform_hris_is_super_admin()
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'hris_tenant_security_certifier' = 'true',
      false
    );
$function$;

REVOKE ALL ON FUNCTION private.platform_hris_current_user_can_certify_tenant()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.guard_platform_tenant_activation_certification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_signoff boolean;
  v_evidence_reference text;
  v_certified_by uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active IS TRUE THEN
      RAISE EXCEPTION 'New tenants must remain inactive until approved security certification.'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.is_active IS FALSE AND NEW.is_active IS TRUE THEN
    SELECT c.security_signoff_complete, c.evidence_reference, c.certified_by
      INTO v_signoff, v_evidence_reference, v_certified_by
    FROM private.platform_tenant_security_certifications AS c
    WHERE c.tenant_id = OLD.id;

    IF NOT FOUND OR v_signoff IS DISTINCT FROM TRUE
      OR NULLIF(btrim(v_evidence_reference), '') IS NULL
      OR v_certified_by IS NULL THEN
      RAISE EXCEPTION 'Approved security certification is required before tenant activation.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_platform_tenant_activation_certification()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS platform_tenant_activation_requires_certification ON public.tenants;
CREATE TRIGGER platform_tenant_activation_requires_certification
  BEFORE INSERT OR UPDATE OF is_active ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_platform_tenant_activation_certification();

CREATE OR REPLACE FUNCTION public.platform_hris_list_tenant_certifications()
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  is_active boolean,
  certification_status text,
  evidence_reference text,
  certified_at timestamptz,
  can_certify boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_live_session() OR NOT public.platform_hris_is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT t.id,
         t.name,
         t.is_active,
         CASE
           WHEN c.tenant_id IS NOT NULL THEN 'certified'
           WHEN t.is_active IS TRUE THEN 'not_required'
           ELSE 'pending'
         END,
         c.evidence_reference,
         c.certified_at,
         private.platform_hris_current_user_can_certify_tenant()
  FROM public.tenants AS t
  LEFT JOIN private.platform_tenant_security_certifications AS c
    ON c.tenant_id = t.id
  ORDER BY t.name, t.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_hris_certify_and_activate_tenant(
  p_tenant_id uuid,
  p_security_signoff_complete boolean,
  p_evidence_reference text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_name text;
  v_is_active boolean;
  v_evidence_reference text := btrim(coalesce(p_evidence_reference, ''));
  v_certified_at timestamptz := now();
BEGIN
  IF NOT private.platform_hris_current_user_can_certify_tenant() THEN
    RAISE EXCEPTION 'An assigned security certifier with active platform Super Admin access is required.'
      USING ERRCODE = '42501';
  END IF;
  IF p_security_signoff_complete IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The approved Phase 21 security sign-off must be confirmed before activation.'
      USING ERRCODE = '55000';
  END IF;
  IF length(v_evidence_reference) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Enter the reference for the approved security sign-off.'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.name, t.is_active
    INTO v_tenant_name, v_is_active
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_is_active IS TRUE THEN
    RAISE EXCEPTION 'This tenant is already active.' USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS tm
    JOIN auth.users AS u ON u.id = tm.user_id
    JOIN public.roles AS r ON r.id = tm.role AND r.active IS TRUE
    JOIN public.role_permissions AS rp
      ON rp.role_id = r.id AND rp.permission_id = 'organization.manage'
    WHERE tm.tenant_id = p_tenant_id
      AND tm.role = 'hr_admin'
      AND tm.status = 'active'
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  ) THEN
    RAISE EXCEPTION 'A confirmed active tenant administrator with the approved role and permission is required.'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO private.platform_tenant_security_certifications (
    tenant_id, security_signoff_complete, evidence_reference, certified_by, certified_at
  ) VALUES (
    p_tenant_id, TRUE, v_evidence_reference, auth.uid(), v_certified_at
  );

  UPDATE public.tenants AS t
  SET is_active = TRUE
  WHERE t.id = p_tenant_id AND t.is_active IS FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant activation did not complete.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'PLATFORM_TENANT_SECURITY_CERTIFIED_AND_ACTIVATED',
    'tenants', p_tenant_id::text,
    pg_catalog.jsonb_build_object(
      'tenant_name', v_tenant_name,
      'security_signoff_complete', TRUE,
      'evidence_reference', v_evidence_reference
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant_name,
    'is_active', TRUE,
    'certified_at', v_certified_at,
    'evidence_reference', v_evidence_reference
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_hris_list_tenant_certifications()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_list_tenant_certifications()
  TO authenticated;

REVOKE ALL ON FUNCTION public.platform_hris_certify_and_activate_tenant(uuid,boolean,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_certify_and_activate_tenant(uuid,boolean,text)
  TO authenticated;

COMMIT;
