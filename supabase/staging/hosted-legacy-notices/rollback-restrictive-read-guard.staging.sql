-- Exact rollback for the additive legacy notice guard only.
-- Does not touch notices_read, rows, functions, roles or memberships.
-- Before running, verify that the policy still has the definition installed
-- by apply-restrictive-read-guard.staging.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP POLICY IF EXISTS hris_notices_legacy_security_guard ON public.notices;
COMMIT;
