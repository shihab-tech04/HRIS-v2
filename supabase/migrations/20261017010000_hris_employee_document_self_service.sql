-- Employee self-service projection for the existing document vault.
-- It exposes only the signed-in employee's records in the requested active
-- tenant. Upload and replacement remain on the existing unimplemented path.
BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.employee_documents') IS NULL
      OR to_regclass('public.employees') IS NULL
      OR to_regclass('public.tenants') IS NULL
      OR to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NULL
      OR to_regprocedure('public.is_live_session()') IS NULL THEN
    RAISE EXCEPTION 'Employee document self-service requires the existing employee and session contracts';
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION private.hris_get_my_employee_documents(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_documents jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501';
  END IF;

  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'An active employee organization is required.' USING errcode = '42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'A linked employee record is required.' USING errcode = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'document_type', d.document_type,
    'uploaded_at', d.uploaded_at,
    'expires_at', d.expires_at,
    'verification_status', d.verification_status,
    'verification_note', CASE
      WHEN lower(COALESCE(d.verification_status, '')) = 'rejected' THEN d.verification_note
      ELSE NULL
    END,
    'file_url', d.file_url
  ) ORDER BY d.uploaded_at DESC, d.id DESC), '[]'::jsonb)
  INTO v_documents
  FROM public.employee_documents d
  WHERE d.employee_id = v_employee_id;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'employee_id', v_employee_id,
    'documents', v_documents
  );
END
$function$;

REVOKE ALL ON FUNCTION private.hris_get_my_employee_documents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.hris_get_my_employee_documents(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_my_employee_documents(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT private.hris_get_my_employee_documents(p_tenant_id)
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_employee_documents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_employee_documents(uuid) TO authenticated;

COMMIT;
