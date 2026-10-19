-- Dedicated local Supabase fixture for Phase 2A. Auth users and sessions are
-- created by GoTrue in run-local.mjs; this file never writes auth.users.
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  is_super_admin boolean NOT NULL DEFAULT false
);

-- Reproduce the role-registry dependency of the future tenant permission
-- resolver; the production legacy membership allow-list alone is insufficient.
CREATE TABLE public.roles (
  id text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.role_permissions (
  role_id text NOT NULL REFERENCES public.roles(id),
  permission_id text NOT NULL,
  PRIMARY KEY (role_id,permission_id)
);
INSERT INTO public.roles(id,active) VALUES ('hr_admin',true);
INSERT INTO public.role_permissions(role_id,permission_id)
VALUES ('hr_admin','organization.manage');

CREATE TABLE public.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('hr_admin','hr_recruiter')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Minimal read-only shapes required by the real LiveApp shell during browser
-- acceptance. They contain only the synthetic tenant and no employee data.
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid REFERENCES auth.users(id),
  employment_status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  from_date date NOT NULL DEFAULT CURRENT_DATE, to_date date NOT NULL DEFAULT CURRENT_DATE,
  requested_days numeric NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL, annual_entitlement numeric, active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL, code text NOT NULL
);

CREATE SCHEMA private;
CREATE FUNCTION private.phase2a_tenant_has_members(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.status='active'
  );
$function$;
REVOKE ALL ON FUNCTION private.phase2a_tenant_has_members(uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.phase2a_tenant_has_members(uuid) TO authenticated,service_role;

CREATE FUNCTION public.is_live_session()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'pg_catalog','auth' AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id=NULLIF(auth.jwt()->>'session_id','')::uuid
      AND s.user_id=auth.uid()
      AND (s.not_after IS NULL OR s.not_after>now())
  );
$function$;
REVOKE ALL ON FUNCTION public.is_live_session() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_live_session() TO authenticated,service_role;

INSERT INTO public.tenants(code,slug,name) VALUES ('SY','synesis-it','Synthetic Synesis');

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenants,public.admin_users,public.tenant_memberships,public.admin_audit_logs
  FROM PUBLIC,anon,authenticated;
GRANT INSERT ON public.tenant_memberships TO authenticated;
GRANT SELECT ON public.tenants, public.admin_users, public.tenant_memberships,
  public.employees, public.leave_requests, public.leave_types, public.departments TO authenticated;
GRANT ALL ON public.tenants,public.admin_users,public.tenant_memberships,public.admin_audit_logs TO service_role;

CREATE POLICY phase2a_self_admin_status ON public.admin_users FOR SELECT TO authenticated
  USING (public.is_live_session() AND user_id=auth.uid());
CREATE POLICY phase2a_self_membership ON public.tenant_memberships FOR SELECT TO authenticated
  USING (public.is_live_session() AND user_id=auth.uid());
CREATE POLICY phase2a_superadmin_tenant_list ON public.tenants FOR SELECT TO authenticated
  USING (public.is_live_session() AND EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id=auth.uid()
      AND a.active IS TRUE AND a.is_super_admin IS TRUE
  ));

CREATE POLICY membership_bootstrap_first_admin
  ON public.tenant_memberships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid()=user_id
    AND lower(coalesce(auth.jwt()->>'email','')) LIKE '%@synesisit.info'
    AND role='hr_admin' AND status='active'
    AND NOT private.phase2a_tenant_has_members(tenant_id)
  );
