-- Synthetic approximation of the actual 2026-10-19 hosted tenant/admin shape.
-- Never run against a real Supabase project.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY,email text UNIQUE,email_confirmed_at timestamptz,
 deleted_at timestamptz,banned_until timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE FUNCTION public.is_live_session() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT auth.uid() IS NOT NULL
$$;
CREATE TABLE public.tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL,slug text NOT NULL UNIQUE,
 name text NOT NULL,is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.admin_users (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),active boolean NOT NULL,
 is_super_admin boolean NOT NULL
);
CREATE TABLE public.permissions(id text PRIMARY KEY);
CREATE TABLE public.roles (
 id text PRIMARY KEY,name text NOT NULL,description text,
 active boolean NOT NULL DEFAULT true,is_system boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.role_permissions (
 role_id text REFERENCES public.roles(id),
 permission_id text REFERENCES public.permissions(id),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(role_id,permission_id)
);
CREATE TABLE public.tenant_memberships (
 tenant_id uuid REFERENCES public.tenants(id),user_id uuid REFERENCES auth.users(id),
 role text NOT NULL CHECK (role IN ('hr_admin','hr_recruiter')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE public.admin_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES auth.users(id),
 action text NOT NULL,target_type text NOT NULL,target_id text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','super@synesisit.info',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other@synesisit.info',now());
INSERT INTO public.admin_users(user_id,active,is_super_admin) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,false);
INSERT INTO public.tenants(code,slug,name) VALUES('SY','synesis-it','Synthetic Synesis');
INSERT INTO public.permissions(id) VALUES('organization.manage'),('employees.read');
INSERT INTO public.roles(id,name,is_system) VALUES('hris_system_admin','Global admin',true);
INSERT INTO public.role_permissions(role_id,permission_id) VALUES
 ('hris_system_admin','organization.manage'),('hris_system_admin','employees.read');
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.hris_can_bootstrap_tenant_membership()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth AS $$
 SELECT public.is_live_session() AND EXISTS (
   SELECT 1 FROM public.admin_users WHERE user_id=auth.uid()
      AND active AND is_super_admin
 );
$$;
CREATE POLICY membership_bootstrap_first_admin
 ON public.tenant_memberships FOR INSERT TO authenticated
 WITH CHECK (auth.uid()=user_id AND role='hr_admin' AND status='active');
CREATE POLICY hris_first_admin_platform_guard
 ON public.tenant_memberships AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (public.hris_can_bootstrap_tenant_membership());
GRANT EXECUTE ON FUNCTION public.hris_can_bootstrap_tenant_membership() TO authenticated;
