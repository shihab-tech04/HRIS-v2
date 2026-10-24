-- Keep candidate preboarding review available while activation policy is unresolved.
-- The current RPC provisions an active employee and advances the application to
-- hired, but employee status and role-mapping rules have not been approved.
-- Server-side clients remain unable to invoke this path as authenticated users.
BEGIN;

REVOKE ALL ON FUNCTION public.hris_activate_candidate_employee(uuid,uuid,text,date)
  FROM PUBLIC, anon, authenticated;

COMMIT;
