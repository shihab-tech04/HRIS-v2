-- Scope employee document rows to the linked employee or an explicitly
-- authorized active tenant membership. Storage objects remain owner-readable
-- until their existing path contract can be tied to one tenant safely.
BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.employee_documents') IS NULL
      OR to_regclass('public.employees') IS NULL
      OR to_regclass('public.tenants') IS NULL
      OR to_regclass('public.tenant_memberships') IS NULL
      OR to_regclass('public.roles') IS NULL
      OR to_regclass('public.role_permissions') IS NULL THEN
    RAISE EXCEPTION 'Employee document access requires the existing employee and tenant authorization tables';
  END IF;
END
$migration$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS employee_documents_employee_id_idx
  ON public.employee_documents (employee_id);

-- Document metadata is read-only for client roles. In particular, remove the
-- production grants that let an authenticated API role truncate the table or
-- create triggers/references against it.
REVOKE ALL PRIVILEGES ON TABLE public.employee_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.employee_documents TO authenticated;

CREATE OR REPLACE FUNCTION private.hris_employee_document_own_read(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.tenants t ON t.id = e.tenant_id AND t.is_active IS TRUE
      WHERE e.id = p_employee_id
        AND e.user_id = auth.uid()
        AND e.employment_status NOT IN ('resigned', 'terminated')
    )
$function$;

CREATE OR REPLACE FUNCTION private.hris_employee_document_manager_read(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.tenants t
        ON t.id = e.tenant_id
       AND t.is_active IS TRUE
      JOIN public.tenant_memberships tm
        ON tm.tenant_id = e.tenant_id
       AND tm.user_id = auth.uid()
       AND lower(tm.status) = 'active'
      JOIN public.roles r
        ON r.id = tm.role
       AND r.active IS TRUE
      JOIN public.role_permissions rp
        ON rp.role_id = r.id
       AND rp.permission_id IN ('employees.view', 'employees.manage')
      WHERE e.id = p_employee_id
    )
$function$;

REVOKE ALL ON FUNCTION private.hris_employee_document_own_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.hris_employee_document_manager_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.hris_employee_document_own_read(uuid),
  private.hris_employee_document_manager_read(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS employee_documents_admin_read ON public.employee_documents;
DROP POLICY IF EXISTS employee_documents_own_read ON public.employee_documents;
DROP POLICY IF EXISTS employee_documents_tenant_read_guard ON public.employee_documents;

CREATE POLICY employee_documents_tenant_read_guard
  ON public.employee_documents AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.hris_employee_document_own_read(employee_id)
    OR private.hris_employee_document_manager_read(employee_id)
  );

CREATE POLICY employee_documents_own_read
  ON public.employee_documents AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (private.hris_employee_document_own_read(employee_id));

CREATE POLICY employee_documents_admin_read
  ON public.employee_documents AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (private.hris_employee_document_manager_read(employee_id));

-- The current storage policy identifies an owner by the first path segment but
-- contains no tenant identifier. Do not let a global employee permission grant
-- access to every tenant's bucket objects. Owners keep access to their paths.
DROP POLICY IF EXISTS employee_documents_own_select ON storage.objects;
DROP POLICY IF EXISTS employee_documents_storage_owner_guard ON storage.objects;

CREATE POLICY employee_documents_storage_owner_guard
  ON storage.objects AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    bucket_id IS DISTINCT FROM 'employee-documents'
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY employee_documents_own_select
  ON storage.objects AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

COMMIT;
