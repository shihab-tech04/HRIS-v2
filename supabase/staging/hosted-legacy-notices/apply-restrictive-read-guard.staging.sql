-- Emergency compatibility guard for the legacy single-tenant hosted schema.
-- NOT a substitute for the full membership-backed 20261017 announcement policy.
-- Rehearse on an isolated Auth/Postgres instance and capture the existing
-- policy catalog before a production application.
-- Adds exactly one SELECT policy. It does not rewrite data, grants, functions,
-- the existing notices_read policy, or tenant membership records.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF (SELECT count(*) FROM public.tenants WHERE is_active IS TRUE) <> 1
    OR (SELECT count(*) FROM public.tenants WHERE slug = 'synesis-it' AND is_active IS TRUE) <> 1
    OR (SELECT count(*) FROM public.tenant_memberships) <> 0 THEN
    RAISE EXCEPTION 'Legacy notice guard refused: tenant or membership topology changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.notices'::regclass
      AND polname = 'notices_read' AND polcmd = 'r' AND polpermissive IS TRUE
  ) OR EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.notices'::regclass
      AND polname IN ('hris_notices_legacy_security_guard', 'hris_notices_membership_guard')
  ) THEN
    RAISE EXCEPTION 'Legacy notice guard refused: existing policy shape changed';
  END IF;

  IF to_regprocedure('public.is_active_admin()') IS NULL
    OR to_regprocedure('public.has_permission(text)') IS NULL
    OR to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NULL
    OR to_regprocedure('public.synesis_tenant_id()') IS NULL THEN
    RAISE EXCEPTION 'Legacy notice guard refused: required installed function absent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notices n
    WHERE n.active IS TRUE AND n.tenant_id <> public.synesis_tenant_id()
  ) THEN
    RAISE EXCEPTION 'Legacy notice guard refused: other-tenant active notices detected';
  END IF;
END
$preflight$;

-- PostgreSQL combines restrictive SELECT policies with permissive ones as AND.
-- This closes the old `active = true` any-authenticated-user read while
-- preserving authorized legacy Synesis administrators and linked employees.
CREATE POLICY hris_notices_legacy_security_guard
  ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    tenant_id = public.synesis_tenant_id()
    AND (
      (
        public.is_active_admin()
        AND (
          public.has_permission('notices.view')
          OR public.has_permission('notices.manage')
        )
      )
      OR (
        active IS TRUE
        AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
        AND (
          audience_type = 'all'
          OR (
            audience_type = 'department'
            AND audience_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.employees e
              WHERE e.id = public.hris_own_employee_for_tenant(notices.tenant_id)
                AND e.tenant_id = notices.tenant_id
                AND e.department_id = notices.audience_id
            )
          )
        )
      )
    )
  );

COMMIT;
