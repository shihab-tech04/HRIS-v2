DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$roles$;

CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL
);
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY leave_types_auth_tenant_read ON public.leave_types
  FOR SELECT TO authenticated
  USING (tenant_id = nullif(current_setting('request.jwt.claim.tenant_id', true), '')::uuid);
INSERT INTO public.leave_types(id, tenant_id, name) VALUES
  ('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Synthetic tenant A leave'),
  ('b2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','Synthetic tenant B leave');
GRANT ALL PRIVILEGES ON TABLE public.leave_types TO service_role;
