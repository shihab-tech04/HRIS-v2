-- Employee self-service identity card. The linked employee helper already
-- excludes resigned and terminated employment records; this read-only RPC
-- uses the same linked employee identity as the existing employee
-- self-service dashboard. Employee Auth links do not require an admin
-- membership row; the tenant itself must still be active.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_my_employee_identity_card(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_card jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;

  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Current employee identity is unavailable.' USING errcode='42501';
  END IF;

  SELECT jsonb_build_object(
    'tenant_id',e.tenant_id,
    'full_name',e.full_name,
    'employee_number',e.employee_number,
    'designation_title',ds.title,
    'department_name',d.name,
    'employment_status',e.employment_status
  ) INTO v_card
  FROM public.employees e
  LEFT JOIN public.designations ds
    ON ds.id=e.designation_id AND ds.tenant_id=e.tenant_id
  LEFT JOIN public.departments d
    ON d.id=e.department_id AND d.tenant_id=e.tenant_id
  WHERE e.id=v_employee_id AND e.tenant_id=p_tenant_id;

  IF v_card IS NULL THEN
    RAISE EXCEPTION 'Current employee identity is unavailable.' USING errcode='42501';
  END IF;

  RETURN v_card;
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_employee_identity_card(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_employee_identity_card(uuid) TO authenticated;

COMMIT;
