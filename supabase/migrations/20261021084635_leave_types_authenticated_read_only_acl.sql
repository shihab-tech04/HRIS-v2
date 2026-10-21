-- Match the hosted leave_types ACL to its authenticated-only SELECT policies.
-- Approved writes remain in hris_save_leave_type; client table DML and other
-- maintenance privileges are not part of that API contract.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.leave_types
  FROM PUBLIC, anon, authenticated;

-- Keep the tenant-filtered authenticated read path available to HRIS views.
-- Explicit service_role grants are untouched.
GRANT SELECT ON TABLE public.leave_types TO authenticated;

COMMIT;
