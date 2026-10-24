-- Phase 10 project workspace and resource allocation release candidate.
-- Apply to the disposable local Supabase stack first. Do not apply to a hosted
-- project until the full Auth/RLS acceptance suite and release gates pass.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_id_id_key
  ON public.employees (tenant_id, id);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code varchar(32) NOT NULL,
  name varchar(128) NOT NULL,
  client_name varchar(128),
  description text,
  project_lead_id uuid NOT NULL,
  start_date date NOT NULL,
  target_end_date date,
  status varchar(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('planning', 'active', 'on_hold', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  CONSTRAINT projects_tenant_lead_fk
    FOREIGN KEY (tenant_id, project_lead_id)
    REFERENCES public.employees (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT projects_dates_valid
    CHECK (target_end_date IS NULL OR target_end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.project_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  role_on_project varchar(64) NOT NULL DEFAULT 'Member',
  allocation_percentage numeric(5,2) NOT NULL
    CHECK (allocation_percentage > 0 AND allocation_percentage <= 100),
  assigned_date date NOT NULL,
  release_date date,
  status varchar(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'upcoming')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_allocations_project_fk
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT project_allocations_employee_fk
    FOREIGN KEY (tenant_id, employee_id)
    REFERENCES public.employees (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT project_allocations_dates_valid
    CHECK (release_date IS NULL OR release_date >= assigned_date),
  UNIQUE (project_id, employee_id, assigned_date)
);

CREATE INDEX IF NOT EXISTS projects_tenant_status_start_idx
  ON public.projects (tenant_id, status, start_date);
CREATE INDEX IF NOT EXISTS project_allocations_tenant_employee_status_dates_idx
  ON public.project_allocations (tenant_id, employee_id, status, assigned_date, release_date);
CREATE INDEX IF NOT EXISTS project_allocations_tenant_project_status_idx
  ON public.project_allocations (tenant_id, project_id, status);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hris_can_access_project(
  p_tenant_id uuid, p_project_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL AND p_project_id IS NOT NULL AND auth.uid() IS NOT NULL
    AND (
      public.has_tenant_permission(p_tenant_id, 'organization.view')
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

REVOKE ALL ON FUNCTION public.hris_can_access_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_can_access_project(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS hris_projects_tenant_read ON public.projects;
CREATE POLICY hris_projects_tenant_read ON public.projects
  FOR SELECT TO authenticated USING (
    public.hris_can_access_project(tenant_id, id)
  );

DROP POLICY IF EXISTS hris_project_allocations_tenant_read ON public.project_allocations;
CREATE POLICY hris_project_allocations_tenant_read ON public.project_allocations
  FOR SELECT TO authenticated USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_can_access_project(tenant_id, project_id)
  );

REVOKE ALL ON TABLE public.projects, public.project_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.projects, public.project_allocations TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_project_workspace(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_projects jsonb;
  v_employees jsonb;
  v_today date;
BEGIN
  IF NOT (public.has_tenant_permission(p_tenant_id, 'organization.view')
      OR public.has_tenant_permission(p_tenant_id, 'organization.manage')) THEN
    RAISE EXCEPTION 'Tenant organization permission required.' USING errcode = '42501';
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
  ) project_row;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name
  ) ORDER BY e.full_name), '[]'::jsonb)
    INTO v_employees
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id
    AND lower(COALESCE(e.employment_status, 'active')) NOT IN ('resigned', 'terminated');

  RETURN jsonb_build_object('projects', v_projects, 'employees', v_employees);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_my_projects(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_projects jsonb;
  v_today date;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode = '42501';
  END IF;
  SELECT e.id INTO v_employee_id
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id AND e.user_id = auth.uid()
    AND lower(COALESCE(e.employment_status, 'active')) NOT IN ('resigned', 'terminated')
  LIMIT 1;
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Linked active employee record required.' USING errcode = '42501';
  END IF;
  SELECT (now() AT TIME ZONE COALESCE(t.timezone, 'UTC'))::date INTO v_today
  FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF v_today IS NULL THEN
    RAISE EXCEPTION 'Active organization required.' USING errcode = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'allocation_id', a.id, 'project_id', p.id, 'project_code', p.code,
    'project_name', p.name, 'client_name', p.client_name,
    'project_lead_name', lead.full_name, 'project_status', p.status,
    'role_on_project', a.role_on_project,
    'allocation_percentage', a.allocation_percentage,
    'assigned_date', a.assigned_date, 'release_date', a.release_date,
    'status', CASE WHEN a.status = 'upcoming' AND a.assigned_date <= v_today
      THEN 'active' ELSE a.status END
  ) ORDER BY a.assigned_date DESC, p.name), '[]'::jsonb)
    INTO v_projects
  FROM public.project_allocations a
  JOIN public.projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
  JOIN public.employees lead ON lead.id = p.project_lead_id AND lead.tenant_id = p.tenant_id
  WHERE a.tenant_id = p_tenant_id AND a.employee_id = v_employee_id;

  RETURN jsonb_build_object('projects', v_projects);
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
  IF NOT public.has_tenant_permission(p_tenant_id, 'organization.manage') THEN
    RAISE EXCEPTION 'Tenant organization management permission required.' USING errcode = '42501';
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
    RAISE EXCEPTION 'Project lead must be an active employee in this organization.' USING errcode = '22023';
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
    jsonb_build_object('tenant_id', p_tenant_id, 'code', v_project.code, 'name', v_project.name));
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
  IF NOT public.has_tenant_permission(p_tenant_id, 'organization.manage') THEN
    RAISE EXCEPTION 'Tenant organization management permission required.' USING errcode = '42501';
  END IF;
  SELECT (now() AT TIME ZONE COALESCE(t.timezone, 'UTC'))::date INTO v_today
  FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
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

  -- Lock the employee row so concurrent allocation requests serialize before
  -- checking the FTE cap. Direct table writes are revoked from authenticated.
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
  INTO v_peak_percentage
  FROM boundaries;
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
  IF NOT public.has_tenant_permission(p_tenant_id, 'organization.manage') THEN
    RAISE EXCEPTION 'Tenant organization management permission required.' USING errcode = '42501';
  END IF;
  SELECT (now() AT TIME ZONE COALESCE(t.timezone, 'UTC'))::date INTO v_today
  FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
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

  -- Releasing a project allocation never changes employment status.
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'project.allocation.released', 'project_allocations', v_allocation.id::text,
    jsonb_build_object('tenant_id', p_tenant_id, 'project_id', v_allocation.project_id,
      'employee_id', v_allocation.employee_id, 'release_date', v_release_date));
  RETURN to_jsonb(v_allocation);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_project_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_get_my_projects(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_create_tenant_project(uuid,text,text,text,text,uuid,date,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_assign_tenant_project_allocation(uuid,uuid,uuid,text,numeric,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_release_tenant_project_allocation(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_project_workspace(uuid),
  public.hris_get_my_projects(uuid),
  public.hris_create_tenant_project(uuid,text,text,text,text,uuid,date,date,text),
  public.hris_assign_tenant_project_allocation(uuid,uuid,uuid,text,numeric,date,date),
  public.hris_release_tenant_project_allocation(uuid,uuid)
TO authenticated, service_role;

COMMIT;
