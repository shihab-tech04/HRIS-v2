-- Restrict family-record reads to the linked employee or an active tenant
-- member whose configured role grants employee view/manage permission.
BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.employee_family_members') IS NULL THEN
    RAISE NOTICE 'employee_family_members is not present; skipping its read-policy repair';
    RETURN;
  END IF;

  IF to_regclass('public.employees') IS NULL
     OR to_regclass('public.tenants') IS NULL
     OR to_regclass('public.tenant_memberships') IS NULL
     OR to_regclass('public.roles') IS NULL
     OR to_regclass('public.role_permissions') IS NULL THEN
    RAISE EXCEPTION 'Family-record tenant authorization requires employees, tenants, tenant_memberships, roles, and role_permissions';
  END IF;

  EXECUTE 'ALTER TABLE public.employee_family_members ENABLE ROW LEVEL SECURITY';
  EXECUTE 'CREATE INDEX IF NOT EXISTS employee_family_members_employee_id_idx ON public.employee_family_members (employee_id)';
  -- Keep client access read-only and remove broad default privileges.
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.employee_family_members FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT SELECT ON TABLE public.employee_family_members TO authenticated';

  -- These SECURITY DEFINER lookups bypass employee-table RLS while returning
  -- only a boolean for the family row currently being evaluated.
  EXECUTE $own_function$
    CREATE OR REPLACE FUNCTION public.hris_employee_family_own_row(p_employee_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth'
    AS $body$
      SELECT public.is_live_session()
        AND EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.id = p_employee_id
            AND e.user_id = auth.uid()
            AND e.employment_status NOT IN ('resigned', 'terminated')
        )
    $body$
  $own_function$;

  EXECUTE $admin_function$
    CREATE OR REPLACE FUNCTION public.hris_employee_family_admin_can_read(p_employee_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth'
    AS $body$
      SELECT public.is_live_session()
        AND EXISTS (
          SELECT 1
          FROM public.employees e
          JOIN public.tenants t
            ON t.id = e.tenant_id
           AND t.is_active = true
          JOIN public.tenant_memberships tm
            ON tm.tenant_id = e.tenant_id
           AND tm.user_id = auth.uid()
           AND tm.status = 'active'
          JOIN public.roles r
            ON r.id = tm.role
           AND r.active = true
          JOIN public.role_permissions rp
            ON rp.role_id = r.id
           AND rp.permission_id IN ('employees.view', 'employees.manage')
          WHERE e.id = p_employee_id
        )
    $body$
  $admin_function$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.hris_employee_family_own_row(uuid) FROM PUBLIC, anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.hris_employee_family_admin_can_read(uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.hris_employee_family_own_row(uuid), public.hris_employee_family_admin_can_read(uuid) TO authenticated, service_role';

  EXECUTE 'DROP POLICY IF EXISTS employee_family_admin_read ON public.employee_family_members';
  EXECUTE 'DROP POLICY IF EXISTS employee_family_members_self_read ON public.employee_family_members';
  EXECUTE 'DROP POLICY IF EXISTS employee_family_tenant_guard ON public.employee_family_members';

  -- Restrict all permissive SELECT policies to either the row owner or an
  -- active tenant membership with the configured employee permission.
  EXECUTE $guard_policy$
    CREATE POLICY employee_family_tenant_guard
      ON public.employee_family_members AS RESTRICTIVE
      FOR SELECT TO authenticated
      USING (
        public.hris_employee_family_own_row(employee_id)
        OR public.hris_employee_family_admin_can_read(employee_id)
      )
  $guard_policy$;

  EXECUTE $admin_policy$
    CREATE POLICY employee_family_admin_read
      ON public.employee_family_members AS PERMISSIVE
      FOR SELECT TO authenticated
      USING (public.hris_employee_family_admin_can_read(employee_id))
  $admin_policy$;

  EXECUTE $self_policy$
    CREATE POLICY employee_family_members_self_read
      ON public.employee_family_members AS PERMISSIVE
      FOR SELECT TO authenticated
      USING (public.hris_employee_family_own_row(employee_id))
  $self_policy$;
END
$migration$;

COMMIT;
