-- Preserve the owner-scoped dashboard RPC and include the private object path only in the linked employee’s own leave history.
-- Authenticated Storage download policies remain the sole authority for reading the object.
CREATE OR REPLACE FUNCTION public.hris_get_my_dashboard_data(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_today date;
  v_year integer;
  v_gender text;
  v_weekly_off integer[] := '{}'::integer[];
  v_employee_profile jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;

  SELECT e.gender,coalesce(s.weekly_off_days,'{}'::integer[]),jsonb_build_object(
      'full_name',e.full_name,
      'employee_number',e.employee_number,
      'official_email',e.official_email,
      'designation_title',ds.title,
      'department_name',d.name
    )
    INTO v_gender,v_weekly_off,v_employee_profile
  FROM public.employees e
  LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.active IS TRUE
  LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=e.tenant_id
  LEFT JOIN public.designations ds ON ds.id=e.designation_id AND ds.tenant_id=e.tenant_id
  WHERE e.id=v_employee AND e.tenant_id=p_tenant_id;
  v_today := (now() AT TIME ZONE v_timezone)::date;
  v_year := extract(year FROM v_today)::integer;

  RETURN jsonb_build_object(
    'employee',v_employee_profile,
    'dashboard_date',v_today,
    'attendance',jsonb_build_object('records',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',a.id,'attendance_date',a.attendance_date,'check_in',a.check_in,
        'check_out',a.check_out,'work_mode',a.work_mode,'status',a.status,
        'work_hours',CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL
          AND a.check_out>=a.check_in
          THEN round((extract(epoch FROM (a.check_out-a.check_in))/3600)::numeric,2)
          ELSE NULL END
      ) ORDER BY a.attendance_date DESC)
      FROM public.attendance_records a
      WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee
        AND a.attendance_date BETWEEN v_today-6 AND v_today
    ),'[]'::jsonb),'corrections',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'attendance_date',c.attendance_date,
        'requested_check_in',c.requested_check_in,
        'requested_check_out',c.requested_check_out,
        'requested_work_mode',c.requested_work_mode,
        'reason',c.reason,'status',c.status,'requested_at',c.requested_at,
        'resolved_at',c.resolved_at,'resolution_note',c.resolution_note
      ) ORDER BY c.requested_at DESC)
      FROM public.attendance_corrections c
      WHERE c.tenant_id=p_tenant_id AND c.employee_id=v_employee
    ),'[]'::jsonb)),
    'balances',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',coalesce(b.id,lt.id),'employee_id',v_employee,'leave_type_id',lt.id,
        'balance_year',v_year,'opening_days',coalesce(b.opening_days,0)::numeric,
        'allocated_days',coalesce(b.allocated_days,lt.annual_entitlement,0)::numeric,
        'used_days',coalesce(b.used_days,0)::numeric,
        'pending_days',coalesce(b.pending_days,0)::numeric,
        'adjusted_days',coalesce(b.adjusted_days,0)::numeric,
        'leave_type_name',lt.name,'leave_type_code',lt.code,
        'available_days',(coalesce(b.opening_days,0)
          +coalesce(b.allocated_days,lt.annual_entitlement,0)
          +coalesce(b.adjusted_days,0)-coalesce(b.used_days,0)
          -coalesce(b.pending_days,0))::numeric
      ) ORDER BY lt.name)
      FROM public.leave_types lt
      LEFT JOIN public.employee_leave_balances b
        ON b.tenant_id=p_tenant_id AND b.employee_id=v_employee
       AND b.leave_type_id=lt.id AND b.balance_year=v_year
      WHERE lt.tenant_id=p_tenant_id AND lt.active IS TRUE
        AND (lt.applicable_gender IS NULL
          OR upper(lt.applicable_gender)=upper(coalesce(v_gender,'')))
    ),'[]'::jsonb),
    'requests',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',r.id,'leave_type_id',r.leave_type_id,'leave_type_name',lt.name,
        'from_date',r.from_date,'to_date',r.to_date,'requested_days',r.requested_days,
        'day_portion',r.day_portion,'reason',r.reason,'status',r.status,'submitted_at',r.submitted_at,
        'resolved_at',r.resolved_at,'resolution_note',r.resolution_note,'attachment_url',r.attachment_url
      ) ORDER BY r.submitted_at DESC)
      FROM public.leave_requests r
      JOIN public.leave_types lt
        ON lt.id=r.leave_type_id AND lt.tenant_id=p_tenant_id
      WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee
    ),'[]'::jsonb),
    'leave_types',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',lt.id,'name',lt.name,'code',lt.code,
        'annual_entitlement',lt.annual_entitlement,
        'min_days_notice',lt.min_days_notice,
        'requires_document_proof',lt.requires_document_proof
      ) ORDER BY lt.name)
      FROM public.leave_types lt
      WHERE lt.tenant_id=p_tenant_id AND lt.active IS TRUE
        AND (lt.applicable_gender IS NULL
          OR upper(lt.applicable_gender)=upper(coalesce(v_gender,'')))
    ),'[]'::jsonb),
    'holidays',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',h.id,'name',h.name,'start_date',h.start_date,'end_date',h.end_date
      ) ORDER BY h.start_date)
      FROM public.holidays h
      WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE AND h.end_date>=v_today
    ),'[]'::jsonb),
    'weekly_off_days',to_jsonb(v_weekly_off),
    'balance_year',v_year
  );
END;
$function$;
