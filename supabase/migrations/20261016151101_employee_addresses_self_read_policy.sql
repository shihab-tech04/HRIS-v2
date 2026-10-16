-- Allow a live employee session to read only its own address rows. The existing
-- admin-read policy remains separate and continues to enforce HR permissions.
CREATE INDEX IF NOT EXISTS employee_addresses_employee_id_idx
  ON public.employee_addresses(employee_id);

CREATE POLICY employee_addresses_self_read
  ON public.employee_addresses
  FOR SELECT
  TO authenticated
  USING (
    public.is_live_session()
    AND employee_id = public.employee_for_auth_user()
  );
