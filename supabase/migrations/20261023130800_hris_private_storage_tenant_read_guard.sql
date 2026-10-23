-- WS02: close cross-tenant Storage object reads without changing private bucket paths.
-- Storage paths for these three buckets begin with the owning Auth user's UUID.
-- Staff may read employee evidence only when its business record belongs to
-- their authorized tenant; candidate documents resolve through the unique
-- active candidate profile. Existing upload/delete contracts stay unchanged.
BEGIN;

DO $validate$
BEGIN
  IF to_regclass('storage.objects') IS NULL
     OR to_regclass('public.employees') IS NULL
     OR to_regclass('public.employee_documents') IS NULL
     OR to_regclass('public.attendance_corrections') IS NULL
     OR to_regclass('public.candidate_profiles') IS NULL
     OR to_regclass('public.tenants') IS NULL
     OR to_regprocedure('public.is_live_session()') IS NULL
     OR to_regprocedure('public.has_tenant_permission(uuid,text)') IS NULL
     OR to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'Approved Auth/tenant/Storage ownership dependencies are missing'
      USING ERRCODE='42883';
  END IF;
END
$validate$;

-- This private, boolean-only resolver is necessary because ordinary
-- authenticated RLS allows candidates to read only their *own* profile,
-- while same-tenant recruitment reviewers must establish the target
-- candidate's tenant without granting them profile-table SELECT.
CREATE OR REPLACE FUNCTION private.hris_storage_owner_tenant_read(
  p_bucket_id text, p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
  SELECT COALESCE(
    public.is_live_session()
    AND auth.uid() IS NOT NULL
    AND p_object_name IS NOT NULL
    AND split_part(p_object_name,'/',2) <> ''
    AND CASE
      WHEN p_bucket_id='candidate-documents' THEN EXISTS (
        SELECT 1
        FROM public.candidate_profiles c
        JOIN public.tenants t ON t.id=c.tenant_id AND t.is_active IS TRUE
        WHERE c.user_id::text=split_part(p_object_name,'/',1)
          -- Tenant-scoped recruitment permission may include retained documents
          -- after candidate deactivation. Auth+owner/tenant predicates still apply.
          AND (
            c.user_id=auth.uid()
            OR public.has_tenant_permission(c.tenant_id,'recruitment.view')
            OR public.has_tenant_permission(c.tenant_id,'recruitment.manage')
          )
      )
      WHEN p_bucket_id='employee-documents' THEN EXISTS (
        SELECT 1 FROM public.employees e
        JOIN public.tenants t ON t.id=e.tenant_id AND t.is_active IS TRUE
        WHERE e.user_id::text=split_part(p_object_name,'/',1)
          -- Retained staff evidence remains available to authorized same-tenant
          -- reviewers; self-service owner access uses the active employee resolver.
          AND (
            e.id=public.hris_own_employee_for_tenant(e.tenant_id)
            OR (
              (
                public.has_tenant_permission(e.tenant_id,'employees.view')
                OR public.has_tenant_permission(e.tenant_id,'employees.manage')
              )
              AND EXISTS (
                SELECT 1 FROM public.employee_documents d
                WHERE d.employee_id=e.id AND d.file_url=p_object_name
              )
            )
          )
      )
      WHEN p_bucket_id='attendance-evidence' THEN EXISTS (
        SELECT 1 FROM public.employees e
        JOIN public.tenants t ON t.id=e.tenant_id AND t.is_active IS TRUE
        WHERE e.user_id::text=split_part(p_object_name,'/',1)
          -- Retained staff evidence remains available to authorized same-tenant
          -- reviewers; self-service owner access uses the active employee resolver.
          AND (
            e.id=public.hris_own_employee_for_tenant(e.tenant_id)
            OR (
              (
                public.has_tenant_permission(e.tenant_id,'attendance.view')
                OR public.has_tenant_permission(e.tenant_id,'attendance.manage')
              )
              AND EXISTS (
                SELECT 1 FROM public.attendance_corrections c
                WHERE c.tenant_id=e.tenant_id
                  AND c.employee_id=e.id
                  AND c.evidence_path=p_object_name
              )
            )
          )
      )
      ELSE FALSE
    END,
    FALSE
  );
$body$;

REVOKE ALL ON FUNCTION private.hris_storage_owner_tenant_read(text,text)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.hris_storage_owner_tenant_read(text,text)
  TO authenticated;

-- Retain the legacy policy names, so existing clients and checks still
-- recognize SELECT rights. The resolver replaces broad permission-only ORs.
DROP POLICY IF EXISTS candidate_documents_own_select ON storage.objects;
CREATE POLICY candidate_documents_own_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='candidate-documents'
    AND private.hris_storage_owner_tenant_read(bucket_id,name)
  );

DROP POLICY IF EXISTS employee_documents_own_select ON storage.objects;
CREATE POLICY employee_documents_own_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='employee-documents'
    AND private.hris_storage_owner_tenant_read(bucket_id,name)
  );

DROP POLICY IF EXISTS attendance_evidence_own_select ON storage.objects;
CREATE POLICY attendance_evidence_own_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='attendance-evidence'
    AND private.hris_storage_owner_tenant_read(bucket_id,name)
  );

-- Protect against any other permissive SELECT policies added in the
-- original clone or later releases. Preserve unrelated bucket policies.
DROP POLICY IF EXISTS hris_private_storage_tenant_read_guard ON storage.objects;
CREATE POLICY hris_private_storage_tenant_read_guard
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id NOT IN ('candidate-documents','employee-documents','attendance-evidence')
    OR private.hris_storage_owner_tenant_read(bucket_id,name)
  );

-- The earlier employee-documents migration intentionally used an
-- owner-only RESTRICTIVE SELECT guard because no tenant-safe staff resolver
-- existed. It would intersect and block approved same-tenant reviewers.
-- Retire it ONLY after installing the stronger tenant-qualified restrictive
-- guard above, atomically in this same transaction.
DROP POLICY IF EXISTS employee_documents_storage_owner_guard ON storage.objects;

-- Fail closed if the stored object is not linked to a real owner/tenant.
-- A signed URL may be issued only after SELECT authorization; once issued
-- it is a bearer URL until expiry, so consumers must keep expiry short.
COMMIT;
