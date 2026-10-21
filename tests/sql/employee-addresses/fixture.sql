-- Synthetic-only employee address fixture for a disposable PostgreSQL database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.roles (id text PRIMARY KEY, active boolean NOT NULL DEFAULT true);
CREATE TABLE public.role_permissions (
  role_id text NOT NULL REFERENCES public.roles(id),
  permission_id text NOT NULL,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE public.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL REFERENCES public.roles(id),
  status text NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE public.employees (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid UNIQUE REFERENCES auth.users(id),
  employment_status text NOT NULL DEFAULT 'active',
  bank_account_no text
);
CREATE TABLE public.employee_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  address_type text NOT NULL CHECK (address_type IN ('Present', 'Permanent', 'Other')),
  district text,
  thana text,
  post_code text,
  city_village text,
  road_block_house text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_addresses ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_live_session() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL AND current_setting('request.test.session_active', true) = 'yes'
$$;
CREATE FUNCTION public.employee_for_auth_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id FROM public.employees AS e
  WHERE e.user_id = auth.uid() AND e.employment_status NOT IN ('resigned', 'terminated')
  LIMIT 1
$$;
CREATE FUNCTION public.hris_own_employee_for_tenant(p_tenant_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id FROM public.employees e
  WHERE e.user_id = auth.uid()
    AND e.tenant_id = p_tenant_id
    AND e.employment_status NOT IN ('resigned', 'terminated')
    AND public.is_live_session()
  LIMIT 1
$$;
CREATE FUNCTION public.hris_admin_can_read_tenant(p_tenant_id uuid, p_permission_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_tenant_id IS NOT NULL
    AND p_permission_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      JOIN public.tenant_memberships m
        ON m.tenant_id = t.id
       AND m.user_id = auth.uid()
       AND lower(m.status) = 'active'
      JOIN public.roles r
        ON r.id = m.role
       AND r.active IS TRUE
      JOIN public.role_permissions rp
        ON rp.role_id = r.id
       AND rp.permission_id = p_permission_id
      WHERE t.id = p_tenant_id
        AND t.is_active IS TRUE
    )
$$;
REVOKE ALL ON FUNCTION public.hris_own_employee_for_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_admin_can_read_tenant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_own_employee_for_tenant(uuid), public.hris_admin_can_read_tenant(uuid, text) TO authenticated, service_role;
CREATE FUNCTION public.has_permission(p_permission_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_permission_id IN ('employees.view', 'employees.manage')
    AND current_setting('request.test.can_view_employees', true) = 'yes'
$$;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY hris_employees_own_read ON public.employees
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (id = public.hris_own_employee_for_tenant(tenant_id));
CREATE POLICY hris_employees_membership_read ON public.employees
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'employees.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'employees.manage')
  );
CREATE POLICY employees_legacy_global_read ON public.employees
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_permission('employees.view') OR public.has_permission('employees.manage'));
CREATE POLICY hris_employees_tenant_read_guard ON public.employees
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'employees.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'employees.manage')
  );
CREATE POLICY employee_addresses_admin_read ON public.employee_addresses
  FOR SELECT TO authenticated
  USING (public.has_permission('employees.view') OR public.has_permission('employees.manage'));
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON public.tenants, public.employees, public.employee_addresses TO authenticated;

CREATE FUNCTION public.check_employee_addresses(passed boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT passed THEN RAISE EXCEPTION 'FAIL: %', description; END IF;
  RAISE NOTICE 'PASS: %', description;
END
$$;

INSERT INTO auth.users(id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'employee.one@example.org'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'employee.two@example.org'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'tenant-one-hr@example.org'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'tenant-one-viewer@example.org'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'tenant-two-hr@example.org'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'inactive-tenant-hr@example.org'),
  ('77777777-7777-4777-8777-777777777777', 'global-only@example.org');
INSERT INTO public.tenants(id, slug, is_active) VALUES
  ('11111111-1111-4111-8111-111111111111', 'tenant-one', true),
  ('22222222-2222-4222-8222-222222222222', 'tenant-two', true);
INSERT INTO public.roles(id, active) VALUES
  ('tenant-one-hr', true),
  ('tenant-one-viewer', true),
  ('tenant-two-hr', true),
  ('tenant-one-inactive-hr', true);
INSERT INTO public.role_permissions(role_id, permission_id) VALUES
  ('tenant-one-hr', 'employees.manage'),
  ('tenant-one-viewer', 'employees.view'),
  ('tenant-two-hr', 'employees.manage'),
  ('tenant-one-inactive-hr', 'employees.manage');
INSERT INTO public.tenant_memberships(tenant_id, user_id, role, status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'tenant-one-hr', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'tenant-one-viewer', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'tenant-two-hr', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'tenant-one-inactive-hr', 'inactive');
INSERT INTO public.employees(id, tenant_id, user_id, bank_account_no) VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'synthetic-bank-value'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'other-bank-value');
INSERT INTO public.employee_addresses(id, employee_id, address_type, district, thana, post_code, city_village, road_block_house) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Present', 'Dhaka', 'Dhanmondi', '1209', 'Dhanmondi', 'Road 27'),
  ('a2222222-2222-4222-8222-222222222222', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Permanent', 'Cumilla', 'Burichang', '3520', 'Madhabpur', 'House 6');
