-- WS05 single-Super-Admin consistency repair. STAGING ONLY; do not db-push.
-- Observed 2026-11-02 in replacement HRIS (xfuxnljfrgvusbrpvxpa):
-- 1 GoTrue Auth user, exactly 1 matching active public.admin_users Super Admin,
-- 1 active tenant membership, 5 employee records, 1 stale employee.user_id link.
--
-- Employee records are business records, NOT login accounts. Do not delete them.
-- The existing employees.user_id column is nullable and has an ON DELETE SET NULL
-- foreign key to auth.users. This script only clears a stale reference that
-- points to no existing Auth user. It never inserts/deletes/authenticates users.
--
-- Prerequisites: exact-current off-GitHub recovery, verified restore, independent
-- acceptance and WS05 approval. Both session flags are operator acknowledgments,
-- NOT substitutes for the external backup / release evidence.
-- Run only on the named replacement HRIS after controlled review, never original.
-- Fail closed if counts drift; no general-purpose data wipe.
BEGIN;

DO $single_super_admin_reconcile$
DECLARE
  v_auth_count integer;
  v_super_admin_count integer;
  v_active_membership_count integer;
  v_orphan_count integer;
  v_fixed_count integer;
  v_orphan_fingerprint text;
  -- Exact observed employee-id/stale-user-id pair, fingerprinted to prevent
  -- a different orphan row from being changed after inventory drift.
  v_expected_fingerprint constant text := '224deda3117d33aba10bfa607835873d';
BEGIN
  IF current_setting('hris.ws05_single_admin_reconcile_approved', true) IS DISTINCT FROM 'yes'
     OR current_setting('hris.ws05_recovery_restored', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'WS05 authorization and verified external restore are required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_auth_count FROM auth.users;
  IF v_auth_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Auth user, found %; no changes made.', v_auth_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_super_admin_count
  FROM auth.users u
  JOIN public.admin_users a ON a.user_id = u.id
  WHERE a.active IS TRUE AND a.is_super_admin IS TRUE;

  SELECT count(*)
  INTO v_active_membership_count
  FROM auth.users u
  JOIN public.admin_users a ON a.user_id = u.id
  JOIN public.tenant_memberships m ON m.user_id = u.id
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE a.active IS TRUE
    AND a.is_super_admin IS TRUE
    AND m.status = 'active'
    AND t.is_active IS TRUE;

  IF v_super_admin_count <> 1 OR v_active_membership_count <> 1 THEN
    RAISE EXCEPTION 'Single Super Admin or active tenant binding is inconsistent; no changes made.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_orphan_count
  FROM public.employees e
  WHERE e.user_id IS NOT NULL
    AND md5(e.id::text || ':' || e.user_id::text) = v_expected_fingerprint
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id);

  IF v_orphan_count <> 1 THEN
    RAISE EXCEPTION 'Expected precisely one stale employee login link; found %. Refresh inventory.', v_orphan_count
      USING ERRCODE = '23514';
  END IF;

  -- A non-STRICT scalar SELECT INTO silently chooses an arbitrary orphan
  -- if more than one exists. Aggregate all orphans and fail closed on drift.
  SELECT count(*), min(md5(e.id::text || ':' || e.user_id::text))
  INTO v_orphan_count, v_orphan_fingerprint
  FROM public.employees e
  WHERE e.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id);
  IF v_orphan_count <> 1
     OR v_orphan_fingerprint IS DISTINCT FROM v_expected_fingerprint THEN
    RAISE EXCEPTION 'Stale employee link inventory differs from the approved single target; no changes made.'
      USING ERRCODE = '23514';
  END IF;

  -- The UPDATE itself must target the reviewed pair, not every orphan.
  -- This is defense in depth against a newly orphaned row between the
  -- inventory query and the write. Never broaden the mutation predicate.
  UPDATE public.employees e
  SET user_id = NULL,
      updated_at = now()
  WHERE e.user_id IS NOT NULL
    AND md5(e.id::text || ':' || e.user_id::text) = v_expected_fingerprint
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id);

  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
  IF v_fixed_count <> 1 THEN
    RAISE EXCEPTION 'Expected one corrected employee link, updated %; rolling back.', v_fixed_count
      USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM auth.users) <> 1
     OR (SELECT count(*) FROM public.employees e
         WHERE e.user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id)) <> 0 THEN
    RAISE EXCEPTION 'Postcondition failed; rolling back.' USING ERRCODE = '23514';
  END IF;
END;
$single_super_admin_reconcile$ LANGUAGE plpgsql;

COMMIT;
