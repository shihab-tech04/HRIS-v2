-- Tenant-scoped authorization for HRIS data and approval workflows.
-- This migration is a release candidate. It must pass the isolated Auth/RLS
-- suite before any hosted migration is applied.
BEGIN;

CREATE OR REPLACE FUNCTION public.has_tenant_permission(
  p_tenant_id uuid,
  p_permission_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND p_permission_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      JOIN public.tenant_memberships m
        ON m.tenant_id = t.id
       AND m.user_id = auth.uid()
       AND lower(m.status) = 'active'
      JOIN public.roles r
        ON r.id = m.role
       AND r.active IS TRUE
      JOIN public.role_permissions rp
        ON rp.role_id = r.id
       AND rp.permission_id = p_permission_id
      WHERE t.id = p_tenant_id
        AND t.is_active IS TRUE
    )
$function$;

REVOKE ALL ON FUNCTION public.has_tenant_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_permission(uuid, text) TO authenticated, service_role;

-- Compatibility for legacy RPCs that do not accept a tenant argument: those
-- functions are pinned to Synesis and must use its membership role, not a
-- global admin_users/user_roles grant.
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT public.has_tenant_permission(public.synesis_tenant_id(), p_permission_id)
$function$;

REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hris_admin_can_read_tenant(
  p_tenant_id uuid, p_permission_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT public.has_tenant_permission(p_tenant_id, p_permission_id)
$function$;

REVOKE ALL ON FUNCTION public.hris_admin_can_read_tenant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_admin_can_read_tenant(uuid, text) TO authenticated, service_role;

-- Add membership-backed permissive policies as well as restrictive tenant
-- guards. RLS combines permissive policies with OR and restrictive with AND.
DROP POLICY IF EXISTS hris_employees_membership_read ON public.employees;
CREATE POLICY hris_employees_membership_read
  ON public.employees AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'employees.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'employees.manage')
  );

DROP POLICY IF EXISTS hris_departments_membership_read ON public.departments;
CREATE POLICY hris_departments_membership_read
  ON public.departments AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

DROP POLICY IF EXISTS hris_leave_requests_membership_read ON public.leave_requests;
CREATE POLICY hris_leave_requests_membership_read
  ON public.leave_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  );

DROP POLICY IF EXISTS hris_leave_types_membership_read ON public.leave_types;
CREATE POLICY hris_leave_types_membership_read
  ON public.leave_types AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  );

DROP POLICY IF EXISTS hris_attendance_records_membership_read ON public.attendance_records;
CREATE POLICY hris_attendance_records_membership_read
  ON public.attendance_records AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  );

DROP POLICY IF EXISTS hris_attendance_records_own_read ON public.attendance_records;
CREATE POLICY hris_attendance_records_own_read
  ON public.attendance_records AS PERMISSIVE FOR SELECT TO authenticated
  USING (employee_id=public.hris_own_employee_for_tenant(tenant_id));

DROP POLICY IF EXISTS hris_attendance_corrections_membership_read ON public.attendance_corrections;
CREATE POLICY hris_attendance_corrections_membership_read
  ON public.attendance_corrections AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  );

DROP POLICY IF EXISTS hris_attendance_corrections_own_read ON public.attendance_corrections;
CREATE POLICY hris_attendance_corrections_own_read
  ON public.attendance_corrections AS PERMISSIVE FOR SELECT TO authenticated
  USING (employee_id=public.hris_own_employee_for_tenant(tenant_id));

DROP POLICY IF EXISTS hris_employee_leave_balances_membership_read ON public.employee_leave_balances;
CREATE POLICY hris_employee_leave_balances_membership_read
  ON public.employee_leave_balances AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  );

DROP POLICY IF EXISTS hris_employee_leave_balances_own_read ON public.employee_leave_balances;
CREATE POLICY hris_employee_leave_balances_own_read
  ON public.employee_leave_balances AS PERMISSIVE FOR SELECT TO authenticated
  USING (employee_id=public.hris_own_employee_for_tenant(tenant_id));

-- These restrictive policies constrain the older permissive global-role
-- policies. Global user_roles/admin_users grants alone cannot reveal tenant rows.
DROP POLICY IF EXISTS hris_attendance_records_tenant_read_guard ON public.attendance_records;
CREATE POLICY hris_attendance_records_tenant_read_guard
  ON public.attendance_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  );

DROP POLICY IF EXISTS hris_attendance_corrections_tenant_read_guard ON public.attendance_corrections;
CREATE POLICY hris_attendance_corrections_tenant_read_guard
  ON public.attendance_corrections AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  );

DROP POLICY IF EXISTS hris_employee_leave_balances_tenant_read_guard ON public.employee_leave_balances;
CREATE POLICY hris_employee_leave_balances_tenant_read_guard
  ON public.employee_leave_balances AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  );

CREATE OR REPLACE FUNCTION public.hris_get_tenant_dashboard_summary(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_timezone text;
  v_today date;
  v_team_members bigint;
  v_attendance_today bigint;
  v_present_today bigint;
  v_absent_today bigint;
  v_wfo_today bigint;
  v_wfh_today bigint;
  v_client_meeting_today bigint;
  v_on_leave_today bigint;
  v_late_today bigint;
  v_attendance_last_30_days jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'dashboard.view') THEN
    RAISE EXCEPTION 'Tenant dashboard permission required.' USING errcode='42501';
  END IF;
  SELECT t.timezone INTO v_timezone FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active dashboard organization required.' USING errcode='42501';
  END IF;
  v_today := (now() AT TIME ZONE v_timezone)::date;
  SELECT count(*) INTO v_team_members FROM public.employees
    WHERE tenant_id=p_tenant_id AND employment_status NOT IN ('resigned','terminated');
  SELECT
    count(*),
    count(*) FILTER (WHERE lower(btrim(a.status))='present'),
    count(*) FILTER (WHERE lower(btrim(a.status))='absent'),
    count(*) FILTER (WHERE lower(btrim(a.work_mode))='office'),
    count(*) FILTER (WHERE lower(btrim(a.work_mode))='home'),
    count(*) FILTER (WHERE lower(btrim(a.work_mode))='client_meeting'),
    count(*) FILTER (WHERE lower(btrim(a.status))='late')
  INTO v_attendance_today, v_present_today, v_absent_today, v_wfo_today,
       v_wfh_today, v_client_meeting_today, v_late_today
  FROM public.attendance_records a
  JOIN public.employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id
  WHERE a.tenant_id=p_tenant_id AND a.attendance_date=v_today
    AND e.employment_status NOT IN ('resigned','terminated');
  SELECT count(DISTINCT employee_id) INTO v_on_leave_today
  FROM public.leave_requests r
  JOIN public.employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant_id AND lower(btrim(r.status))='approved'
    AND r.from_date<=v_today AND r.to_date>=v_today
    AND e.employment_status NOT IN ('resigned','terminated');
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('date',d.day,'records',coalesce(a.cnt,0)) ORDER BY d.day
  ),'[]'::jsonb) INTO v_attendance_last_30_days
  FROM generate_series(v_today-29,v_today,'1 day'::interval) d(day)
  LEFT JOIN (
    SELECT attendance_date,count(*) cnt FROM public.attendance_records
    WHERE tenant_id=p_tenant_id AND attendance_date BETWEEN v_today-29 AND v_today
    GROUP BY attendance_date
  ) a ON a.attendance_date=d.day::date;
  RETURN jsonb_build_object(
    'dashboard_date', v_today,
    'employees', v_team_members,
    'team_members', v_team_members,
    'attendance_today', v_attendance_today,
    'present_today', v_present_today,
    'absent_today', v_absent_today,
    'wfo_today', v_wfo_today,
    'wfh_today', v_wfh_today,
    'client_meeting_today', v_client_meeting_today,
    'on_leave_today', v_on_leave_today,
    'late_today', v_late_today,
    'attendance_corrections_pending', (SELECT count(*) FROM public.attendance_corrections
      WHERE tenant_id=p_tenant_id AND status='pending'),
    'leave_pending', (SELECT count(*) FROM public.leave_requests
      WHERE tenant_id=p_tenant_id AND status='pending'),
    'approvals_pending',
      (SELECT count(*) FROM public.attendance_corrections WHERE tenant_id=p_tenant_id AND status='pending')
      +(SELECT count(*) FROM public.leave_requests WHERE tenant_id=p_tenant_id AND status='pending'),
    'attendance_last_7_days', (
      SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb)
      FROM jsonb_array_elements(v_attendance_last_30_days) WITH ORDINALITY recent(value,ordinal)
      WHERE ordinal>23
    ),
    'attendance_last_30_days', v_attendance_last_30_days
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_attendance_data(
  p_tenant_id uuid, p_start date, p_end date, p_search text DEFAULT NULL,
  p_status text DEFAULT NULL, p_report boolean DEFAULT FALSE
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
BEGIN
  IF p_report THEN
    IF NOT public.has_tenant_permission(p_tenant_id, 'reports.view') THEN
      RAISE EXCEPTION 'Tenant attendance report permission required.' USING errcode='42501';
    END IF;
  ELSIF NOT (
    public.has_tenant_permission(p_tenant_id, 'attendance.view')
    OR public.has_tenant_permission(p_tenant_id, 'attendance.manage')
  ) THEN
    RAISE EXCEPTION 'Tenant attendance permission required.' USING errcode='42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end<p_start THEN
    RAISE EXCEPTION 'Valid date range required.' USING errcode='22000';
  END IF;

  IF p_report THEN
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'employee_id',x.employee_id,'employee_number',x.employee_number,
        'employee_name',x.employee_name,'department_name',x.department_name,
        'designation_title',x.designation_title,'attendance_days',x.attendance_days,
        'office_hours',x.office_hours,'working_hours',x.working_hours,
        'deviation',round((x.working_hours-x.office_hours)::numeric,2)
      ) ORDER BY x.employee_name)
      FROM (
        SELECT e.id employee_id,e.employee_number,e.full_name employee_name,
          d.name department_name,ds.title designation_title,count(a.id)::integer attendance_days,
          round(sum(CASE WHEN a.status IN ('weekend','holiday','on_leave') THEN 0
            ELSE coalesce(s.full_day_hours,8) END)::numeric,2) office_hours,
          round(sum(CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out>=a.check_in
            THEN extract(epoch FROM (a.check_out-a.check_in))/3600 ELSE 0 END)::numeric,2) working_hours
        FROM public.attendance_records a
        JOIN public.employees e ON e.id=a.employee_id AND e.tenant_id=p_tenant_id
        LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=p_tenant_id
        LEFT JOIN public.designations ds ON ds.id=e.designation_id AND ds.tenant_id=p_tenant_id
        LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.tenant_id=p_tenant_id
        WHERE a.tenant_id=p_tenant_id AND a.attendance_date BETWEEN p_start AND p_end
          AND (nullif(btrim(coalesce(p_search,'')),'') IS NULL
            OR e.full_name ILIKE '%'||btrim(p_search)||'%'
            OR e.employee_number ILIKE '%'||btrim(p_search)||'%')
        GROUP BY e.id,e.employee_number,e.full_name,d.name,ds.title,s.full_day_hours
      ) x
    ),'[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'records',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.attendance_date DESC,x.full_name)
      FROM (
        SELECT a.*,e.employee_number,e.full_name,d.name department_name,ds.title designation_title,
          CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out>=a.check_in
            THEN round((extract(epoch FROM (a.check_out-a.check_in))/3600)::numeric,2) ELSE NULL END work_hours
        FROM public.attendance_records a
        JOIN public.employees e ON e.id=a.employee_id AND e.tenant_id=p_tenant_id
        LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=p_tenant_id
        LEFT JOIN public.designations ds ON ds.id=e.designation_id AND ds.tenant_id=p_tenant_id
        WHERE a.tenant_id=p_tenant_id AND a.attendance_date BETWEEN p_start AND p_end
          AND (nullif(btrim(coalesce(p_search,'')),'') IS NULL
            OR e.full_name ILIKE '%'||btrim(p_search)||'%'
            OR e.employee_number ILIKE '%'||btrim(p_search)||'%')
          AND (nullif(btrim(coalesce(p_status,'')),'') IS NULL OR p_status='all' OR a.status=p_status)
      ) x
    ),'[]'::jsonb),
    'corrections',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC)
      FROM (
        SELECT c.*,e.employee_number,e.full_name
        FROM public.attendance_corrections c
        JOIN public.employees e ON e.id=c.employee_id AND e.tenant_id=p_tenant_id
        WHERE c.tenant_id=p_tenant_id AND c.attendance_date BETWEEN p_start AND p_end
      ) x
    ),'[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_leave_data(
  p_tenant_id uuid, p_start date DEFAULT NULL, p_end date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
BEGIN
  IF NOT (
    public.has_tenant_permission(p_tenant_id, 'leave.view')
    OR public.has_tenant_permission(p_tenant_id, 'leave.manage')
  ) THEN
    RAISE EXCEPTION 'Tenant leave permission required.' USING errcode='42501';
  END IF;
  RETURN jsonb_build_object(
    'leave_types',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name)
      FROM (SELECT * FROM public.leave_types WHERE tenant_id=p_tenant_id) x
    ),'[]'::jsonb),
    'holidays',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.start_date,x.name)
      FROM (SELECT * FROM public.holidays WHERE tenant_id=p_tenant_id
        AND (p_start IS NULL OR end_date>=p_start)
        AND (p_end IS NULL OR start_date<=p_end)) x
    ),'[]'::jsonb),
    'requests',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.submitted_at DESC)
      FROM (
        SELECT r.*,e.employee_number,e.full_name,lt.name leave_type_name,lt.code leave_type_code
        FROM public.leave_requests r
        JOIN public.employees e ON e.id=r.employee_id AND e.tenant_id=p_tenant_id
        JOIN public.leave_types lt ON lt.id=r.leave_type_id AND lt.tenant_id=p_tenant_id
        WHERE r.tenant_id=p_tenant_id
      ) x
    ),'[]'::jsonb)
  );
END;
$function$;

-- Ordinary linked employees use an own-record contract instead of the legacy
-- employee RPCs, which require a global admin row and are pinned to Synesis.
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

  SELECT e.gender,coalesce(s.weekly_off_days,'{}'::integer[])
    INTO v_gender,v_weekly_off
  FROM public.employees e
  LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.active IS TRUE
  WHERE e.id=v_employee AND e.tenant_id=p_tenant_id;
  v_today := (now() AT TIME ZONE v_timezone)::date;
  v_year := extract(year FROM v_today)::integer;

  RETURN jsonb_build_object(
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
        'resolved_at',r.resolved_at,'resolution_note',r.resolution_note
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

CREATE OR REPLACE FUNCTION public.hris_employee_submit_leave_request(
  p_tenant_id uuid, p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'storage' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_today date;
  v_type uuid := nullif(p_payload->>'leave_type_id','')::uuid;
  v_from date := nullif(p_payload->>'from_date','')::date;
  v_to date := nullif(p_payload->>'to_date','')::date;
  v_portion text := coalesce(nullif(p_payload->>'day_portion',''),'full');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_attachment text := nullif(btrim(coalesce(p_payload->>'attachment_url','')),'');
  v_days numeric := 0;
  v_year integer;
  v_year_from date;
  v_year_to date;
  v_year_days numeric;
  v_available numeric;
  v_gender text;
  v_weekly_off integer[] := '{}'::integer[];
  v_leave public.leave_types%rowtype;
  v_request_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  SELECT t.timezone INTO v_timezone FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  IF v_type IS NULL OR v_from IS NULL OR v_to IS NULL OR v_reason IS NULL THEN
    RAISE EXCEPTION 'Leave type, date range and reason are required.' USING errcode='22000';
  END IF;
  IF v_to < v_from OR v_portion NOT IN ('full','first_half','second_half')
     OR (v_portion <> 'full' AND v_from <> v_to) THEN
    RAISE EXCEPTION 'Valid leave dates and day portion are required.' USING errcode='22000';
  END IF;

  SELECT t.timezone,e.gender,coalesce(s.weekly_off_days,'{}'::integer[])
    INTO v_timezone,v_gender,v_weekly_off
  FROM public.tenants t
  JOIN public.employees e ON e.id=v_employee AND e.tenant_id=t.id
  LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.active IS TRUE
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  v_today := (now() AT TIME ZONE v_timezone)::date;

  SELECT * INTO v_leave FROM public.leave_types lt
  WHERE lt.id=v_type AND lt.tenant_id=p_tenant_id AND lt.active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leave type is not available.' USING errcode='23503'; END IF;
  IF v_leave.applicable_gender IS NOT NULL
     AND upper(v_leave.applicable_gender) <> upper(coalesce(v_gender,'')) THEN
    RAISE EXCEPTION 'This leave type is not available to this employee.' USING errcode='42501';
  END IF;
  IF v_leave.min_days_notice IS NOT NULL
     AND v_from < v_today + v_leave.min_days_notice THEN
    RAISE EXCEPTION 'This leave type requires % day(s) advance notice.',
      v_leave.min_days_notice USING errcode='22000';
  END IF;
  IF v_leave.requires_document_proof IS TRUE AND v_attachment IS NULL THEN
    RAISE EXCEPTION 'Supporting evidence is required for this leave type.' USING errcode='22000';
  END IF;
  IF v_attachment IS NOT NULL AND (
      split_part(v_attachment,'/',1) <> auth.uid()::text
      OR split_part(v_attachment,'/',2) <> p_tenant_id::text
      OR NOT EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id='leave-evidence' AND o.name=v_attachment
          AND o.owner_id=auth.uid()::text
      )
  ) THEN
    RAISE EXCEPTION 'Leave evidence path is not valid for this employee and organization.' USING errcode='42501';
  END IF;

  -- Serialize each employee's submissions so concurrent duplicate requests
  -- cannot pass the overlap and available-balance checks together.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_employee::text)::bigint);
  IF EXISTS (
    SELECT 1 FROM public.leave_requests r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee
      AND r.status IN ('pending','approved')
      AND daterange(r.from_date,r.to_date,'[]') && daterange(v_from,v_to,'[]')
      AND NOT (
        r.from_date=r.to_date AND v_from=v_to AND r.from_date=v_from
        AND r.day_portion IN ('first_half','second_half')
        AND v_portion IN ('first_half','second_half')
        AND r.day_portion<>v_portion
      )
  ) THEN
    RAISE EXCEPTION 'Overlapping leave request already exists.' USING errcode='23505';
  END IF;

  IF v_portion <> 'full' THEN
    IF extract(dow FROM v_from)::integer=ANY(v_weekly_off)
       OR EXISTS (SELECT 1 FROM public.holidays h
         WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
           AND v_from BETWEEN h.start_date AND h.end_date) THEN
      v_days := 0;
    ELSE
      v_days := 0.5;
    END IF;
  ELSE
    SELECT count(*)::numeric INTO v_days
    FROM generate_series(v_from,v_to,interval '1 day') g(d)
    WHERE NOT (extract(dow FROM g.d)::integer=ANY(v_weekly_off))
      AND NOT EXISTS (SELECT 1 FROM public.holidays h
        WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
          AND g.d::date BETWEEN h.start_date AND h.end_date);
  END IF;
  IF v_days<=0 THEN
    RAISE EXCEPTION 'The selected date range contains no chargeable leave day.' USING errcode='22000';
  END IF;

  FOR v_year IN SELECT generate_series(extract(year FROM v_from)::integer,extract(year FROM v_to)::integer)
  LOOP
    v_year_from := greatest(v_from,make_date(v_year,1,1));
    v_year_to := least(v_to,make_date(v_year,12,31));
    IF v_from=v_to AND v_portion<>'full' THEN
      IF extract(dow FROM v_year_from)::integer=ANY(v_weekly_off)
         OR EXISTS (SELECT 1 FROM public.holidays h
           WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
             AND v_year_from BETWEEN h.start_date AND h.end_date) THEN
        v_year_days := 0;
      ELSE
        v_year_days := 0.5;
      END IF;
    ELSE
      SELECT count(*)::numeric INTO v_year_days
      FROM generate_series(v_year_from,v_year_to,interval '1 day') g(d)
      WHERE NOT (extract(dow FROM g.d)::integer=ANY(v_weekly_off))
        AND NOT EXISTS (SELECT 1 FROM public.holidays h
          WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
            AND g.d::date BETWEEN h.start_date AND h.end_date);
    END IF;
    IF v_year_days<=0 THEN CONTINUE; END IF;

    INSERT INTO public.employee_leave_balances(
      tenant_id,employee_id,leave_type_id,balance_year,allocated_days
    ) VALUES (p_tenant_id,v_employee,v_type,v_year,coalesce(v_leave.annual_entitlement,0))
    ON CONFLICT DO NOTHING;
    SELECT opening_days+allocated_days+adjusted_days-used_days-pending_days
      INTO v_available
    FROM public.employee_leave_balances b
    WHERE b.tenant_id=p_tenant_id AND b.employee_id=v_employee
      AND b.leave_type_id=v_type AND b.balance_year=v_year
    FOR UPDATE;
    IF NOT FOUND OR coalesce(v_available,0)<v_year_days THEN
      RAISE EXCEPTION 'Insufficient leave balance for %. Available: %, requested: %.',
        v_year,coalesce(v_available,0),v_year_days USING errcode='22000';
    END IF;
  END LOOP;

  INSERT INTO public.leave_requests(
    tenant_id,employee_id,leave_type_id,from_date,to_date,requested_days,
    day_portion,reason,attachment_url,submitted_by
  ) VALUES (
    p_tenant_id,v_employee,v_type,v_from,v_to,v_days,v_portion,v_reason,
    v_attachment,auth.uid()
  ) RETURNING id INTO v_request_id;

  FOR v_year IN SELECT generate_series(extract(year FROM v_from)::integer,extract(year FROM v_to)::integer)
  LOOP
    v_year_from := greatest(v_from,make_date(v_year,1,1));
    v_year_to := least(v_to,make_date(v_year,12,31));
    IF v_from=v_to AND v_portion<>'full' THEN
      IF extract(dow FROM v_year_from)::integer=ANY(v_weekly_off)
         OR EXISTS (SELECT 1 FROM public.holidays h
           WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
             AND v_year_from BETWEEN h.start_date AND h.end_date) THEN
        v_year_days := 0;
      ELSE
        v_year_days := 0.5;
      END IF;
    ELSE
      SELECT count(*)::numeric INTO v_year_days
      FROM generate_series(v_year_from,v_year_to,interval '1 day') g(d)
      WHERE NOT (extract(dow FROM g.d)::integer=ANY(v_weekly_off))
        AND NOT EXISTS (SELECT 1 FROM public.holidays h
          WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
            AND g.d::date BETWEEN h.start_date AND h.end_date);
    END IF;
    IF v_year_days>0 THEN
      UPDATE public.employee_leave_balances b
      SET pending_days=b.pending_days+v_year_days,updated_at=now()
      WHERE b.tenant_id=p_tenant_id AND b.employee_id=v_employee
        AND b.leave_type_id=v_type AND b.balance_year=v_year;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave balance ledger missing for year %.',v_year USING errcode='P0002';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'leave.request.submitted','leave_request',v_request_id::text,
    jsonb_build_object('requested_days',v_days,'day_portion',v_portion,
      'from_date',v_from,'to_date',v_to,'tenant_id',p_tenant_id));
  RETURN v_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_has_active_employee_record()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT public.is_live_session() AND EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.tenants t ON t.id=e.tenant_id AND t.is_active IS TRUE
    WHERE e.user_id=(SELECT auth.uid())
      AND e.employment_status NOT IN ('resigned','terminated')
  )
$function$;

CREATE OR REPLACE FUNCTION public.hris_can_access_leave_evidence(
  p_owner_user_id text, p_tenant_path text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT public.is_live_session() AND EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.tenants t ON t.id=e.tenant_id AND t.is_active IS TRUE
    WHERE e.user_id::text=p_owner_user_id
      AND (
        (p_owner_user_id=(SELECT auth.uid())::text
          AND e.id=public.hris_own_employee_for_tenant(e.tenant_id)
          AND (p_tenant_path=e.tenant_id::text OR p_tenant_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
        OR (p_tenant_path=e.tenant_id::text
          AND (public.has_tenant_permission(e.tenant_id,'leave.view')
            OR public.has_tenant_permission(e.tenant_id,'leave.manage')))
        OR (p_tenant_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND e.tenant_id=public.synesis_tenant_id()
          AND (public.has_tenant_permission(e.tenant_id,'leave.view')
            OR public.has_tenant_permission(e.tenant_id,'leave.manage')))
      )
  )
$function$;

REVOKE ALL ON FUNCTION public.hris_employee_submit_leave_request(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_leave_request(uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_has_active_employee_record() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_has_active_employee_record() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_can_access_leave_evidence(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_can_access_leave_evidence(text,text) TO authenticated, service_role;

DROP POLICY IF EXISTS hris_leave_evidence_employee_upload ON storage.objects;
CREATE POLICY hris_leave_evidence_employee_upload
  ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='leave-evidence'
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND public.hris_has_active_employee_record()
  );
DROP POLICY IF EXISTS hris_leave_evidence_upload_tenant_guard ON storage.objects;
CREATE POLICY hris_leave_evidence_upload_tenant_guard
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id<>'leave-evidence'
    OR ((storage.foldername(name))[1]=(SELECT auth.uid())::text
      AND EXISTS (SELECT 1 FROM public.employees e
        WHERE e.user_id=(SELECT auth.uid())
          AND e.tenant_id::text=(storage.foldername(name))[2]
          AND e.id=public.hris_own_employee_for_tenant(e.tenant_id)))
  );
DROP POLICY IF EXISTS hris_leave_evidence_scoped_read ON storage.objects;
CREATE POLICY hris_leave_evidence_scoped_read
  ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id='leave-evidence'
    AND public.hris_can_access_leave_evidence(
      (storage.foldername(name))[1],(storage.foldername(name))[2])
  );
DROP POLICY IF EXISTS hris_leave_evidence_tenant_read_guard ON storage.objects;
CREATE POLICY hris_leave_evidence_tenant_read_guard
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id<>'leave-evidence'
    OR public.hris_can_access_leave_evidence(
      (storage.foldername(name))[1],(storage.foldername(name))[2])
  );
DROP POLICY IF EXISTS hris_leave_evidence_employee_delete ON storage.objects;
CREATE POLICY hris_leave_evidence_employee_delete
  ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id='leave-evidence'
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND public.hris_has_active_employee_record()
  );
DROP POLICY IF EXISTS hris_leave_evidence_delete_tenant_guard ON storage.objects;
CREATE POLICY hris_leave_evidence_delete_tenant_guard
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id<>'leave-evidence'
    OR ((storage.foldername(name))[1]=(SELECT auth.uid())::text
      AND EXISTS (SELECT 1 FROM public.employees e
        WHERE e.user_id=(SELECT auth.uid())
          AND e.tenant_id::text=(storage.foldername(name))[2]
          AND e.id=public.hris_own_employee_for_tenant(e.tenant_id)))
  );

REVOKE ALL ON FUNCTION public.hris_get_tenant_dashboard_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_get_tenant_attendance_data(uuid,date,date,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_get_tenant_leave_data(uuid,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_get_my_dashboard_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_dashboard_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_attendance_data(uuid,date,date,text,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_leave_data(uuid,date,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_dashboard_data(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_save_attendance(
  p_employee_id uuid, p_date date, p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_tenant uuid;
  v_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active attendance management permission required.' USING errcode='42501';
  END IF;
  SELECT e.tenant_id INTO v_tenant
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.employment_status NOT IN ('resigned', 'terminated');
  IF NOT FOUND OR NOT public.has_tenant_permission(v_tenant, 'attendance.manage') THEN
    RAISE EXCEPTION 'Employee not found in authorized organization.' USING errcode='P0002';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Attendance date is required.' USING errcode='22000';
  END IF;
  INSERT INTO public.attendance_records(
    tenant_id, employee_id, attendance_date, check_in, check_out,
    work_mode, client_name, status, source, remarks
  ) VALUES (
    v_tenant, p_employee_id, p_date,
    nullif(p_payload->>'check_in','')::timestamptz,
    nullif(p_payload->>'check_out','')::timestamptz,
    coalesce(nullif(p_payload->>'work_mode',''),'office'),
    nullif(btrim(coalesce(p_payload->>'client_name','')),''),
    coalesce(nullif(p_payload->>'status',''),'present'), 'admin',
    nullif(btrim(coalesce(p_payload->>'remarks','')),'')
  )
  ON CONFLICT (tenant_id, employee_id, attendance_date) DO UPDATE SET
    check_in=excluded.check_in, check_out=excluded.check_out,
    work_mode=excluded.work_mode, client_name=excluded.client_name,
    status=excluded.status, source='admin', remarks=excluded.remarks
  RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'attendance.record.saved','attendance_record',v_id::text,
    jsonb_build_object('employee_id',p_employee_id,'date',p_date));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_leave_request(
  p_id uuid, p_decision text, p_note text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_tenant uuid;
  r public.leave_requests%rowtype;
  v_off integer[] := '{}'::integer[];
  v_year integer;
  v_yfrom date;
  v_yto date;
  v_ydays numeric;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active leave management permission required.' USING errcode='42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode='22000';
  END IF;
  SELECT * INTO r FROM public.leave_requests
  WHERE id=p_id AND status='pending' FOR UPDATE;
  IF NOT FOUND OR NOT public.has_tenant_permission(r.tenant_id, 'leave.manage') THEN
    RAISE EXCEPTION 'Pending leave request not found in authorized organization.' USING errcode='P0002';
  END IF;
  v_tenant := r.tenant_id;

  SELECT COALESCE(s.weekly_off_days,'{}'::integer[]) INTO v_off
  FROM public.employees e
  LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.active=true
  WHERE e.id=r.employee_id AND e.tenant_id=v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave employee not found in authorized organization.' USING errcode='P0002';
  END IF;

  FOR v_year IN SELECT generate_series(
    extract(year FROM r.from_date)::integer, extract(year FROM r.to_date)::integer
  ) LOOP
    v_yfrom := greatest(r.from_date, make_date(v_year,1,1));
    v_yto := least(r.to_date, make_date(v_year,12,31));
    IF r.from_date=r.to_date AND r.day_portion IN('first_half','second_half') THEN
      IF extract(dow FROM v_yfrom)::integer=ANY(v_off) OR EXISTS(
        SELECT 1 FROM public.holidays h WHERE h.tenant_id=v_tenant AND h.active=true
          AND v_yfrom BETWEEN h.start_date AND h.end_date
      ) THEN v_ydays:=0; ELSE v_ydays:=0.5; END IF;
    ELSE
      SELECT count(*)::numeric INTO v_ydays FROM generate_series(
        v_yfrom,v_yto,interval '1 day'
      ) g(d) WHERE NOT(extract(dow FROM g.d)::integer=ANY(v_off))
      AND NOT EXISTS(
        SELECT 1 FROM public.holidays h WHERE h.tenant_id=v_tenant AND h.active=true
          AND g.d::date BETWEEN h.start_date AND h.end_date
      );
    END IF;
    IF v_ydays <= 0 THEN CONTINUE; END IF;
    UPDATE public.employee_leave_balances SET
      pending_days=greatest(0,pending_days-v_ydays),
      used_days=used_days+CASE WHEN p_decision='approved' THEN v_ydays ELSE 0 END,
      updated_at=now()
    WHERE employee_id=r.employee_id AND tenant_id=v_tenant
      AND leave_type_id=r.leave_type_id AND balance_year=v_year;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Leave balance ledger missing for year %.',v_year USING errcode='P0002';
    END IF;
  END LOOP;

  UPDATE public.leave_requests SET
    status=p_decision,resolved_by=auth.uid(),resolved_at=now(),
    resolution_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now()
  WHERE id=p_id AND tenant_id=v_tenant AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending leave request changed.' USING errcode='P0002'; END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'leave.request.'||p_decision,'leave_request',p_id::text,
    jsonb_build_object('note',p_note,'requested_days',r.requested_days,'day_portion',r.day_portion));
  RETURN jsonb_build_object('success',true,'decision',p_decision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_attendance_correction(
  p_id uuid, p_decision text, p_note text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_tenant uuid;
  v_request public.attendance_corrections%rowtype;
  v_current public.attendance_records%rowtype;
  v_record uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active attendance management permission required.' USING errcode='42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode='22000';
  END IF;
  SELECT * INTO v_request FROM public.attendance_corrections
  WHERE id=p_id AND status='pending' FOR UPDATE;
  IF NOT FOUND OR NOT public.has_tenant_permission(v_request.tenant_id, 'attendance.manage') THEN
    RAISE EXCEPTION 'Pending correction not found in authorized organization.' USING errcode='P0002';
  END IF;
  v_tenant := v_request.tenant_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id=v_request.employee_id AND tenant_id=v_tenant
  ) THEN
    RAISE EXCEPTION 'Employee not found in authorized organization.' USING errcode='P0002';
  END IF;

  IF p_decision='approved' THEN
    SELECT * INTO v_current FROM public.attendance_records
    WHERE tenant_id=v_tenant AND employee_id=v_request.employee_id
      AND attendance_date=v_request.attendance_date FOR UPDATE;
    v_record := public.admin_save_attendance(
      v_request.employee_id, v_request.attendance_date,
      jsonb_build_object(
        'check_in', COALESCE(v_request.requested_check_in,v_current.check_in),
        'check_out', COALESCE(v_request.requested_check_out,v_current.check_out),
        'work_mode', COALESCE(v_request.requested_work_mode,v_current.work_mode,'office'),
        'client_name', COALESCE(v_request.client_name,v_current.client_name,''),
        'status', COALESCE(NULLIF(v_current.status,''),'present'),
        'remarks', COALESCE(NULLIF(btrim(p_note),''),'Approved attendance correction')
      )
    );
  END IF;

  UPDATE public.attendance_corrections SET
    status=p_decision,resolved_by=auth.uid(),resolved_at=now(),
    resolution_note=NULLIF(btrim(COALESCE(p_note,'')),'')
  WHERE id=p_id AND tenant_id=v_tenant AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending correction changed during decision.' USING errcode='P0002'; END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'attendance.correction.'||p_decision,'attendance_correction',p_id::text,
    jsonb_build_object('attendance_record_id',v_record,'note',p_note));
  RETURN jsonb_build_object('success',true,'decision',p_decision,'attendance_record_id',v_record);
END;
$function$;

COMMIT;
