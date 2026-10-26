-- Tenant-scoped employee creation and confirmed-email invitation acceptance.
-- HR staff can create pending employee records only through this permission-
-- checked RPC; Auth provisioning is performed by the server-side Edge Function.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA IF NOT EXISTS private;

DO $role$
DECLARE
  v_employee_role_count integer;
  v_employee_role_id text;
BEGIN
  SELECT count(*)::integer, min(r.id)
    INTO v_employee_role_count, v_employee_role_id
  FROM public.roles AS r
  WHERE lower(btrim(r.name)) = 'employee';

  IF v_employee_role_count > 1 THEN
    RAISE EXCEPTION 'More than one Employee role exists; resolve the duplicate role before enabling employee invitations.';
  ELSIF v_employee_role_count = 1 THEN
    UPDATE public.roles
    SET active = true,
        is_system = true,
        updated_at = now()
    WHERE id = v_employee_role_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.roles WHERE id = 'employee') THEN
      RAISE EXCEPTION 'The canonical employee role ID is already assigned to a different role.';
    END IF;
    INSERT INTO public.roles(id, name, description, active, is_system)
    VALUES ('employee', 'Employee', 'Tenant employee workspace role.', true, true);
  END IF;

  IF (SELECT count(*) FROM public.roles WHERE active IS TRUE AND lower(btrim(name)) = 'employee') <> 1 THEN
    RAISE EXCEPTION 'Exactly one active Employee role is required.';
  END IF;
END
$role$;

-- Tenant HR administrators need the least additional permission required to
-- see and manage the employee directory and create employee invitations.
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT 'hr_admin', 'employees.manage'
WHERE EXISTS (
  SELECT 1 FROM public.roles AS r WHERE r.id = 'hr_admin' AND r.active IS TRUE
)
  AND EXISTS (
  SELECT 1 FROM public.permissions AS p WHERE p.id = 'employees.manage'
)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS private.hris_employee_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  email text NOT NULL,
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending','sent','accepted','failed','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  accepted_at timestamptz,
  UNIQUE (tenant_id, request_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hris_employee_invitations_live_email_uq
  ON private.hris_employee_invitations (tenant_id, lower(email))
  WHERE status IN ('pending','sent');

CREATE INDEX IF NOT EXISTS hris_employee_invitations_auth_user_idx
  ON private.hris_employee_invitations (invited_auth_user_id)
  WHERE invited_auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.hris_guard_employee_invitation_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.user_id IS NULL
    AND lower(coalesce(NEW.official_email, '')) IS DISTINCT FROM lower(coalesce(OLD.official_email, ''))
    AND EXISTS (
      SELECT 1 FROM private.hris_employee_invitations AS i
      WHERE i.employee_id = OLD.id
        AND i.status IN ('pending','sent')
        AND i.expires_at > now()
    ) THEN
    RAISE EXCEPTION 'The official email cannot change while this employee invitation is pending.'
      USING errcode = '55000';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.hris_guard_employee_invitation_email()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hris_guard_employee_invitation_email ON public.employees;
CREATE TRIGGER hris_guard_employee_invitation_email
  BEFORE UPDATE OF official_email ON public.employees
  FOR EACH ROW EXECUTE FUNCTION private.hris_guard_employee_invitation_email();

ALTER TABLE private.hris_employee_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.hris_employee_invitations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.hris_employee_inviter_has_permission(
  p_tenant_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS t
      JOIN public.tenant_memberships AS m
        ON m.tenant_id = t.id
       AND m.user_id = p_user_id
       AND lower(m.status) = 'active'
      JOIN public.roles AS r
        ON r.id = m.role
       AND r.active IS TRUE
      JOIN public.role_permissions AS rp
        ON rp.role_id = r.id
       AND rp.permission_id = 'employees.manage'
      JOIN auth.users AS u
        ON u.id = p_user_id
       AND u.email_confirmed_at IS NOT NULL
       AND u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until <= now())
      WHERE t.id = p_tenant_id
        AND t.is_active IS TRUE
    )
$function$;

REVOKE ALL ON FUNCTION private.hris_employee_inviter_has_permission(uuid,uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hris_create_employee_invitation(
  p_tenant_id uuid,
  p_request_id uuid,
  p_employee_number text,
  p_full_name text,
  p_email text,
  p_joining_date date
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_employee_number text := btrim(coalesce(p_employee_number, ''));
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_employee_id uuid;
  v_invitation private.hris_employee_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'A current HRIS session is required.' USING errcode = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_request_id IS NULL
    OR NOT public.has_tenant_permission(p_tenant_id, 'employees.manage') THEN
    RAISE EXCEPTION 'Employee-management access for this organization is required.' USING errcode = '42501';
  END IF;
  IF v_employee_number = '' OR char_length(v_employee_number) > 32 THEN
    RAISE EXCEPTION 'Enter an employee number of up to 32 characters.' USING errcode = '22023';
  END IF;
  IF char_length(v_full_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Enter an employee name between 2 and 160 characters.' USING errcode = '22023';
  END IF;
  IF v_email = '' OR char_length(v_email) > 320
    OR v_email ~ '[[:space:]]'
    OR v_email !~ '^[^@]+@[^@]+[.][^@.]+([.][^@.]+)*$' THEN
    RAISE EXCEPTION 'Enter a valid employee email address.' USING errcode = '22023';
  END IF;
  IF p_joining_date IS NULL THEN
    RAISE EXCEPTION 'Enter the employee joining date.' USING errcode = '22023';
  END IF;

  SELECT i.* INTO v_invitation
  FROM private.hris_employee_invitations AS i
  WHERE i.tenant_id = p_tenant_id
    AND i.request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_invitation.inviter_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'This invitation request is unavailable.' USING errcode = '42501';
    END IF;
    IF v_invitation.expires_at <= now() THEN
      RAISE EXCEPTION 'This invitation request has expired.' USING errcode = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.employees AS e
      WHERE e.id = v_invitation.employee_id
        AND e.tenant_id = p_tenant_id
        AND e.employee_number = v_employee_number
        AND e.full_name = v_full_name
        AND lower(e.official_email) = v_email
        AND e.joining_date = p_joining_date
    ) THEN
      RAISE EXCEPTION 'This invitation was already created with different employee details. Retry using the original details.' USING errcode = '22023';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'invitation_id', v_invitation.id,
      'employee_id', v_invitation.employee_id,
      'email', v_invitation.email,
      'status', v_invitation.status,
      'expires_at', v_invitation.expires_at,
      'idempotent', true
    );
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users AS u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'An Auth account already uses this email. Use the existing account access workflow.' USING errcode = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employees AS e
    WHERE e.tenant_id = p_tenant_id AND lower(e.official_email) = v_email
  ) THEN
    RAISE EXCEPTION 'An employee record already uses this email in this organization.' USING errcode = '23505';
  END IF;

  INSERT INTO public.employees (
    tenant_id, employee_number, full_name, official_email, joining_date, employment_status
  ) VALUES (
    p_tenant_id, v_employee_number, v_full_name, v_email, p_joining_date, 'active'
  ) RETURNING id INTO v_employee_id;

  INSERT INTO private.hris_employee_invitations (
    tenant_id, employee_id, request_id, email, inviter_user_id, status, expires_at
  ) VALUES (
    p_tenant_id, v_employee_id, p_request_id, v_email, auth.uid(), 'pending', now() + interval '7 days'
  ) RETURNING * INTO v_invitation;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'HRIS_EMPLOYEE_INVITATION_CREATED', 'employee', v_employee_id::text,
    pg_catalog.jsonb_build_object('tenant_id', p_tenant_id, 'invitation_id', v_invitation.id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'invitation_id', v_invitation.id,
    'employee_id', v_invitation.employee_id,
    'email', v_invitation.email,
    'status', v_invitation.status,
    'expires_at', v_invitation.expires_at,
    'idempotent', false
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_mark_employee_invitation_sent(
  p_invitation_id uuid,
  p_auth_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation private.hris_employee_invitations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized.' USING errcode = '42501';
  END IF;

  SELECT i.* INTO v_invitation
  FROM private.hris_employee_invitations AS i
  WHERE i.id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_invitation.status NOT IN ('pending','failed')
    OR v_invitation.expires_at <= now()
    OR NOT private.hris_employee_inviter_has_permission(v_invitation.tenant_id, v_invitation.inviter_user_id)
    OR NOT EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = p_auth_user_id
        AND lower(u.email) = v_invitation.email
        AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until <= now())
    ) THEN
    RAISE EXCEPTION 'Invitation delivery could not be finalized.' USING errcode = '22023';
  END IF;

  UPDATE private.hris_employee_invitations
  SET invited_auth_user_id = p_auth_user_id,
      status = 'sent', sent_at = now(), updated_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    v_invitation.inviter_user_id, 'HRIS_EMPLOYEE_INVITATION_SENT', 'employee',
    v_invitation.employee_id::text,
    pg_catalog.jsonb_build_object('tenant_id', v_invitation.tenant_id, 'invitation_id', p_invitation_id)
  );
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_mark_employee_invitation_failed(
  p_invitation_id uuid
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation private.hris_employee_invitations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized.' USING errcode = '42501';
  END IF;

  SELECT i.* INTO v_invitation
  FROM private.hris_employee_invitations AS i
  WHERE i.id = p_invitation_id AND i.status IN ('pending','failed')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation delivery could not be finalized.' USING errcode = '22023';
  END IF;

  UPDATE private.hris_employee_invitations
  SET status = 'failed', updated_at = now()
  WHERE id = p_invitation_id;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    v_invitation.inviter_user_id, 'HRIS_EMPLOYEE_INVITATION_DELIVERY_FAILED', 'employee',
    v_invitation.employee_id::text,
    pg_catalog.jsonb_build_object('tenant_id', v_invitation.tenant_id, 'invitation_id', p_invitation_id)
  );
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_accept_employee_invitation(
  p_invitation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation private.hris_employee_invitations%ROWTYPE;
  v_employee public.employees%ROWTYPE;
  v_employee_role_id text;
  v_employee_role_count integer;
  v_membership_role text;
  v_membership_status text;
  v_tenant_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
    OR NOT EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.email_confirmed_at IS NOT NULL
        AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until <= now())
    ) THEN
    RAISE EXCEPTION 'A signed-in, confirmed invited account is required.' USING errcode = '42501';
  END IF;

  SELECT i.* INTO v_invitation
  FROM private.hris_employee_invitations AS i
  WHERE i.id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_invitation.invited_auth_user_id IS DISTINCT FROM auth.uid()
    OR NOT EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid() AND lower(u.email) = v_invitation.email
    ) THEN
    RAISE EXCEPTION 'This invitation is not available to this account.' USING errcode = '42501';
  END IF;

  IF v_invitation.status = 'accepted' THEN
    SELECT t.name INTO v_tenant_name
    FROM public.tenants AS t
    JOIN public.employees AS e ON e.tenant_id = t.id
    JOIN public.tenant_memberships AS m
      ON m.tenant_id = t.id AND m.user_id = auth.uid()
    JOIN public.roles AS r
      ON r.id = m.role AND r.active IS TRUE AND lower(btrim(r.name)) = 'employee'
    WHERE t.id = v_invitation.tenant_id
      AND t.is_active IS TRUE
      AND e.id = v_invitation.employee_id AND e.user_id = auth.uid()
      AND m.status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The accepted invitation no longer matches the employee membership.' USING errcode = '23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'accepted', true, 'idempotent', true,
      'tenant_id', v_invitation.tenant_id, 'tenant_name', v_tenant_name,
      'employee_id', v_invitation.employee_id
    );
  END IF;

  IF v_invitation.status <> 'sent'
    OR v_invitation.expires_at <= now()
    OR NOT private.hris_employee_inviter_has_permission(v_invitation.tenant_id, v_invitation.inviter_user_id) THEN
    RAISE EXCEPTION 'This invitation has expired or is no longer available.' USING errcode = '22023';
  END IF;

  SELECT e.* INTO v_employee
  FROM public.employees AS e
  WHERE e.id = v_invitation.employee_id
    AND e.tenant_id = v_invitation.tenant_id
    AND lower(e.official_email) = v_invitation.email
  FOR UPDATE;
  IF NOT FOUND OR (v_employee.user_id IS NOT NULL AND v_employee.user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'The employee record is not available for this invitation.' USING errcode = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employees AS e
    WHERE e.user_id = auth.uid() AND e.id <> v_invitation.employee_id
  ) THEN
    RAISE EXCEPTION 'This account is already linked to another employee record.' USING errcode = '23505';
  END IF;

  SELECT count(*)::integer, min(r.id)
    INTO v_employee_role_count, v_employee_role_id
  FROM public.roles AS r
  WHERE r.active IS TRUE AND lower(btrim(r.name)) = 'employee';
  IF v_employee_role_count <> 1 OR v_employee_role_id IS NULL THEN
    RAISE EXCEPTION 'The Employee role is not configured.' USING errcode = '55000';
  END IF;

  SELECT m.role, m.status INTO v_membership_role, v_membership_status
  FROM public.tenant_memberships AS m
  WHERE m.tenant_id = v_invitation.tenant_id AND m.user_id = auth.uid()
  FOR UPDATE;
  IF FOUND THEN
    IF v_membership_role <> v_employee_role_id THEN
      RAISE EXCEPTION 'This account already has a different role in this organization.' USING errcode = '23514';
    END IF;
    IF lower(v_membership_status) <> 'active' THEN
      UPDATE public.tenant_memberships
      SET status = 'active', updated_at = now()
      WHERE tenant_id = v_invitation.tenant_id AND user_id = auth.uid();
    END IF;
  ELSE
    INSERT INTO public.tenant_memberships(tenant_id, user_id, role, status)
    VALUES (v_invitation.tenant_id, auth.uid(), v_employee_role_id, 'active');
  END IF;

  UPDATE public.employees
  SET user_id = auth.uid(), updated_at = now()
  WHERE id = v_invitation.employee_id
    AND tenant_id = v_invitation.tenant_id
    AND (user_id IS NULL OR user_id = auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee account activation did not complete.' USING errcode = '23514';
  END IF;

  UPDATE private.hris_employee_invitations
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = p_invitation_id;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants AS t
  WHERE t.id = v_invitation.tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The employee organization is not active.' USING errcode = '42501';
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'HRIS_EMPLOYEE_INVITATION_ACCEPTED', 'employee',
    v_invitation.employee_id::text,
    pg_catalog.jsonb_build_object('tenant_id', v_invitation.tenant_id, 'invitation_id', p_invitation_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'accepted', true, 'idempotent', false,
    'tenant_id', v_invitation.tenant_id, 'tenant_name', v_tenant_name,
    'employee_id', v_invitation.employee_id
  );
END
$function$;

REVOKE ALL ON FUNCTION public.hris_create_employee_invitation(uuid,uuid,text,text,text,date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_create_employee_invitation(uuid,uuid,text,text,text,date)
  TO authenticated;
REVOKE ALL ON FUNCTION public.hris_mark_employee_invitation_sent(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hris_mark_employee_invitation_sent(uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.hris_mark_employee_invitation_failed(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hris_mark_employee_invitation_failed(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.hris_accept_employee_invitation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_accept_employee_invitation(uuid)
  TO authenticated;

COMMIT;
