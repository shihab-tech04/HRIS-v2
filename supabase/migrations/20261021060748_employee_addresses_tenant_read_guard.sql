-- Scope employee address reads to the employee's active tenant. The legacy
-- administrator policy checks only a permission name and can expose every
-- tenant's private address rows to a globally privileged account.
BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.employee_addresses') IS NULL THEN
    RAISE NOTICE 'employee_addresses is not present; skipping its read-policy repair';
    RETURN;
  END IF;

  IF to_regclass('public.employees') IS NULL
     OR to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NULL
     OR to_regprocedure('public.hris_admin_can_read_tenant(uuid,text)') IS NULL
     OR to_regprocedure('public.is_live_session()') IS NULL THEN
    RAISE EXCEPTION 'Address read isolation requires employees and the existing tenant authorization helpers';
  END IF;

  EXECUTE 'ALTER TABLE public.employee_addresses ENABLE ROW LEVEL SECURITY';
  EXECUTE 'CREATE INDEX IF NOT EXISTS employee_addresses_employee_id_idx ON public.employee_addresses (employee_id)';

  -- Replace the global permission policy with a tenant membership scoped
  -- permissive policy. The restrictive guard below also intersects any
  -- other permissive SELECT policy that may remain in the hosted schema.
  EXECUTE 'DROP POLICY IF EXISTS employee_addresses_admin_read ON public.employee_addresses';
  EXECUTE 'DROP POLICY IF EXISTS employee_addresses_tenant_admin_read ON public.employee_addresses';
  EXECUTE $admin_policy$
    CREATE POLICY employee_addresses_tenant_admin_read
      ON public.employee_addresses AS PERMISSIVE
      FOR SELECT TO authenticated
      USING (
        public.is_live_session()
        AND EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.id = employee_addresses.employee_id
            AND (
              public.hris_admin_can_read_tenant(e.tenant_id, 'employees.view')
              OR public.hris_admin_can_read_tenant(e.tenant_id, 'employees.manage')
            )
        )
      )
  $admin_policy$;

  EXECUTE 'DROP POLICY IF EXISTS employee_addresses_tenant_guard ON public.employee_addresses';
  EXECUTE $guard_policy$
    CREATE POLICY employee_addresses_tenant_guard
      ON public.employee_addresses AS RESTRICTIVE
      FOR SELECT TO authenticated
      USING (
        public.is_live_session()
        AND EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.id = employee_addresses.employee_id
            AND (
              e.id = public.hris_own_employee_for_tenant(e.tenant_id)
              OR public.hris_admin_can_read_tenant(e.tenant_id, 'employees.view')
              OR public.hris_admin_can_read_tenant(e.tenant_id, 'employees.manage')
            )
        )
      )
  $guard_policy$;
END
$migration$;

COMMIT;
