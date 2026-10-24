-- Replacement-only Super Admin invitation flow.
-- Invites are recorded privately; a tenant and membership are created only
-- after the invited Auth identity confirms the matching email and accepts.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.platform_tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  tenant_code text NOT NULL,
  tenant_slug text NOT NULL,
  tenant_name text NOT NULL,
  timezone text NOT NULL,
  default_locale text NOT NULL CHECK (default_locale IN ('en','bn')),
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending','sent','accepted','failed','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  accepted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_tenant_invitations_live_email_uq
  ON private.platform_tenant_invitations (lower(email))
  WHERE status IN ('pending','sent');
CREATE UNIQUE INDEX IF NOT EXISTS platform_tenant_invitations_live_code_uq
  ON private.platform_tenant_invitations (upper(tenant_code))
  WHERE status IN ('pending','sent');
CREATE UNIQUE INDEX IF NOT EXISTS platform_tenant_invitations_live_slug_uq
  ON private.platform_tenant_invitations (lower(tenant_slug))
  WHERE status IN ('pending','sent');

ALTER TABLE private.platform_tenant_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.platform_tenant_invitations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.platform_hris_is_active_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.admin_users AS a
    JOIN auth.users AS u ON u.id = a.user_id
    WHERE a.user_id = p_user_id
      AND a.active IS TRUE
      AND a.is_super_admin IS TRUE
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  );
$function$;

REVOKE ALL ON FUNCTION private.platform_hris_is_active_super_admin(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_hris_create_tenant_invitation(
  p_code text,
  p_slug text,
  p_name text,
  p_timezone text,
  p_default_locale text,
  p_admin_email text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_admin_email, '')));
  v_invitation_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
BEGIN
  IF NOT public.is_live_session() OR NOT public.platform_hris_is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' OR length(v_email) > 320 OR v_email ~ '[[:space:]]'
    OR position('@' IN v_email) < 2
    OR position('.' IN substring(v_email FROM position('@' IN v_email) + 1)) < 2 THEN
    RAISE EXCEPTION 'Enter a valid administrator email address.' USING ERRCODE = '22023';
  END IF;
  IF v_code !~ '^[A-Z0-9_]{2,24}$'
    OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR length(v_slug) > 80
    OR length(v_name) NOT BETWEEN 2 AND 180
    OR p_default_locale NOT IN ('en','bn')
    OR p_timezone IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'Invalid tenant configuration' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users AS u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'An Auth account already uses this email. Use the existing confirmed account workflow.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants AS t WHERE upper(t.code) = v_code OR lower(t.slug) = v_slug) THEN
    RAISE EXCEPTION 'That tenant code or URL key is already in use.' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.roles AS r
    JOIN public.role_permissions AS rp
      ON rp.role_id = r.id AND rp.permission_id = 'organization.manage'
    WHERE r.id = 'hr_admin' AND r.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Tenant administrator role is not configured for scoped authorization'
      USING ERRCODE = '55000';
  END IF;

  UPDATE private.platform_tenant_invitations
  SET status = 'expired', updated_at = now()
  WHERE status IN ('pending','sent') AND expires_at <= now();

  INSERT INTO private.platform_tenant_invitations (
    email, tenant_code, tenant_slug, tenant_name, timezone, default_locale,
    inviter_user_id, status, expires_at
  ) VALUES (
    v_email, v_code, v_slug, v_name, p_timezone, p_default_locale,
    auth.uid(), 'pending', v_expires_at
  ) RETURNING id INTO v_invitation_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'PLATFORM_TENANT_INVITATION_CREATED',
    'platform_tenant_invitations', v_invitation_id::text,
    pg_catalog.jsonb_build_object(
      'tenant_code', v_code, 'tenant_slug', v_slug, 'expires_at', v_expires_at
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'invitation_id', v_invitation_id, 'email', v_email, 'expires_at', v_expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_hris_mark_tenant_invitation_sent(
  p_invitation_id uuid,
  p_auth_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation private.platform_tenant_invitations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT i.* INTO v_invitation
  FROM private.platform_tenant_invitations AS i
  WHERE i.id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending'
    OR v_invitation.expires_at <= now()
    OR NOT private.platform_hris_is_active_super_admin(v_invitation.inviter_user_id)
    OR NOT EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = p_auth_user_id
        AND lower(u.email) = v_invitation.email
        AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until <= now())
    ) THEN
    RAISE EXCEPTION 'Invitation delivery could not be finalized.' USING ERRCODE = '22023';
  END IF;

  UPDATE private.platform_tenant_invitations
  SET invited_auth_user_id = p_auth_user_id,
      status = 'sent',
      sent_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    v_invitation.inviter_user_id, 'PLATFORM_TENANT_INVITATION_SENT',
    'platform_tenant_invitations', p_invitation_id::text,
    pg_catalog.jsonb_build_object('tenant_code', v_invitation.tenant_code)
  );
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_hris_mark_tenant_invitation_failed(
  p_invitation_id uuid
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation private.platform_tenant_invitations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT i.* INTO v_invitation
  FROM private.platform_tenant_invitations AS i
  WHERE i.id = p_invitation_id AND i.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation delivery could not be finalized.' USING ERRCODE = '22023';
  END IF;
  UPDATE private.platform_tenant_invitations
  SET status = 'failed', updated_at = now()
  WHERE id = p_invitation_id;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    v_invitation.inviter_user_id, 'PLATFORM_TENANT_INVITATION_DELIVERY_FAILED',
    'platform_tenant_invitations', p_invitation_id::text,
    pg_catalog.jsonb_build_object('tenant_code', v_invitation.tenant_code)
  );
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_hris_accept_tenant_invitation(
  p_invitation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation private.platform_tenant_invitations%ROWTYPE;
  v_tenant_id uuid;
  v_tenant_name text;
  v_tenant_active boolean;
BEGIN
  IF NOT public.is_live_session() OR auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  ) THEN
    RAISE EXCEPTION 'An active confirmed invited account is required.' USING ERRCODE = '42501';
  END IF;

  SELECT i.* INTO v_invitation
  FROM private.platform_tenant_invitations AS i
  WHERE i.id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND OR v_invitation.invited_auth_user_id IS DISTINCT FROM auth.uid()
    OR NOT EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid() AND lower(u.email) = v_invitation.email
    ) THEN
    RAISE EXCEPTION 'This invitation is not available to this account.' USING ERRCODE = '42501';
  END IF;

  IF v_invitation.status = 'accepted' THEN
    SELECT t.id, t.name, t.is_active
      INTO v_tenant_id, v_tenant_name, v_tenant_active
    FROM public.tenants AS t
    WHERE t.id = v_invitation.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This invitation is not available to this account.' USING ERRCODE = '42501';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'tenant_id', v_tenant_id, 'tenant_name', v_tenant_name,
      'is_active', v_tenant_active, 'accepted', true
    );
  END IF;

  IF v_invitation.status <> 'sent'
    OR v_invitation.expires_at <= now()
    OR NOT private.platform_hris_is_active_super_admin(v_invitation.inviter_user_id) THEN
    RAISE EXCEPTION 'This invitation has expired or is no longer available.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenants AS t
    WHERE upper(t.code) = v_invitation.tenant_code
      OR lower(t.slug) = v_invitation.tenant_slug
  ) THEN
    RAISE EXCEPTION 'Tenant configuration changed before invitation acceptance.' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.roles AS r
    JOIN public.role_permissions AS rp
      ON rp.role_id = r.id AND rp.permission_id = 'organization.manage'
    WHERE r.id = 'hr_admin' AND r.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Tenant administrator role is not configured for scoped authorization'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.tenants(code, slug, name, timezone, default_locale, is_active)
  VALUES (
    v_invitation.tenant_code, v_invitation.tenant_slug, v_invitation.tenant_name,
    v_invitation.timezone, v_invitation.default_locale, false
  ) RETURNING id, name, is_active INTO v_tenant_id, v_tenant_name, v_tenant_active;

  INSERT INTO public.tenant_memberships(tenant_id, user_id, role, status)
  VALUES (v_tenant_id, auth.uid(), 'hr_admin', 'active');

  UPDATE private.platform_tenant_invitations
  SET tenant_id = v_tenant_id, status = 'accepted',
      accepted_at = now(), updated_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'PLATFORM_TENANT_INVITATION_ACCEPTED',
    'tenants', v_tenant_id::text,
    pg_catalog.jsonb_build_object(
      'invitation_id', p_invitation_id, 'inactive_pending_certification', true
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'tenant_id', v_tenant_id, 'tenant_name', v_tenant_name,
    'is_active', v_tenant_active, 'accepted', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_hris_create_tenant_invitation(text,text,text,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_create_tenant_invitation(text,text,text,text,text,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.platform_hris_accept_tenant_invitation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_accept_tenant_invitation(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.platform_hris_mark_tenant_invitation_sent(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_mark_tenant_invitation_sent(uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.platform_hris_mark_tenant_invitation_failed(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_mark_tenant_invitation_failed(uuid)
  TO service_role;

COMMIT;
