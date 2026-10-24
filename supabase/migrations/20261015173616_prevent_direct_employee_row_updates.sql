-- Employee contact edits must use the validated, audited tenant-scoped RPC.
-- Do not let authenticated clients bypass it to change lifecycle or org fields.
BEGIN;

REVOKE UPDATE ON TABLE public.employees FROM PUBLIC, anon, authenticated;

COMMIT;
