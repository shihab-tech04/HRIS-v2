-- Synthetic-only fixture for tenant-scoped profile change requests.
-- The Auth helpers and role tables model only the contracts used by this test.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
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
CREATE TABLE public.roles (
  id uuid PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role uuid NOT NULL REFERENCES public.roles(id),
  status text NOT NULL DEFAULT 'active',
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id),
  permission_id text NOT NULL,
  PRIMARY KEY (role_id, permission_id)
);
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
CREATE FUNCTION public.hris_own_employee_for_tenant(p_tenant_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id
    AND e.user_id = auth.uid()
    AND e.employment_status NOT IN ('resigned', 'terminated')
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      JOIN public.tenant_memberships m ON m.tenant_id = t.id
      JOIN public.roles r ON r.id = m.role AND r.active IS TRUE
      WHERE t.id = p_tenant_id AND t.is_active IS TRUE
        AND m.user_id = auth.uid() AND lower(m.status) = 'active'
    )
  LIMIT 1
$$;
CREATE FUNCTION public.has_tenant_permission(p_tenant_id uuid, p_permission_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_live_session() AND EXISTS (
    SELECT 1 FROM public.tenants t
    JOIN public.tenant_memberships m ON m.tenant_id = t.id
    JOIN public.roles r ON r.id = m.role AND r.active IS TRUE
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE t.id = p_tenant_id AND t.is_active IS TRUE
      AND m.user_id = auth.uid() AND lower(m.status) = 'active'
      AND rp.permission_id = p_permission_id
  )
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
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hr.reviewer.one@example.org'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'hr.reviewer.two@example.org');
INSERT INTO public.tenants(id, slug) VALUES
  ('11111111-1111-4111-8111-111111111111', 'tenant-a'),
  ('22222222-2222-4222-8222-222222222222', 'tenant-b');
INSERT INTO public.roles(id) VALUES
  ('33333333-3333-4333-8333-333333333301'),
  ('33333333-3333-4333-8333-333333333302');
INSERT INTO public.role_permissions(role_id, permission_id) VALUES
  ('33333333-3333-4333-8333-333333333302', 'self_service.manage');
INSERT INTO public.tenant_memberships(tenant_id, user_id, role, status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333301', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333301', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333302', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '33333333-3333-4333-8333-333333333302', 'active');
INSERT INTO public.employees(id, tenant_id, user_id, employee_number, full_name, official_email, official_phone, bank_account_no) VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SYN-001', 'Synthetic Employee A', 'employee.one@example.org', '+880200000001', 'synthetic-bank-value'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'SYN-002', 'Synthetic Employee B', 'employee.two@example.org', '+880200000002', 'other-bank-value');

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON public.tenants, public.roles, public.tenant_memberships, public.role_permissions, public.employees TO authenticated;
