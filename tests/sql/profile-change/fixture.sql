-- Synthetic-only fixture for employee profile correction requests.
-- Executed in a disposable PostgreSQL service; no real HRIS rows or Auth sessions.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
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
  employee_number text,
  full_name text,
  official_email text,
  personal_email text,
  official_phone text,
  address text,
  mailing_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  father_name text,
  mother_name text,
  birthplace text,
  blood_group text,
  religion text,
  nid_number text,
  passport_number text,
  etin_number text,
  bank_account_no text,
  employment_status text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.is_live_session() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL AND current_setting('request.test.session_active', true) = 'yes'
$$;
CREATE FUNCTION public.employee_for_auth_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id FROM public.employees e
  WHERE e.user_id = auth.uid() AND e.employment_status NOT IN ('resigned', 'terminated')
  LIMIT 1
$$;
CREATE FUNCTION public.synesis_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.tenants WHERE slug = 'synesis-it' LIMIT 1
$$;
CREATE FUNCTION public.has_permission(p_permission_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_permission_id = 'self_service.manage'
     AND current_setting('request.test.self_service_manage', true) = 'yes'
$$;
CREATE FUNCTION public.check_profile_change(passed boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT passed THEN RAISE EXCEPTION 'FAIL: %', description; END IF;
  RAISE NOTICE 'PASS: %', description;
END
$$;

INSERT INTO auth.users(id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'employee.one@example.org'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'employee.two@example.org'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hr.reviewer@example.org');
INSERT INTO public.tenants(id, slug) VALUES
  ('11111111-1111-4111-8111-111111111111', 'synesis-it'),
  ('22222222-2222-4222-8222-222222222222', 'other-tenant');
INSERT INTO public.employees(id, tenant_id, user_id, employee_number, full_name, official_email, official_phone, bank_account_no) VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SYN-001', 'Synthetic Employee', 'employee.one@example.org', '+880200000001', 'synthetic-bank-value'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'OTH-002', 'Other Tenant Employee', 'employee.two@example.org', '+880200000002', 'other-bank-value');

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON public.tenants, public.employees TO authenticated;
