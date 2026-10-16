-- Security repair: close the unauthenticated/authenticated direct table grants
-- identified by the local Supabase advisor. Preserve the three read projections
-- used by LiveApp with row-level, tenant-aware SELECT policies.
BEGIN;

ALTER TABLE public.employee_shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.employee_shift_assignments,
  public.tenants,
  public.admin_users,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_roles,
  public.tenant_memberships,
  public.admin_audit_logs
FROM PUBLIC, anon, authenticated;

-- LiveApp loads only the signed-in user's own membership/admin flags.
GRANT SELECT ON TABLE public.tenant_memberships, public.admin_users TO authenticated;

DROP POLICY IF EXISTS hris_own_membership_read ON public.tenant_memberships;
CREATE POLICY hris_own_membership_read
  ON public.tenant_memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.is_live_session()));

DROP POLICY IF EXISTS hris_own_admin_flags_read ON public.admin_users;
CREATE POLICY hris_own_admin_flags_read
  ON public.admin_users FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.is_live_session()));

-- Members and linked employees can see their active organization. A verified
-- active Super Admin may list active organizations in the system workspace.
GRANT SELECT ON TABLE public.tenants TO authenticated;
DROP POLICY IF EXISTS hris_authorized_tenant_read ON public.tenants;
CREATE POLICY hris_authorized_tenant_read
  ON public.tenants FOR SELECT TO authenticated
  USING (
    is_active IS TRUE
    AND (SELECT public.is_live_session())
    AND (
      public.hris_is_active_tenant_member(id)
      OR public.hris_own_employee_for_tenant(id) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.admin_users a
        WHERE a.user_id = (SELECT auth.uid())
          AND a.active IS TRUE
          AND a.is_super_admin IS TRUE
      )
    )
  );

-- The remaining tables are accessed only through reviewed SECURITY DEFINER
-- functions owned by the migration role; no authenticated direct policy exists.
COMMIT;
