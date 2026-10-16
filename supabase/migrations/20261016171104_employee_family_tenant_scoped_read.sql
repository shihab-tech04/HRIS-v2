-- Replace the legacy global family-row read with tenant membership checks.
-- The table is part of the hosted HRIS baseline, but is not present in every
-- development schema yet, so this is intentionally a no-op until it exists.
BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.employee_family_members') IS NULL THEN
    RAISE NOTICE 'employee_family_members is not present; skipping its read-policy repair';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.employee_family_members ENABLE ROW LEVEL SECURITY';
  EXECUTE 'CREATE INDEX IF NOT EXISTS employee_family_members_employee_id_idx ON public.employee_family_members (employee_id)';
  -- Keep the client contract read-only. This also removes broad default table
  -- grants such as TRUNCATE, REFERENCES, TRIGGER, and version-specific rights.
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.employee_family_members FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT SELECT ON TABLE public.employee_family_members TO authenticated';

  -- Replace the production policy that used the global has_permission helper.
  EXECUTE 'DROP POLICY IF EXISTS employee_family_admin_read ON public.employee_family_members';
  EXECUTE 'DROP POLICY IF EXISTS employee_family_members_self_read ON public.employee_family_members';
  EXECUTE 'DROP POLICY IF EXISTS employee_family_tenant_guard ON public.employee_family_members';

  -- A restrictive guard also constrains any other permissive policies that
  -- may be added later. It allows the linked employee's own row, or an active
  -- member with the existing employee view/manage permission in that row's
  -- tenant.
  EXECUTE $policy$
    CREATE POLICY employee_family_tenant_guard
      ON public.employee_family_members AS RESTRICTIVE
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.employees AS e
          WHERE e.id = employee_family_members.employee_id
            AND (
              e.id = public.hris_own_employee_for_tenant(e.tenant_id)
              OR public.hris_admin_can_read_tenant(e.tenant_id, 'employees.view')
              OR public.hris_admin_can_read_tenant(e.tenant_id, 'employees.manage')
            )
        )
      )
  $policy$;

  EXECUTE $policy$
    CREATE POLICY employee_family_admin_read
      ON public.employee_family_members AS PERMISSIVE
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.employees AS e
          WHERE e.id = employee_family_members.employee_id
            AND (
              public.hris_admin_can_read_tenant(e.tenant_id, 'employees.view')
              OR public.hris_admin_can_read_tenant(e.tenant_id, 'employees.manage')
            )
        )
      )
  $policy$;

  EXECUTE $policy$
    CREATE POLICY employee_family_members_self_read
      ON public.employee_family_members AS PERMISSIVE
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.employees AS e
          WHERE e.id = employee_family_members.employee_id
            AND e.id = public.hris_own_employee_for_tenant(e.tenant_id)
        )
      )
  $policy$;
END
$migration$;

COMMIT;
