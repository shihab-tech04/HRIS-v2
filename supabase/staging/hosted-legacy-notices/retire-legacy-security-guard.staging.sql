-- Retire only the legacy Synesis-pinned notices guard after the tenant-membership
-- policy from 20261017030000 is installed and catalog-verified. This is a
-- staging transition script; run only after reviewing the hosted preflight and
-- confirming all affected administrators have an approved tenant access path.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $retire_legacy_notices_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'notices'
      AND p.policyname = 'hris_notices_membership_guard'
      AND p.permissive = 'RESTRICTIVE'
      AND p.cmd = 'SELECT'
      AND 'authenticated' = ANY(p.roles)
      AND p.qual LIKE '%has_tenant_permission%'
      AND p.qual LIKE '%hris_own_employee_for_tenant%'
  ) THEN
    RAISE EXCEPTION 'Refusing to retire the legacy notices guard: the tenant-membership replacement is not installed as expected.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'notices'
      AND p.policyname = 'hris_notices_legacy_security_guard'
      AND (
        p.permissive <> 'RESTRICTIVE'
        OR p.cmd <> 'SELECT'
        OR NOT ('authenticated' = ANY(p.roles))
        OR p.qual NOT LIKE '%synesis_tenant_id%'
        OR p.qual NOT LIKE '%is_active_admin%'
        OR p.qual NOT LIKE '%has_permission%'
      )
  ) THEN
    RAISE EXCEPTION 'Refusing to retire the legacy notices guard: its catalog definition has drifted.';
  END IF;
END
$retire_legacy_notices_guard$;

DROP POLICY IF EXISTS hris_notices_legacy_security_guard ON public.notices;

COMMIT;
