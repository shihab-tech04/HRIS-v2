BEGIN;

ALTER TABLE public.employee_family_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS employee_family_members_employee_id_idx
  ON public.employee_family_members (employee_id);

CREATE POLICY employee_family_members_self_read
  ON public.employee_family_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_live_session()
    AND employee_id = public.employee_for_auth_user()
  );

COMMIT;
