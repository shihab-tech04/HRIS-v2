-- Synthetic-only fixture for a disposable PostgreSQL database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.tenants (id uuid PRIMARY KEY, slug text UNIQUE NOT NULL);
CREATE TABLE public.org_locations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  code text NOT NULL,
  address text,
  timezone text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.grades (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  code text NOT NULL,
  min_salary numeric,
  max_salary numeric
);
CREATE TABLE public.departments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  location_id uuid REFERENCES public.org_locations(id),
  name text NOT NULL,
  code text NOT NULL
);
CREATE TABLE public.designations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  department_id uuid REFERENCES public.departments(id),
  grade_id uuid REFERENCES public.grades(id),
  title text NOT NULL,
  code text NOT NULL
);
CREATE TABLE public.employees (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid UNIQUE REFERENCES auth.users(id),
  employee_number text NOT NULL,
  full_name text NOT NULL,
  employment_status text NOT NULL,
  employment_type text,
  joining_date date,
  department_id uuid REFERENCES public.departments(id),
  designation_id uuid REFERENCES public.designations(id),
  grade_id uuid REFERENCES public.grades(id),
  reporting_manager_id uuid REFERENCES public.employees(id),
  work_location_id uuid REFERENCES public.org_locations(id),
  bank_account_no text
);

CREATE FUNCTION public.is_live_session() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL AND current_setting('request.test.session_active', true) = 'yes'
$$;
CREATE FUNCTION public.hris_own_employee_for_tenant(p_tenant_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id FROM public.employees AS e
  WHERE e.user_id = auth.uid()
    AND e.tenant_id = p_tenant_id
    AND e.employment_status NOT IN ('resigned', 'terminated')
    AND public.is_live_session()
  ORDER BY e.id
  LIMIT 1
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;

CREATE FUNCTION public.check_employment_info(passed boolean, description text)
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
INSERT INTO public.org_locations(id, tenant_id, name, code, address, timezone) VALUES
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Synthetic Dhaka HQ', 'DHK', 'synthetic location address', 'Asia/Dhaka'),
  ('c2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Other tenant office', 'OTH', 'other synthetic address', 'UTC');
INSERT INTO public.grades(id, tenant_id, name, code, min_salary, max_salary) VALUES
  ('d1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Synthetic Grade 7', 'G7', 70000, 90000),
  ('d2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Other Tenant Grade', 'OG', 1, 2);
INSERT INTO public.departments(id, tenant_id, location_id, name, code) VALUES
  ('e1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'Synthetic Analytics', 'ANL'),
  ('e2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 'Other Tenant Department', 'OTD');
INSERT INTO public.designations(id, tenant_id, department_id, grade_id, title, code) VALUES
  ('f1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'Senior Analyst', 'SA-01'),
  ('f2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', 'Other Tenant Role', 'OTR');
INSERT INTO public.employees(id, tenant_id, user_id, employee_number, full_name, employment_status, employment_type, joining_date, department_id, designation_id, grade_id, reporting_manager_id, work_location_id, bank_account_no) VALUES
  ('11111111-aaaa-4aaa-8aaa-111111111111', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SYN-001', 'Synthetic Employee One', 'active', 'Permanent', '2022-05-01', 'e1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', '22222222-aaaa-4aaa-8aaa-222222222222', 'c1111111-1111-4111-8111-111111111111', 'synthetic-bank-secret'),
  ('22222222-aaaa-4aaa-8aaa-222222222222', '11111111-1111-4111-8111-111111111111', NULL, 'SYN-MGR', 'Synthetic Manager', 'active', 'Permanent', '2019-03-01', 'e1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', NULL, 'c1111111-1111-4111-8111-111111111111', 'synthetic-manager-bank-secret'),
  ('33333333-aaaa-4aaa-8aaa-333333333333', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'OTH-001', 'Synthetic Employee Two', 'active', 'Contract', '2024-02-02', 'e2222222-2222-4222-8222-222222222222', 'f2222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', NULL, 'c2222222-2222-4222-8222-222222222222', 'other-synthetic-bank-secret');
