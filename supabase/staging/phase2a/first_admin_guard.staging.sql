-- Additive guard for existing first-administrator self-enrolment.
-- AND-ed with the original RLS INSERT policy. No memberships are changed.
CREATE OR REPLACE FUNCTION public.hris_can_bootstrap_tenant_membership()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
 SELECT public.is_live_session() AND EXISTS (
   SELECT 1 FROM public.admin_users a
   WHERE a.user_id = auth.uid()
     AND a.active IS TRUE AND a.is_super_admin IS TRUE
 ) AND EXISTS (
   SELECT 1 FROM auth.users u
   WHERE u.id = auth.uid()
     AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL
     AND (u.banned_until IS NULL OR u.banned_until <= now())
 ) AND EXISTS (
   SELECT 1 FROM public.roles r
   JOIN public.role_permissions rp ON rp.role_id=r.id
     AND rp.permission_id='organization.manage'
   WHERE r.id='hr_admin' AND r.active IS TRUE
 );
$$;
REVOKE ALL ON FUNCTION public.hris_can_bootstrap_tenant_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_can_bootstrap_tenant_membership() TO authenticated;
CREATE POLICY hris_first_admin_platform_guard
  ON public.tenant_memberships AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.hris_can_bootstrap_tenant_membership());
