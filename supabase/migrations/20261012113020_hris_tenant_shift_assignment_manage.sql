-- Manager options are returned through a checked RPC because raw table reads
-- do not express the attendance manager's membership-scoped access model.
CREATE OR REPLACE FUNCTION public.hris_get_tenant_shift_roster_options(
  p_tenant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'attendance.manage') THEN
    RAISE EXCEPTION 'Tenant attendance management permission required.' USING errcode='42501';
  END IF;

  RETURN jsonb_build_object(
    'employees', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'employee_number', e.employee_number,
        'full_name', e.full_name, 'department_name', d.name
      ) ORDER BY e.full_name)
      FROM public.employees e
      LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=p_tenant_id
      WHERE e.tenant_id=p_tenant_id
        AND e.employment_status NOT IN ('resigned','terminated')
    ), '[]'::jsonb),
    'shifts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'code', s.code,
        'start_time', s.start_time, 'end_time', s.end_time
      ) ORDER BY s.name)
      FROM public.shifts s
      WHERE s.tenant_id=p_tenant_id AND s.active IS TRUE
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_assign_tenant_employee_shift(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_shift_id uuid,
  p_assignment_date date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_assignment_id uuid;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'attendance.manage') THEN
    RAISE EXCEPTION 'Tenant attendance management permission required.' USING errcode='42501';
  END IF;
  IF p_assignment_date IS NULL THEN
    RAISE EXCEPTION 'Assignment date is required.' USING errcode='22000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id=p_employee_id AND e.tenant_id=p_tenant_id
      AND e.employment_status NOT IN ('resigned','terminated')
  ) THEN
    RAISE EXCEPTION 'Active employee not found in the authorized tenant.' USING errcode='P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id=p_shift_id AND s.tenant_id=p_tenant_id AND s.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active shift not found in the authorized tenant.' USING errcode='P0002';
  END IF;

  INSERT INTO public.employee_shift_assignments(
    tenant_id, employee_id, shift_id, assignment_date, status, created_by
  ) VALUES (
    p_tenant_id, p_employee_id, p_shift_id, p_assignment_date, 'scheduled', auth.uid()
  ) RETURNING id INTO v_assignment_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'shift.assignment.created', 'employee_shift_assignment', v_assignment_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',p_employee_id,
      'shift_id',p_shift_id,'assignment_date',p_assignment_date));

  RETURN v_assignment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_shift_roster_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_shift_roster_options(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_assign_tenant_employee_shift(uuid,uuid,uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_assign_tenant_employee_shift(uuid,uuid,uuid,date) TO authenticated, service_role;
