-- Add a tenant-scoped team filter without changing the established directory RPC contract.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_employee_directory_v2(
  p_tenant_id uuid,
  p_search text DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_status text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_payload jsonb;
BEGIN
  IF NOT public.is_live_session()
    OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
    OR NOT (
      public.hris_admin_can_read_tenant(p_tenant_id, 'employees.view')
      OR public.hris_admin_can_read_tenant(p_tenant_id, 'employees.manage')
    ) THEN
    RAISE EXCEPTION 'Authorized employee-directory membership required.' USING errcode='42501';
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT e.id AS employee_id,
      e.employee_number,
      e.full_name,
      e.department_id,
      d.name AS department_name,
      des.title AS designation_title,
      tm.name AS team_name,
      e.employment_status
    FROM public.employees e
    LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=e.tenant_id
    LEFT JOIN public.designations des ON des.id=e.designation_id AND des.tenant_id=e.tenant_id
    LEFT JOIN public.teams tm ON tm.id=e.team_id AND tm.tenant_id=e.tenant_id
    WHERE e.tenant_id=p_tenant_id
      AND (p_department_id IS NULL OR e.department_id=p_department_id)
      AND (p_team_id IS NULL OR (tm.id=p_team_id AND tm.tenant_id=p_tenant_id))
      AND (v_status IS NULL OR e.employment_status=v_status)
      AND (v_search IS NULL OR concat_ws(' ',e.full_name,e.employee_number,d.name,des.title,tm.name,e.employment_status)
        ILIKE '%' || v_search || '%')
  ),
  page AS (
    SELECT s.* FROM scoped s
    ORDER BY s.full_name,s.employee_number,s.employee_id
    LIMIT v_limit OFFSET v_offset
  ),
  departments AS (
    SELECT d.id,d.name FROM public.departments d
    WHERE d.tenant_id=p_tenant_id
      AND EXISTS (SELECT 1 FROM public.employees e WHERE e.tenant_id=p_tenant_id AND e.department_id=d.id)
  ),
  teams AS (
    SELECT tm.id,tm.name,tm.department_id FROM public.teams tm
    WHERE tm.tenant_id=p_tenant_id
      AND EXISTS (SELECT 1 FROM public.employees e WHERE e.tenant_id=p_tenant_id AND e.team_id=tm.id)
  ),
  statuses AS (
    SELECT DISTINCT e.employment_status FROM public.employees e WHERE e.tenant_id=p_tenant_id
  )
  SELECT jsonb_build_object(
    'employees',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'employee_id',p.employee_id,
        'employee_number',p.employee_number,
        'full_name',p.full_name,
        'department_id',p.department_id,
        'department_name',p.department_name,
        'designation_title',p.designation_title,
        'team_name',p.team_name,
        'employment_status',p.employment_status
      ) ORDER BY p.full_name,p.employee_number,p.employee_id) FROM page p
    ),'[]'::jsonb),
    'departments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) ORDER BY d.name,d.id) FROM departments d),'[]'::jsonb),
    'teams',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',tm.id,'name',tm.name,'department_id',tm.department_id) ORDER BY tm.name,tm.id) FROM teams tm),'[]'::jsonb),
    'available_statuses',COALESCE((SELECT jsonb_agg(s.employment_status ORDER BY s.employment_status) FROM statuses s),'[]'::jsonb),
    'total_count',(SELECT count(*)::integer FROM scoped),
    'limit',v_limit,
    'offset',v_offset
  ) INTO v_payload;

  RETURN v_payload;
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_employee_directory_v2(uuid,text,uuid,uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_employee_directory_v2(uuid,text,uuid,uuid,text,integer,integer) TO authenticated,service_role;

COMMIT;
