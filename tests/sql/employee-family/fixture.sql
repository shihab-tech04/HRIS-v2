-- Synthetic two-tenant schema for employee-family read authorization.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.roles (
  id text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.role_permissions (
  role_id text NOT NULL REFERENCES public.roles(id),
  permission_id text NOT NULL,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE public.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE public.employees (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid UNIQUE REFERENCES auth.users(id),
  employment_status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.employee_family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  name text NOT NULL,
  phone text,
  nid_number text,
  date_of_birth date,
  relationship text,
  present_address text,
  permanent_address text,
  is_nominee boolean NOT NULL DEFAULT false,
  working_in_synesis boolean NOT NULL DEFAULT false,
  occupation text,
  academic_qualification text,
  blood_group text,
  gender text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_family_members ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_live_session() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL
    AND current_setting('request.test.session_active', true) = 'yes'
$$;
-- Simulates the legacy global helper; the repaired family policies must not
-- use it without an active tenant membership.
CREATE FUNCTION public.has_permission(p_permission_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT p_permission_id IN ('employees.view', 'employees.manage')
    AND current_setting('request.test.global_permission', true) = 'yes'
$$;
CREATE POLICY employee_family_admin_read ON public.employee_family_members
  FOR SELECT TO authenticated
  USING (public.has_permission('employees.view') OR public.has_permission('employees.manage'));
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON public.employee_family_members TO authenticated;
-- Reproduce the hosted broad client ACL before the source migration revokes it.
GRANT ALL PRIVILEGES ON TABLE public.employee_family_members TO PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.employee_family_members TO service_role;

CREATE FUNCTION public.check_employee_family(passed boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT passed THEN RAISE EXCEPTION 'FAIL: %', description; END IF;
  RAISE NOTICE 'PASS: %', description;
END
$$;

INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff'),
  ('77777777-7777-4777-8777-777777777777');
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
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status) VALUES
  ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','tenant-one-hr','active'),
  ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','tenant-one-viewer','active'),
  ('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','tenant-two-hr','active'),
  ('11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff','tenant-one-inactive-hr','inactive');
INSERT INTO public.employees(id,tenant_id,user_id) VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('eeeeeeee-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.employee_family_members(id,employee_id,name,relationship,date_of_birth,is_nominee) VALUES
  ('a1111111-1111-4111-8111-111111111111','eeeeeeee-0000-4000-8000-000000000001','Synthetic Dependent One','Child','2015-06-17',true),
  ('a2222222-2222-4222-8222-222222222222','eeeeeeee-0000-4000-8000-000000000002','Synthetic Dependent Two','Parent','1965-03-21',false);
