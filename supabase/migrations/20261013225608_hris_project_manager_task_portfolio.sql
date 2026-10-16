-- Tenant-scoped task portfolio for employees who are the appointed Project
-- Manager on one or more projects. Review content and scores are excluded.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_my_project_task_portfolio(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_employee_id uuid;
  v_projects jsonb;
  v_counts jsonb;
BEGIN
  IF NOT public.is_live_session()
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants t
       WHERE t.id = p_tenant_id AND t.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'Active tenant session required.' USING errcode = '42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.tenant_id = p_tenant_id AND p.project_lead_id = v_employee_id
  ) THEN
    RAISE EXCEPTION 'Assigned Project Manager access required.' USING errcode = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(project_payload ORDER BY project_name, project_code), '[]'::jsonb)
  INTO v_projects
  FROM (
    SELECT p.name AS project_name, p.code AS project_code,
      jsonb_build_object(
        'project_id', p.id,
        'project_code', p.code,
        'project_name', p.name,
        'project_status', p.status,
        'tasks', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'task_id', t.id,
            'project_id', t.project_id,
            'title', t.title,
            'description', t.description,
            'due_date', t.due_date,
            'status', t.status,
            'completed_at', t.completed_at,
            'feedback_pending', (
              SELECT count(*)::integer
              FROM public.project_task_peer_reviews r
              WHERE r.tenant_id = t.tenant_id AND r.task_id = t.id AND r.status = 'pending'
            ),
            'members', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'employee_id', a.employee_id, 'employee_name', e.full_name
              ) ORDER BY e.full_name, a.assigned_at)
              FROM public.project_task_assignments a
              JOIN public.employees e ON e.tenant_id = a.tenant_id AND e.id = a.employee_id
              WHERE a.tenant_id = t.tenant_id AND a.project_id = t.project_id AND a.task_id = t.id
            ), '[]'::jsonb)
          ) ORDER BY t.due_date NULLS LAST, t.created_at DESC)
          FROM public.project_tasks t
          WHERE t.tenant_id = p.tenant_id AND t.project_id = p.id
        ), '[]'::jsonb)
      ) AS project_payload
    FROM public.projects p
    WHERE p.tenant_id = p_tenant_id AND p.project_lead_id = v_employee_id
  ) projects;

  SELECT jsonb_build_object(
    'tasks', count(*)::integer,
    'open', count(*) FILTER (WHERE t.status = 'open')::integer,
    'in_progress', count(*) FILTER (WHERE t.status = 'in_progress')::integer,
    'completed', count(*) FILTER (WHERE t.status = 'completed')::integer,
    'feedback_pending', COALESCE(sum((
      SELECT count(*)::integer FROM public.project_task_peer_reviews r
      WHERE r.tenant_id = t.tenant_id AND r.task_id = t.id AND r.status = 'pending'
    )), 0)::integer
  )
  INTO v_counts
  FROM public.project_tasks t
  JOIN public.projects p ON p.tenant_id = t.tenant_id AND p.id = t.project_id
  WHERE t.tenant_id = p_tenant_id AND p.project_lead_id = v_employee_id;

  RETURN jsonb_build_object('projects', v_projects, 'counts', v_counts);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_project_task_portfolio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_project_task_portfolio(uuid) TO authenticated, service_role;

COMMIT;
