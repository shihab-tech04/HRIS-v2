-- Compensating privilege fix: Supabase default privileges granted anon EXECUTE
-- on newly created SECURITY DEFINER helper functions despite PUBLIC REVOKE.
REVOKE ALL ON FUNCTION public.hris_own_employee_for_tenant(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hris_admin_can_read_tenant(uuid, text) FROM anon;
