-- Phase 10 business-rule correction: global Super Admin appoints project
-- managers; only the assigned manager can manage project membership.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_is_project_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT public.is_live_session() AND EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = auth.uid() AND a.active IS TRUE AND a.is_super_admin IS TRUE
  )
$function$;

REVOKE ALL ON FUNCTION public.hris_is_project_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_is_project_super_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hris_can_access_project(
  p_tenant_id uuid, p_project_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL AND p_project_id IS NOT NULL AND auth.uid() IS NOT NULL
    AND public.is_live_session()
    AND (
      public.hris_is_project_super_admin()
      OR public.has_tenant_permission(p_tenant_id, 'organization.view')
      OR public.has_tenant_permission(p_tenant_id, 'organization.manage')
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.tenant_id = p_tenant_id AND p.id = p_project_id
          AND p.project_lead_id = public.hris_own_employee_for_tenant(p_tenant_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.project_allocations a
        WHERE a.tenant_id = p_tenant_id AND a.project_id = p_project_id
          AND a.employee_id = public.hris_own_employee_for_tenant(p_tenant_id)
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_project_workspace(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_projects jsonb;
  v_employees jsonb := '[]'::jsonb;
  v_today date;
  v_employee_id uuid;
  v_is_super_admin boolean;
  v_can_view_all boolean;
  v_is_project_manager boolean;
BEGIN
  v_is_super_admin := public.hris_is_project_super_admin();
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  v_can_view_all := v_is_super_admin
    OR public.has_tenant_permission(p_tenant_id, 'organization.view')
    OR public.has_tenant_permission(p_tenant_id, 'organization.manage');
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.tenant_id = p_tenant_id AND p.project_lead_id = v_employee_id
  ) INTO v_is_project_manager;

  IF NOT (v_can_view_all OR v_is_project_manager OR EXISTS (
    SELECT 1 FROM public.project_allocations a
    WHERE a.tenant_id = p_tenant_id AND a.employee_id = v_employee_id
  )) THEN
    RAISE EXCEPTION 'Authorized project access required.' USING errcode = '42501';
  END IF;

  SELECT (now() AT TIME ZONE COALESCE(t.timezone, 'UTC'))::date INTO v_today
  FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF v_today IS NULL THEN
    RAISE EXCEPTION 'Active organization required.' USING errcode = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(project_row.value ORDER BY project_row.name), '[]'::jsonb)
    INTO v_projects
  FROM (
    SELECT p.name, jsonb_build_object(
      'id', p.id, 'tenant_id', p.tenant_id, 'code', p.code, 'name', p.name,
      'client_name', p.client_name, 'description', p.description,
      'project_lead_id', p.project_lead_id, 'project_lead_name', lead.full_name,
      'start_date', p.start_date, 'target_end_date', p.target_end_date,
      'status', p.status, 'created_at', p.created_at,
      'can_manage', (v_employee_id IS NOT NULL AND p.project_lead_id = v_employee_id),
      'allocations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'project_id', a.project_id, 'employee_id', a.employee_id,
          'employee_name', e.full_name, 'employee_number', e.employee_number,
          'role_on_project', a.role_on_project,
          'allocation_percentage', a.allocation_percentage,
          'assigned_date', a.assigned_date, 'release_date', a.release_date,
          'status', CASE WHEN a.status = 'upcoming' AND a.assigned_date <= v_today
            THEN 'active' ELSE a.status END
        ) ORDER BY e.full_name, a.assigned_date)
        FROM public.project_allocations a
        JOIN public.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
        WHERE a.tenant_id = p.tenant_id AND a.project_id = p.id
      ), '[]'::jsonb)
    ) AS value
    FROM public.projects p
    JOIN public.employees lead ON lead.id = p.project_lead_id AND lead.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant_id
      AND (v_can_view_all OR p.project_lead_id = v_employee_id OR EXISTS (
        SELECT 1 FROM public.project_allocations own_allocation
        WHERE own_allocation.tenant_id = p_tenant_id
          AND own_allocation.project_id = p.id
          AND own_allocation.employee_id = v_employee_id
      ))
  ) project_row;

  IF v_is_super_admin OR v_is_project_manager THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name
    ) ORDER BY e.full_name), '[]'::jsonb)
      INTO v_employees
    FROM public.employees e
    WHERE e.tenant_id = p_tenant_id
      AND lower(COALESCE(e.employment_status, 'active')) NOT IN ('resigned', 'terminated');
  END IF;

  RETURN jsonb_build_object(
    'projects', COALESCE(v_projects, '[]'::jsonb),
    'employees', COALESCE(v_employees, '[]'::jsonb),
    'can_create', v_is_super_admin
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_create_tenant_project(
  p_tenant_id uuid, p_code text, p_name text, p_client_name text,
  p_description text, p_project_lead_id uuid, p_start_date date,
  p_target_end_date date, p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF NOT public.hris_is_project_super_admin() THEN
    RAISE EXCEPTION 'Only an active Super Admin can create projects and appoint Project Managers.' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active organization required.' USING errcode = '42501';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) = 0 OR length(btrim(p_code)) > 32
      OR p_name IS NULL OR length(btrim(p_name)) = 0 OR length(btrim(p_name)) > 128
      OR p_project_lead_id IS NULL OR p_start_date IS NULL
      OR (p_target_end_date IS NOT NULL AND p_target_end_date < p_start_date)
      OR COALESCE(p_status, 'active') NOT IN ('planning', 'active', 'on_hold', 'completed') THEN
    RAISE EXCEPTION 'Project details are incomplete or invalid.' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.tenant_id = p_tenant_id AND e.id = p_project_lead_id
      AND lower(COALESCE(e.employment_status, 'active')) NOT IN ('resigned', 'terminated')
  ) THEN
    RAISE EXCEPTION 'Project Manager must be an active employee in this organization.' USING errcode = '22023';
  END IF;

  INSERT INTO public.projects (
    tenant_id, code, name, client_name, description, project_lead_id,
    start_date, target_end_date, status
  ) VALUES (
    p_tenant_id, btrim(p_code), btrim(p_name), nullif(btrim(p_client_name), ''),
    nullif(btrim(p_description), ''), p_project_lead_id, p_start_date,
    p_target_end_date, COALESCE(p_status, 'active')
  ) RETURNING * INTO v_project;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'project.created', 'projects', v_project.id::text,
    jsonb_build_object('tenant_id', p_tenant_id, 'code', v_project.code, 'name', v_project.name,
      'project_manager_employee_id', p_project_lead_id));
  RETURN to_jsonb(v_project);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_assign_tenant_project_allocation(
  p_tenant_id uuid, p_project_id uuid, p_employee_id uuid, p_role_on_project text,
  p_allocation_percentage numeric, p_assigned_date date, p_release_date date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_status text;
  v_peak_percentage numeric;
  v_today date;
  v_allocation public.project_allocations%ROWTYPE;
  v_end_date date := COALESCE(p_release_date, 'infinity'::date);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.tenant_id = p_tenant_id AND p.id = p_project_id
      AND p.project_lead_id = public.hris_own_employee_for_tenant(p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Only the assigned Project Manager can manage project membership.' USING errcode = '42501';
  END IF;
  SELECT (now() AT TIME ZONE COALESCE(t.timezone, 'UTC'))::date INTO v_today
  FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF v_today IS NULL THEN
    RAISE EXCEPTION 'Active organization required.' USING errcode = '42501';
  END IF;
  IF p_allocation_percentage IS NULL OR p_allocation_percentage <= 0 OR p_allocation_percentage > 100
      OR p_assigned_date IS NULL OR (p_release_date IS NOT NULL AND p_release_date < p_assigned_date)
      OR length(btrim(COALESCE(p_role_on_project, 'Member'))) = 0
      OR length(btrim(COALESCE(p_role_on_project, 'Member'))) > 64 THEN
    RAISE EXCEPTION 'Allocation details are incomplete or invalid.' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects p
      WHERE p.tenant_id = p_tenant_id AND p.id = p_project_id) THEN
    RAISE EXCEPTION 'Project does not belong to this organization.' USING errcode = '22023';
  END IF;

  -- Lock the employee row so concurrent allocations across projects serialize.
  SELECT lower(COALESCE(e.employment_status, 'active')) INTO v_employee_status
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id AND e.id = p_employee_id
  FOR UPDATE;
  IF NOT FOUND OR v_employee_status IN ('resigned', 'terminated') THEN
    RAISE EXCEPTION 'Employee must be active in this organization.' USING errcode = '22023';
  END IF;

  WITH boundaries(day) AS (
    SELECT p_assigned_date
    UNION
    SELECT a.assigned_date FROM public.project_allocations a
    WHERE a.tenant_id = p_tenant_id AND a.employee_id = p_employee_id
      AND a.status IN ('active', 'upcoming')
      AND a.assigned_date BETWEEN p_assigned_date AND v_end_date
    UNION
    SELECT a.release_date + 1 FROM public.project_allocations a
    WHERE a.tenant_id = p_tenant_id AND a.employee_id = p_employee_id
      AND a.status IN ('active', 'upcoming') AND a.release_date IS NOT NULL
      AND a.release_date + 1 BETWEEN p_assigned_date AND v_end_date
  )
  SELECT COALESCE(MAX((
    SELECT COALESCE(sum(a.allocation_percentage), 0)
    FROM public.project_allocations a
    WHERE a.tenant_id = p_tenant_id AND a.employee_id = p_employee_id
      AND a.status IN ('active', 'upcoming')
      AND a.assigned_date <= boundaries.day
      AND (a.release_date IS NULL OR a.release_date >= boundaries.day)
  )), 0)
  INTO v_peak_percentage FROM boundaries;
  IF v_peak_percentage + p_allocation_percentage > 100 THEN
    RAISE EXCEPTION 'Project allocations cannot exceed 100%% during an overlapping period.' USING errcode = '22023';
  END IF;

  INSERT INTO public.project_allocations (
    tenant_id, project_id, employee_id, role_on_project, allocation_percentage,
    assigned_date, release_date, status
  ) VALUES (
    p_tenant_id, p_project_id, p_employee_id,
    COALESCE(nullif(btrim(p_role_on_project), ''), 'Member'), p_allocation_percentage,
    p_assigned_date, p_release_date,
    CASE WHEN p_assigned_date > v_today THEN 'upcoming' ELSE 'active' END
  ) RETURNING * INTO v_allocation;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'project.allocation.assigned', 'project_allocations', v_allocation.id::text,
    jsonb_build_object('tenant_id', p_tenant_id, 'project_id', p_project_id,
      'employee_id', p_employee_id, 'allocation_percentage', p_allocation_percentage));
  RETURN to_jsonb(v_allocation);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_release_tenant_project_allocation(
  p_tenant_id uuid, p_allocation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_allocation public.project_allocations%ROWTYPE;
  v_today date;
  v_release_date date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_allocations a
    JOIN public.projects p ON p.tenant_id = a.tenant_id AND p.id = a.project_id
    WHERE a.tenant_id = p_tenant_id AND a.id = p_allocation_id
      AND p.project_lead_id = public.hris_own_employee_for_tenant(p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Only the assigned Project Manager can manage project membership.' USING errcode = '42501';
  END IF;
  SELECT (now() AT TIME ZONE COALESCE(t.timezone, 'UTC'))::date INTO v_today
  FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF v_today IS NULL THEN
    RAISE EXCEPTION 'Active organization required.' USING errcode = '42501';
  END IF;
  SELECT * INTO v_allocation FROM public.project_allocations a
  WHERE a.tenant_id = p_tenant_id AND a.id = p_allocation_id
    AND a.status IN ('active', 'upcoming') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active project allocation was not found in this organization.' USING errcode = '22023';
  END IF;
  v_release_date := GREATEST(v_allocation.assigned_date, v_today);
  UPDATE public.project_allocations SET status = 'released', release_date = v_release_date
  WHERE id = v_allocation.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_allocation;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'project.allocation.released', 'project_allocations', v_allocation.id::text,
    jsonb_build_object('tenant_id', p_tenant_id, 'project_id', v_allocation.project_id,
      'employee_id', v_allocation.employee_id, 'release_date', v_release_date));
  RETURN to_jsonb(v_allocation);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_project_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_create_tenant_project(uuid,text,text,text,text,uuid,date,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_assign_tenant_project_allocation(uuid,uuid,uuid,text,numeric,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_release_tenant_project_allocation(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_project_workspace(uuid),
  public.hris_create_tenant_project(uuid,text,text,text,text,uuid,date,date,text),
  public.hris_assign_tenant_project_allocation(uuid,uuid,uuid,text,numeric,date,date),
  public.hris_release_tenant_project_allocation(uuid,uuid)
TO authenticated, service_role;

COMMIT;
