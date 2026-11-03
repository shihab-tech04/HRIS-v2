-- WS05 controlled release CANDIDATE, NOT an auto-applied migration.
-- Project: replacement HRIS only (xfuxnljfrgvusbrpvxpa).
-- Owner policy: exactly ONE existing SQL-backed Super Admin Auth identity.
--
-- This hook denies ALL new GoTrue Auth user creation (email signup, OAuth,
-- invitations and Auth admin-created users) WHEN AND ONLY WHEN Supabase Auth
-- is configured to invoke the Before User Created Postgres hook below.
-- Installing this function by itself DOES NOT enforce the policy.
-- Existing Super Admin login, token refresh and password recovery are not
-- user-creation operations and remain available.
--
-- Prerequisites before any hosted execution:
--  1. Current complete encrypted DB backup + isolated restore verification.
--  2. Current source and FULL Git history independently held off GitHub.
--  3. Approved WS02/WS04/WS05 verification and manual release authorization.
--  4. Readback confirms one auth.users row, one active Super Admin row, one
--     active tenant membership, exactly one active tenant.
--  5. Obtain control of the hosted Supabase Auth Hooks configuration.
-- No application-level environment flag can disable this hook once enabled.
-- All rollback/owner-account recovery requires a separate approved procedure.
-- Never execute against original HRIS or Nadia-owned projects.

BEGIN;

DO $ws05_preflight$
BEGIN
  IF (SELECT count(*) FROM auth.users) <> 1
    OR (SELECT count(*) FROM public.admin_users a
        JOIN auth.users u ON u.id = a.user_id
        WHERE a.active IS TRUE AND a.is_super_admin IS TRUE) <> 1
    OR (SELECT count(*) FROM public.tenant_memberships m
        JOIN auth.users u ON u.id = m.user_id
        JOIN public.admin_users a ON a.user_id = u.id
        JOIN public.tenants t ON t.id = m.tenant_id
        WHERE a.active IS TRUE AND a.is_super_admin IS TRUE
          AND m.status = 'active' AND t.is_active IS TRUE) <> 1
    OR (SELECT count(*) FROM public.tenants WHERE is_active IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'Sole Super Admin preflight failed; no hook installed.'
      USING ERRCODE = '23514';
  END IF;

  IF to_regprocedure('public.hris_ws05_block_additional_auth_user(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'A function already exists with the target hook name; review before replacing.'
      USING ERRCODE = '23505';
  END IF;
END;
$ws05_preflight$ LANGUAGE plpgsql;

-- Supabase Auth before-user-created hook contract: JSONB event -> JSONB
-- containing error.http_code and error.message. Constant fail-closed reply.
-- SECURITY INVOKER, no table reads and no SECURITY DEFINER privileges.
CREATE FUNCTION public.hris_ws05_block_additional_auth_user(event jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $ws05_hook$
  SELECT jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Additional HRIS authentication accounts are disabled.'
    )
  );
$ws05_hook$;

REVOKE ALL ON FUNCTION public.hris_ws05_block_additional_auth_user(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.hris_ws05_block_additional_auth_user(jsonb)
  TO supabase_auth_admin;

COMMIT;

-- Separate **mandatory** hosted control-plane action (not SQL):
-- Authentication > Hooks > Before User Created -> enable Postgres hook
-- public.hris_ws05_block_additional_auth_user.
--
-- Never claim enforcement based on this SQL alone. After activation:
--  A. Verify a synthetic, unauthorized sign-up returns a 403 and that
--     auth.users remains exactly one, without sending invitation emails.
--  B. Verify existing Super Admin sign-in + refresh and authorized SQL access.
--  C. Verify all three HRIS Edge user-creation endpoints return 403.
--  D. Verify Candidate's shared Auth project and published app cannot create
--     users without violating the same rule.
--  E. Record config readback, SQL ACL, CI, production URL and version.
