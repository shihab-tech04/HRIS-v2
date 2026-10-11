-- Additive guard for existing first-administrator self-enrolment.
-- AND-ed with the original RLS INSERT policy. No memberships are changed.
CREATE OR REPLACE FUNCTION public.hris_can_bootstrap_tenant_membership()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
 SELECT public.is_live_session() AND EXISTS (
   SELECT 1 FROM public.admin_users a
   WHERE a.user_id = auth.uid()
     AND a.active IS TRUE AND a.is_super_admin IS TRUE
 );
$$;
REVOKE ALL ON FUNCTION public.hris_can_bootstrap_tenant_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_can_bootstrap_tenant_membership() TO authenticated;
CREATE POLICY hris_first_admin_platform_guard
  ON public.tenant_memberships AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.hris_can_bootstrap_tenant_membership());
