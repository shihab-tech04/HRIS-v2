-- Synthetic-only family fixture for a disposable PostgreSQL database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.tenants (id uuid PRIMARY KEY, slug text UNIQUE NOT NULL);
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
  SELECT auth.uid() IS NOT NULL AND current_setting('request.test.session_active', true) = 'yes'
$$;
CREATE FUNCTION public.employee_for_auth_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id FROM public.employees AS e
  WHERE e.user_id = auth.uid() AND e.employment_status NOT IN ('resigned', 'terminated')
  LIMIT 1
$$;
CREATE FUNCTION public.has_permission(p_permission_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_permission_id IN ('employees.view', 'employees.manage')
    AND current_setting('request.test.can_view_employees', true) = 'yes'
$$;
CREATE POLICY employee_family_admin_read ON public.employee_family_members
  FOR SELECT TO authenticated
  USING (public.has_permission('employees.view') OR public.has_permission('employees.manage'));
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON public.tenants, public.employees, public.employee_family_members TO authenticated;

CREATE FUNCTION public.check_employee_family(passed boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT passed THEN RAISE EXCEPTION 'FAIL: %', description; END IF;
  RAISE NOTICE 'PASS: %', description;
END
$$;

INSERT INTO auth.users(id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'employee.one@example.org'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'employee.two@example.org');
INSERT INTO public.tenants(id, slug) VALUES
  ('11111111-1111-4111-8111-111111111111', 'tenant-one'),
  ('22222222-2222-4222-8222-222222222222', 'tenant-two');
INSERT INTO public.employees(id, tenant_id, user_id) VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.employee_family_members(id, employee_id, name, relationship, date_of_birth, is_nominee) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Synthetic Dependent One', 'Child', '2015-06-17', true),
  ('a2222222-2222-4222-8222-222222222222', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Synthetic Dependent Two', 'Parent', '1965-03-21', false);
