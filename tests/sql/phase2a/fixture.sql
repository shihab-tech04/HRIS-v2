-- Synthetic database fixture. Runs ONLY in an ephemeral PostgreSQL CI service.
-- The Supabase JWT/session helper below is a TEST DOUBLE, not production auth.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY, email text UNIQUE, email_confirmed_at timestamptz,
 deleted_at timestamptz, banned_until timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
        || jsonb_build_object('email',current_setting('request.jwt.claim.email',true))
$$;
CREATE FUNCTION public.is_live_session()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL
 AND current_setting('request.test.session_active',true)='yes'
$$;
CREATE TABLE public.tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text UNIQUE NOT NULL, code text UNIQUE NOT NULL,
 name text NOT NULL,is_active boolean NOT NULL DEFAULT true,
 timezone text NOT NULL DEFAULT 'Asia/Dhaka',
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.admin_users (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 active boolean NOT NULL DEFAULT true,
 is_super_admin boolean NOT NULL DEFAULT false
);
CREATE TABLE public.roles (
 id text PRIMARY KEY,active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.role_permissions (
 role_id text NOT NULL REFERENCES public.roles(id),permission_id text NOT NULL,
 PRIMARY KEY(role_id,permission_id)
);
INSERT INTO public.roles(id,active) VALUES('hr_admin',true);
INSERT INTO public.role_permissions(role_id,permission_id)
VALUES('hr_admin','organization.manage');
CREATE TABLE public.tenant_memberships (
 tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('hr_admin','hr_recruiter')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE public.admin_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid REFERENCES auth.users(id),action text NOT NULL,
 target_type text NOT NULL,target_id text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION private.tenant_has_members(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.tenant_memberships
 WHERE tenant_id=p_tenant_id AND status='active')
$$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','platform@synesisit.info',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','first-admin@hris.test',now()),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','staff@synesisit.info',now()),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','recruiter@hris.test',now());
INSERT INTO public.admin_users(user_id,active,is_super_admin) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,true),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,false);
INSERT INTO public.tenants(code,slug,name) VALUES ('SY','synesis-it','Synthetic Synesis');
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT SELECT ON public.tenants TO authenticated;
GRANT INSERT ON public.tenant_memberships TO authenticated;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_bootstrap_first_admin
 ON public.tenant_memberships FOR INSERT TO authenticated
 WITH CHECK (
 auth.uid()=user_id
 AND lower(coalesce(auth.jwt()->>'email','')) LIKE '%@synesisit.info'
 AND role='hr_admin' AND status='active'
 AND NOT private.tenant_has_members(tenant_id)
);
