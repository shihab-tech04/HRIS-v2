-- Disposable PostgreSQL 17 ONLY. Synthetic identities, no hosted connections.
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS supabase_migrations CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA auth;
CREATE SCHEMA supabase_migrations;
DO $fixture_role$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $fixture_role$;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations VALUES('20261022142012');
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE public.tenants(id uuid PRIMARY KEY,slug text NOT NULL,is_active boolean NOT NULL);
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY,active boolean NOT NULL,is_super_admin boolean NOT NULL);
CREATE TABLE public.roles(id text PRIMARY KEY,active boolean NOT NULL,is_system boolean NOT NULL);
CREATE TABLE public.role_permissions(role_id text NOT NULL,permission_id text NOT NULL,PRIMARY KEY(role_id,permission_id));
CREATE TABLE public.tenant_memberships(tenant_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,status text NOT NULL,PRIMARY KEY(tenant_id,user_id));
CREATE TABLE public.admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid,action text NOT NULL,target_type text NOT NULL,target_id text,details jsonb NOT NULL DEFAULT '{}'::jsonb);
INSERT INTO public.tenants VALUES('f1111111-1111-4111-8111-111111111111','synesis-it',true);
INSERT INTO auth.users VALUES('f2222222-2222-4222-8222-222222222222',now(),NULL,NULL);
INSERT INTO public.admin_users VALUES('f2222222-2222-4222-8222-222222222222',true,true);
INSERT INTO public.roles VALUES('hr_admin',true,false);
INSERT INTO public.role_permissions VALUES('hr_admin','organization.manage');
CREATE FUNCTION public.hris_can_bootstrap_tenant_membership() RETURNS boolean LANGUAGE sql STABLE AS $guard$
  SELECT EXISTS(SELECT 1 FROM public.role_permissions rp CROSS JOIN auth.users u
    WHERE rp.role_id='hr_admin' AND rp.permission_id='organization.manage'
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now()));
$guard$;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY hris_first_admin_platform_guard ON public.tenant_memberships
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(public.hris_can_bootstrap_tenant_membership());
INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
VALUES(NULL,'PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED','tenant_memberships','f1111111-1111-4111-8111-111111111111',
 jsonb_build_object('user_id','f3333333-3333-4333-8333-333333333333','source','20261019_minimal_hr_admin_bootstrap','role','hr_admin','permission','organization.manage'));
INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
VALUES(NULL,'super_admin.rebound_to_new_auth','admin_user','f2222222-2222-4222-8222-222222222222',
 jsonb_build_object('reason','synthetic_auth_rebind','role_source','sole_verified_super_admin'));
