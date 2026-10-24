-- Phase 03 / SA01 controlled production transition.
-- Requires exactly one existing, active, eligible platform Super Admin,
-- exactly one active Synesis tenant, and zero existing tenant memberships.
-- It neither changes the other legacy admin nor activates tenant provisioning.
-- Run using Supabase's migration executor only after the paired synthetic checks.
BEGIN;

-- Serialize this narrow backfill with other attempted runs.
SELECT pg_catalog.pg_advisory_xact_lock(20261019, 3);

DO $preflight$
BEGIN
 IF (SELECT count(*) FROM public.tenants) <> 1
    OR (SELECT count(*) FROM public.tenants WHERE is_active IS TRUE AND slug='synesis-it') <> 1
    OR (SELECT count(*) FROM public.tenant_memberships) <> 0
    OR (SELECT count(*) FROM public.admin_users WHERE active IS TRUE AND is_super_admin IS TRUE) <> 1
    OR (SELECT count(*) FROM public.admin_users a
        JOIN auth.users u ON u.id=a.user_id
        WHERE a.active IS TRUE AND a.is_super_admin IS TRUE
          AND u.email_confirmed_at IS NOT NULL
          AND u.deleted_at IS NULL
          AND (u.banned_until IS NULL OR u.banned_until<=now())) <> 1
    OR (SELECT count(*) FROM public.permissions WHERE id='organization.manage') <> 1
    OR EXISTS (SELECT 1 FROM public.roles WHERE id='hr_admin')
    OR EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id='hr_admin')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies p
                   WHERE p.schemaname='public' AND p.tablename='tenant_memberships'
                     AND p.policyname='hris_first_admin_platform_guard'
                     AND p.permissive='RESTRICTIVE' AND p.cmd='INSERT'
                     AND p.with_check LIKE '%hris_can_bootstrap_tenant_membership%')
 THEN
  RAISE EXCEPTION 'Phase03 bootstrap topology or authorization preflight failed'
    USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- The minimum configurable tenant-admin role, not a copy of the global
-- hris_system_admin role or its 45 grants.
INSERT INTO public.roles(id,name,description,active,is_system)
VALUES('hr_admin','Tenant HR administrator',
       'Configurable, tenant-scoped organization administration',TRUE,FALSE);
INSERT INTO public.role_permissions(role_id,permission_id)
VALUES('hr_admin','organization.manage');

-- Exactly one membership. No email, account creation or other legacy-admin write.
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
SELECT t.id,a.user_id,'hr_admin','active'
FROM public.tenants t CROSS JOIN public.admin_users a
JOIN auth.users u ON u.id=a.user_id
WHERE t.slug='synesis-it' AND t.is_active IS TRUE
  AND a.active IS TRUE AND a.is_super_admin IS TRUE
  AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
  AND (u.banned_until IS NULL OR u.banned_until<=now());

-- Record the migration as the actor; do not impersonate a human admin.
INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
SELECT NULL,'PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED','tenant_memberships',t.id::text,
       pg_catalog.jsonb_build_object('role','hr_admin','permission','organization.manage',
         'user_id',a.user_id::text,'source','20261019_minimal_hr_admin_bootstrap')
FROM public.tenants t JOIN public.tenant_memberships m ON m.tenant_id=t.id
JOIN public.admin_users a ON a.user_id=m.user_id
WHERE t.slug='synesis-it' AND m.role='hr_admin' AND m.status='active'
  AND a.active IS TRUE AND a.is_super_admin IS TRUE;

-- Preserve the legacy restrictive INSERT policy, but require eligible Auth
-- identity and a registered, minimally permissioned hr_admin role.
CREATE OR REPLACE FUNCTION public.hris_can_bootstrap_tenant_membership()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $guard$
 SELECT public.is_live_session() AND EXISTS (
   SELECT 1 FROM public.admin_users a WHERE a.user_id=auth.uid()
     AND a.active IS TRUE AND a.is_super_admin IS TRUE
 ) AND EXISTS (
   SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND (u.banned_until IS NULL OR u.banned_until<=now())
 ) AND EXISTS (
   SELECT 1 FROM public.roles r
   JOIN public.role_permissions rp ON rp.role_id=r.id
     AND rp.permission_id='organization.manage'
   WHERE r.id='hr_admin' AND r.active IS TRUE
 );
$guard$;
REVOKE ALL ON FUNCTION public.hris_can_bootstrap_tenant_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_can_bootstrap_tenant_membership() TO authenticated;

-- Assertions execute in the same transaction; any mismatch undoes all writes.
DO $postflight$
BEGIN
 IF (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin') <> 1
    OR NOT EXISTS (SELECT 1 FROM public.roles r
                   JOIN public.role_permissions rp ON rp.role_id=r.id
                   WHERE r.id='hr_admin' AND r.active IS TRUE
                     AND r.is_system IS FALSE AND rp.permission_id='organization.manage')
    OR (SELECT count(*) FROM public.tenant_memberships) <> 1
    OR (SELECT count(*) FROM public.tenant_memberships m
        JOIN public.admin_users a ON a.user_id=m.user_id
        JOIN public.tenants t ON t.id=m.tenant_id
        WHERE t.slug='synesis-it' AND m.role='hr_admin' AND m.status='active'
          AND a.active IS TRUE AND a.is_super_admin IS TRUE) <> 1
    OR (SELECT count(*) FROM public.admin_audit_logs
        WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED') <> 1
 THEN
  RAISE EXCEPTION 'Phase03 bootstrap postflight failed; transaction rolled back'
    USING ERRCODE='55000';
 END IF;
END;
$postflight$;
COMMIT;
