-- Atomic, forward-only compatibility transition for the verified Phase 03 / Phase 04 release.
-- Intended only after the isolated Main/Candidate, Auth, RLS, API, browser, mobile,
-- rollback and disposable-advisor gates pass. Do not replay historical migrations.
-- Preserves Auth users, administrator records, role grants, tenant memberships and
-- audit history. Leaves the other confirmed administrator's 45 global grants
-- untouched and does not create or activate that administrator's tenant membership.
-- Adds only the missing Phase 03/04 dependency schema and source-backed RPC/RLS.
-- The Phase 12 unified notification feed rewrite is deferred until its project/task
-- notification dependencies are present and accepted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(20261019,4);
DO $hosted_preflight$
DECLARE
  v_transition_needed boolean := to_regprocedure('public.has_tenant_permission(uuid,text)') IS NULL;
  v_admin_fp text; v_auth_fp text; v_audit_fp text;
  v_membership_fp text; v_user_role_fp text; v_role_permission_fp text;
  v_module_settings_fp text; v_base_table text;
BEGIN
  IF v_transition_needed THEN
    IF (SELECT count(*) FROM public.admin_users WHERE active IS TRUE) <> 2
      OR (SELECT count(*) FROM public.admin_users WHERE active IS TRUE AND is_super_admin IS TRUE) <> 1
      OR (SELECT count(*) FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
          WHERE a.active IS TRUE AND a.is_super_admin IS TRUE
            AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
            AND (u.banned_until IS NULL OR u.banned_until <= now())) <> 1
      OR (SELECT count(*) FROM public.tenants WHERE is_active IS TRUE) <> 1
      OR (SELECT count(*) FROM public.tenants WHERE is_active IS TRUE AND slug='synesis-it') <> 1
      OR (SELECT count(*) FROM public.tenant_memberships m
          JOIN public.admin_users a ON a.user_id=m.user_id
          JOIN public.tenants t ON t.id=m.tenant_id AND t.is_active IS TRUE
          JOIN public.roles r ON r.id=m.role AND r.active IS TRUE
          WHERE a.active IS TRUE AND a.is_super_admin IS TRUE
            AND lower(m.status)='active' AND m.role='hr_admin') <> 1
      OR EXISTS (SELECT 1 FROM public.tenant_memberships m
          JOIN public.admin_users a ON a.user_id=m.user_id
          WHERE a.active IS TRUE AND a.is_super_admin IS TRUE
            AND lower(m.status)='active'
          GROUP BY a.user_id HAVING count(*) <> 1)
      OR EXISTS (SELECT 1 FROM public.tenant_memberships m
          JOIN public.admin_users a ON a.user_id=m.user_id
          WHERE a.active IS TRUE AND a.is_super_admin IS FALSE
            AND lower(m.status)='active')
      OR (SELECT count(*) FROM public.roles WHERE id='hr_admin' AND active IS TRUE) <> 1
      OR (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin') <> 1
      OR NOT EXISTS (SELECT 1 FROM public.role_permissions
                     WHERE role_id='hr_admin' AND permission_id='organization.manage')
      OR (SELECT count(*) FROM public.role_permissions WHERE role_id='hris_system_admin') <> 45
      OR (SELECT count(*) FROM public.user_roles ur
          JOIN public.admin_users a ON a.user_id=ur.user_id
          WHERE a.active IS TRUE AND a.is_super_admin IS FALSE
            AND ur.role_id='hris_system_admin') <> 1 THEN
      RAISE EXCEPTION 'Hosted transition stopped: the verified Super Admin / unassigned administrator topology changed.';
    END IF;
    IF to_regprocedure('public.platform_hris_is_super_admin()') IS NOT NULL
       OR to_regprocedure('public.platform_hris_list_tenants()') IS NOT NULL
       OR to_regprocedure('public.hris_is_active_tenant_member(uuid)') IS NOT NULL
       OR to_regprocedure('public.hris_notices_super_admin_tenant_member(uuid)') IS NOT NULL
       OR to_regprocedure('public.hris_profile_change_active_member(uuid)') IS NOT NULL
       OR to_regclass('public.travel_request_notifications') IS NOT NULL
       OR to_regclass('public.learning_completion_events') IS NOT NULL
       OR to_regclass('public.learning_completion_notifications') IS NOT NULL
       OR to_regclass('public.roster_change_notifications') IS NOT NULL
       OR to_regclass('public.employee_shift_assignment_changes') IS NOT NULL
       OR to_regclass('public.tenant_module_settings') IS NOT NULL THEN
      RAISE EXCEPTION 'Hosted transition stopped: an expected missing dependency is already partially installed.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
      WHERE p.schemaname='public' AND p.tablename='notices'
        AND p.policyname='notices_read' AND p.permissive='PERMISSIVE' AND p.cmd='SELECT'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
      WHERE p.schemaname='public' AND p.tablename='notices'
        AND p.policyname='hris_notices_legacy_security_guard'
        AND p.permissive='RESTRICTIVE' AND p.cmd='SELECT'
        AND p.qual LIKE '%synesis_tenant_id%'
        AND p.qual LIKE '%has_permission%'
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
      WHERE p.schemaname='public' AND p.tablename='notices'
        AND p.policyname='hris_notices_membership_guard'
    ) THEN
      RAISE EXCEPTION 'Hosted transition stopped: notices policy baseline differs from the reviewed legacy state.';
    END IF;
  END IF;

  FOREACH v_base_table IN ARRAY ARRAY[
    'tenants','admin_users','admin_audit_logs','roles','role_permissions','user_roles',
    'tenant_memberships','employees','departments','designations','attendance_corrections',
    'attendance_records','employee_leave_balances','employee_documents','employee_profile_change_requests',
    'employee_shift_assignments','shifts','leave_requests','leave_types','holidays','hr_policies',
    'payslips','performance_cycles','performance_goals','project_performance_reviews','service_requests',
    'teams','confirmation_reviews','employee_referrals','grades','manpower_requisitions','org_locations',
    'pay_periods','travel_requests','travel_status_history','expense_categories','expense_claims',
    'expense_claim_receipts','expense_claim_status_history','expense_travel_links','learning_programs',
    'learning_sessions','learning_enrollments'
  ] LOOP
    IF to_regclass(pg_catalog.format('public.%I',v_base_table)) IS NULL THEN
      RAISE EXCEPTION 'Hosted transition stopped: required Phase 03/04 base table % is absent.',v_base_table;
    END IF;
  END LOOP;
  IF to_regclass('storage.objects') IS NULL OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Hosted transition stopped: Auth or Storage dependency is absent.';
  END IF;

  v_admin_fp := md5(coalesce((SELECT string_agg(to_jsonb(a)::text,chr(10) ORDER BY a.user_id::text) FROM public.admin_users a),''));
  v_auth_fp := md5(coalesce((SELECT string_agg(to_jsonb(u)::text,chr(10) ORDER BY u.id::text) FROM auth.users u),''));
  v_audit_fp := md5(coalesce((SELECT string_agg(to_jsonb(a)::text,chr(10) ORDER BY a.id::text) FROM public.admin_audit_logs a),''));
  v_membership_fp := md5(coalesce((SELECT string_agg(to_jsonb(m)::text,chr(10) ORDER BY m.tenant_id::text,m.user_id::text) FROM public.tenant_memberships m),''));
  v_user_role_fp := md5(coalesce((SELECT string_agg(to_jsonb(ur)::text,chr(10) ORDER BY ur.user_id::text,ur.role_id) FROM public.user_roles ur),''));
  v_role_permission_fp := md5(coalesce((SELECT string_agg(to_jsonb(rp)::text,chr(10) ORDER BY rp.role_id,rp.permission_id) FROM public.role_permissions rp),''));
  PERFORM pg_catalog.set_config('synesis.hosted_transition.admin_fp',v_admin_fp,true);
  PERFORM pg_catalog.set_config('synesis.hosted_transition.auth_fp',v_auth_fp,true);
  PERFORM pg_catalog.set_config('synesis.hosted_transition.audit_fp',v_audit_fp,true);
  PERFORM pg_catalog.set_config('synesis.hosted_transition.membership_fp',v_membership_fp,true);
  PERFORM pg_catalog.set_config('synesis.hosted_transition.user_role_fp',v_user_role_fp,true);
  PERFORM pg_catalog.set_config('synesis.hosted_transition.role_permission_fp',v_role_permission_fp,true);
  IF to_regclass('public.tenant_module_settings') IS NOT NULL THEN
    EXECUTE 'SELECT md5(coalesce(string_agg(to_jsonb(s)::text,chr(10) ORDER BY s.tenant_id::text,s.module_key),'''')) FROM public.tenant_module_settings s'
      INTO v_module_settings_fp;
    PERFORM pg_catalog.set_config('synesis.hosted_transition.module_settings_fp',v_module_settings_fp,true);
    PERFORM pg_catalog.set_config('synesis.hosted_transition.module_settings_existed','yes',true);
  ELSE
    PERFORM pg_catalog.set_config('synesis.hosted_transition.module_settings_existed','no',true);
  END IF;
END
$hosted_preflight$;

-- Source fragment: supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql
-- Tenant-scoped authorization for HRIS data and approval workflows.
-- This migration is a release candidate. It must pass the isolated Auth/RLS
-- suite before any hosted migration is applied.

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
DROP POLICY IF EXISTS hris_employees_membership_read ON public.employees;
CREATE POLICY hris_employees_membership_read ON public.employees AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'employees.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'employees.manage')
  );

DROP POLICY IF EXISTS hris_departments_membership_read ON public.departments;
DROP POLICY IF EXISTS hris_departments_membership_read ON public.departments;
CREATE POLICY hris_departments_membership_read ON public.departments AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

DROP POLICY IF EXISTS hris_leave_requests_membership_read ON public.leave_requests;
DROP POLICY IF EXISTS hris_leave_requests_membership_read ON public.leave_requests;
CREATE POLICY hris_leave_requests_membership_read ON public.leave_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  );

DROP POLICY IF EXISTS hris_leave_types_membership_read ON public.leave_types;
DROP POLICY IF EXISTS hris_leave_types_membership_read ON public.leave_types;
CREATE POLICY hris_leave_types_membership_read ON public.leave_types AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  );

DROP POLICY IF EXISTS hris_attendance_records_membership_read ON public.attendance_records;
DROP POLICY IF EXISTS hris_attendance_records_membership_read ON public.attendance_records;
CREATE POLICY hris_attendance_records_membership_read ON public.attendance_records AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  );

DROP POLICY IF EXISTS hris_attendance_records_own_read ON public.attendance_records;
DROP POLICY IF EXISTS hris_attendance_records_own_read ON public.attendance_records;
CREATE POLICY hris_attendance_records_own_read ON public.attendance_records AS PERMISSIVE FOR SELECT TO authenticated
  USING (employee_id=public.hris_own_employee_for_tenant(tenant_id));

DROP POLICY IF EXISTS hris_attendance_corrections_membership_read ON public.attendance_corrections;
DROP POLICY IF EXISTS hris_attendance_corrections_membership_read ON public.attendance_corrections;
CREATE POLICY hris_attendance_corrections_membership_read ON public.attendance_corrections AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  );

DROP POLICY IF EXISTS hris_attendance_corrections_own_read ON public.attendance_corrections;
DROP POLICY IF EXISTS hris_attendance_corrections_own_read ON public.attendance_corrections;
CREATE POLICY hris_attendance_corrections_own_read ON public.attendance_corrections AS PERMISSIVE FOR SELECT TO authenticated
  USING (employee_id=public.hris_own_employee_for_tenant(tenant_id));

DROP POLICY IF EXISTS hris_employee_leave_balances_membership_read ON public.employee_leave_balances;
DROP POLICY IF EXISTS hris_employee_leave_balances_membership_read ON public.employee_leave_balances;
CREATE POLICY hris_employee_leave_balances_membership_read ON public.employee_leave_balances AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  );

DROP POLICY IF EXISTS hris_employee_leave_balances_own_read ON public.employee_leave_balances;
DROP POLICY IF EXISTS hris_employee_leave_balances_own_read ON public.employee_leave_balances;
CREATE POLICY hris_employee_leave_balances_own_read ON public.employee_leave_balances AS PERMISSIVE FOR SELECT TO authenticated
  USING (employee_id=public.hris_own_employee_for_tenant(tenant_id));

-- These restrictive policies constrain the older permissive global-role
-- policies. Global user_roles/admin_users grants alone cannot reveal tenant rows.
DROP POLICY IF EXISTS hris_attendance_records_tenant_read_guard ON public.attendance_records;
DROP POLICY IF EXISTS hris_attendance_records_tenant_read_guard ON public.attendance_records;
CREATE POLICY hris_attendance_records_tenant_read_guard ON public.attendance_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  );

DROP POLICY IF EXISTS hris_attendance_corrections_tenant_read_guard ON public.attendance_corrections;
DROP POLICY IF EXISTS hris_attendance_corrections_tenant_read_guard ON public.attendance_corrections;
CREATE POLICY hris_attendance_corrections_tenant_read_guard ON public.attendance_corrections AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  );

DROP POLICY IF EXISTS hris_employee_leave_balances_tenant_read_guard ON public.employee_leave_balances;
DROP POLICY IF EXISTS hris_employee_leave_balances_tenant_read_guard ON public.employee_leave_balances;
CREATE POLICY hris_employee_leave_balances_tenant_read_guard ON public.employee_leave_balances AS RESTRICTIVE FOR SELECT TO authenticated
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

CREATE OR REPLACE FUNCTION public.hris_employee_submit_attendance_correction(
  p_tenant_id uuid, p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_date date := nullif(p_payload->>'attendance_date','')::date;
  v_check_in_time time := nullif(p_payload->>'check_in_time','')::time;
  v_check_out_time time := nullif(p_payload->>'check_out_time','')::time;
  v_work_mode text := nullif(btrim(coalesce(p_payload->>'work_mode','')),'');
  v_client_name text := nullif(btrim(coalesce(p_payload->>'client_name','')),'');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_check_in timestamptz;
  v_check_out timestamptz;
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
  IF v_date IS NULL OR v_reason IS NULL THEN
    RAISE EXCEPTION 'Attendance date and reason are required.' USING errcode='22000';
  END IF;
  IF v_check_in_time IS NULL AND v_check_out_time IS NULL
     AND v_work_mode IS NULL AND v_client_name IS NULL THEN
    RAISE EXCEPTION 'Provide at least one attendance field to correct.' USING errcode='22000';
  END IF;
  IF v_work_mode IS NOT NULL AND v_work_mode NOT IN ('office','home','client_meeting') THEN
    RAISE EXCEPTION 'Choose a supported work location.' USING errcode='22000';
  END IF;
  IF v_check_in_time IS NOT NULL AND v_check_out_time IS NOT NULL
     AND v_check_out_time < v_check_in_time THEN
    RAISE EXCEPTION 'Check-out must be after check-in.' USING errcode='22000';
  END IF;

  v_check_in := CASE WHEN v_check_in_time IS NULL THEN NULL
    ELSE (v_date + v_check_in_time) AT TIME ZONE v_timezone END;
  v_check_out := CASE WHEN v_check_out_time IS NULL THEN NULL
    ELSE (v_date + v_check_out_time) AT TIME ZONE v_timezone END;

  INSERT INTO public.attendance_corrections(
    id,tenant_id,employee_id,attendance_date,requested_check_in,
    requested_check_out,requested_work_mode,client_name,reason,status,requested_by
  ) VALUES (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_employee,v_date,v_check_in,
    v_check_out,v_work_mode,v_client_name,v_reason,'pending',auth.uid()
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'attendance.correction.submitted','attendance_correction',v_request_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee,'attendance_date',v_date));
  RETURN v_request_id;
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

REVOKE ALL ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_employee_submit_leave_request(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_leave_request(uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_has_active_employee_record() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_has_active_employee_record() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_can_access_leave_evidence(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_can_access_leave_evidence(text,text) TO authenticated, service_role;

DROP POLICY IF EXISTS hris_leave_evidence_employee_upload ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_employee_upload ON storage.objects;
CREATE POLICY hris_leave_evidence_employee_upload ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='leave-evidence'
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND public.hris_has_active_employee_record()
  );
DROP POLICY IF EXISTS hris_leave_evidence_upload_tenant_guard ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_upload_tenant_guard ON storage.objects;
CREATE POLICY hris_leave_evidence_upload_tenant_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id<>'leave-evidence'
    OR ((storage.foldername(name))[1]=(SELECT auth.uid())::text
      AND EXISTS (SELECT 1 FROM public.employees e
        WHERE e.user_id=(SELECT auth.uid())
          AND e.tenant_id::text=(storage.foldername(name))[2]
          AND e.id=public.hris_own_employee_for_tenant(e.tenant_id)))
  );
DROP POLICY IF EXISTS hris_leave_evidence_scoped_read ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_scoped_read ON storage.objects;
CREATE POLICY hris_leave_evidence_scoped_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id='leave-evidence'
    AND public.hris_can_access_leave_evidence(
      (storage.foldername(name))[1],(storage.foldername(name))[2])
  );
DROP POLICY IF EXISTS hris_leave_evidence_tenant_read_guard ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_tenant_read_guard ON storage.objects;
CREATE POLICY hris_leave_evidence_tenant_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id<>'leave-evidence'
    OR public.hris_can_access_leave_evidence(
      (storage.foldername(name))[1],(storage.foldername(name))[2])
  );
DROP POLICY IF EXISTS hris_leave_evidence_employee_delete ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_employee_delete ON storage.objects;
CREATE POLICY hris_leave_evidence_employee_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id='leave-evidence'
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND public.hris_has_active_employee_record()
  );
DROP POLICY IF EXISTS hris_leave_evidence_delete_tenant_guard ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_delete_tenant_guard ON storage.objects;
CREATE POLICY hris_leave_evidence_delete_tenant_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
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

-- Source fragment: supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql
-- Constrain legacy permissive read policies to the active tenant membership.
-- This is a local release-candidate migration; do not apply to a hosted
-- project until the isolated Auth/RLS suite and release gates pass.

CREATE OR REPLACE FUNCTION public.hris_is_active_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
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
      WHERE t.id = p_tenant_id
        AND t.is_active IS TRUE
    )
$function$;

REVOKE ALL ON FUNCTION public.hris_is_active_tenant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_is_active_tenant_member(uuid) TO authenticated, service_role;

-- Preserve authorized reads in tenants other than the legacy Synesis pin.
-- These permissive policies pair with the restrictive guards below.
DROP POLICY IF EXISTS hris_confirmation_reviews_membership_read ON public.confirmation_reviews;
CREATE POLICY hris_confirmation_reviews_membership_read ON public.confirmation_reviews AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

DROP POLICY IF EXISTS hris_designations_membership_read ON public.designations;
CREATE POLICY hris_designations_membership_read ON public.designations AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

DROP POLICY IF EXISTS hris_employee_referrals_membership_read ON public.employee_referrals;
CREATE POLICY hris_employee_referrals_membership_read ON public.employee_referrals AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    referrer_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'referrals.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'referrals.manage')
  );

DROP POLICY IF EXISTS hris_grades_membership_read ON public.grades;
CREATE POLICY hris_grades_membership_read ON public.grades AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

DROP POLICY IF EXISTS hris_holidays_membership_read ON public.holidays;
CREATE POLICY hris_holidays_membership_read ON public.holidays AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (active IS TRUE AND public.hris_is_active_tenant_member(tenant_id))
    OR public.hris_admin_can_read_tenant(tenant_id, 'holidays.manage')
  );

DROP POLICY IF EXISTS hris_hr_policies_membership_read ON public.hr_policies;
CREATE POLICY hris_hr_policies_membership_read ON public.hr_policies AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (active IS TRUE AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL)
    OR public.hris_admin_can_read_tenant(tenant_id, 'policies.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'policies.manage')
  );

DROP POLICY IF EXISTS hris_manpower_requisitions_membership_read ON public.manpower_requisitions;
CREATE POLICY hris_manpower_requisitions_membership_read ON public.manpower_requisitions AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'recruitment.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'recruitment.manage')
  );

DROP POLICY IF EXISTS hris_notices_membership_read ON public.notices;
CREATE POLICY hris_notices_membership_read ON public.notices AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (active IS TRUE AND public.hris_is_active_tenant_member(tenant_id))
    OR public.hris_admin_can_read_tenant(tenant_id, 'notices.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'notices.manage')
  );

DROP POLICY IF EXISTS hris_org_locations_membership_read ON public.org_locations;
CREATE POLICY hris_org_locations_membership_read ON public.org_locations AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

DROP POLICY IF EXISTS hris_pay_periods_membership_read ON public.pay_periods;
CREATE POLICY hris_pay_periods_membership_read ON public.pay_periods AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'payroll.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.manage')
  );

DROP POLICY IF EXISTS hris_payslips_membership_read ON public.payslips;
CREATE POLICY hris_payslips_membership_read ON public.payslips AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (employee_id = public.hris_own_employee_for_tenant(tenant_id) AND status = 'released')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.manage')
  );

DROP POLICY IF EXISTS hris_performance_cycles_membership_read ON public.performance_cycles;
CREATE POLICY hris_performance_cycles_membership_read ON public.performance_cycles AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

DROP POLICY IF EXISTS hris_performance_goals_membership_read ON public.performance_goals;
CREATE POLICY hris_performance_goals_membership_read ON public.performance_goals AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

DROP POLICY IF EXISTS hris_project_performance_reviews_membership_read ON public.project_performance_reviews;
CREATE POLICY hris_project_performance_reviews_membership_read ON public.project_performance_reviews AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR project_manager_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  );

DROP POLICY IF EXISTS hris_service_requests_membership_read ON public.service_requests;
CREATE POLICY hris_service_requests_membership_read ON public.service_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'self_service.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'self_service.manage')
  );

DROP POLICY IF EXISTS hris_shifts_membership_read ON public.shifts;
CREATE POLICY hris_shifts_membership_read ON public.shifts AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

DROP POLICY IF EXISTS hris_teams_membership_read ON public.teams;
CREATE POLICY hris_teams_membership_read ON public.teams AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  );

-- A restrictive policy combines with the legacy policies as AND, so a global
-- user_roles grant can no longer bypass the active membership's role.
-- Thirteen tables currently carry anon SELECT grants, but the inspected policy
-- set has no anon SELECT policies. Keep these guards authenticated-only; anon
-- remains denied by the existing default-deny RLS behavior.
DROP POLICY IF EXISTS hris_attendance_corrections_membership_guard ON public.attendance_corrections;
DROP POLICY IF EXISTS hris_attendance_corrections_membership_guard ON public.attendance_corrections;
CREATE POLICY hris_attendance_corrections_membership_guard ON public.attendance_corrections AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  ));

DROP POLICY IF EXISTS hris_attendance_records_membership_guard ON public.attendance_records;
DROP POLICY IF EXISTS hris_attendance_records_membership_guard ON public.attendance_records;
CREATE POLICY hris_attendance_records_membership_guard ON public.attendance_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'attendance.manage')
  ));

DROP POLICY IF EXISTS hris_confirmation_reviews_membership_guard ON public.confirmation_reviews;
DROP POLICY IF EXISTS hris_confirmation_reviews_membership_guard ON public.confirmation_reviews;
CREATE POLICY hris_confirmation_reviews_membership_guard ON public.confirmation_reviews AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  ));

DROP POLICY IF EXISTS hris_designations_membership_guard ON public.designations;
DROP POLICY IF EXISTS hris_designations_membership_guard ON public.designations;
CREATE POLICY hris_designations_membership_guard ON public.designations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

DROP POLICY IF EXISTS hris_employee_leave_balances_membership_guard ON public.employee_leave_balances;
DROP POLICY IF EXISTS hris_employee_leave_balances_membership_guard ON public.employee_leave_balances;
CREATE POLICY hris_employee_leave_balances_membership_guard ON public.employee_leave_balances AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'leave.manage')
  ));

DROP POLICY IF EXISTS hris_employee_referrals_membership_guard ON public.employee_referrals;
DROP POLICY IF EXISTS hris_employee_referrals_membership_guard ON public.employee_referrals;
CREATE POLICY hris_employee_referrals_membership_guard ON public.employee_referrals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    referrer_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'referrals.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'referrals.manage')
  ));

DROP POLICY IF EXISTS hris_grades_membership_guard ON public.grades;
DROP POLICY IF EXISTS hris_grades_membership_guard ON public.grades;
CREATE POLICY hris_grades_membership_guard ON public.grades AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

DROP POLICY IF EXISTS hris_holidays_membership_guard ON public.holidays;
DROP POLICY IF EXISTS hris_holidays_membership_guard ON public.holidays;
CREATE POLICY hris_holidays_membership_guard ON public.holidays AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    (active IS TRUE AND public.hris_is_active_tenant_member(tenant_id))
    OR public.hris_admin_can_read_tenant(tenant_id, 'holidays.manage')
  ));

DROP POLICY IF EXISTS hris_hr_policies_membership_guard ON public.hr_policies;
DROP POLICY IF EXISTS hris_hr_policies_membership_guard ON public.hr_policies;
CREATE POLICY hris_hr_policies_membership_guard ON public.hr_policies AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    (active IS TRUE AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL)
    OR public.hris_admin_can_read_tenant(tenant_id, 'policies.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'policies.manage')
  ));

DROP POLICY IF EXISTS hris_manpower_requisitions_membership_guard ON public.manpower_requisitions;
DROP POLICY IF EXISTS hris_manpower_requisitions_membership_guard ON public.manpower_requisitions;
CREATE POLICY hris_manpower_requisitions_membership_guard ON public.manpower_requisitions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'recruitment.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'recruitment.manage')
  ));

DROP POLICY IF EXISTS hris_notices_membership_guard ON public.notices;
DROP POLICY IF EXISTS hris_notices_membership_guard ON public.notices;
CREATE POLICY hris_notices_membership_guard ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    (active IS TRUE AND public.hris_is_active_tenant_member(tenant_id))
    OR public.hris_admin_can_read_tenant(tenant_id, 'notices.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'notices.manage')
  ));

DROP POLICY IF EXISTS hris_org_locations_membership_guard ON public.org_locations;
DROP POLICY IF EXISTS hris_org_locations_membership_guard ON public.org_locations;
CREATE POLICY hris_org_locations_membership_guard ON public.org_locations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

DROP POLICY IF EXISTS hris_pay_periods_membership_guard ON public.pay_periods;
DROP POLICY IF EXISTS hris_pay_periods_membership_guard ON public.pay_periods;
CREATE POLICY hris_pay_periods_membership_guard ON public.pay_periods AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'payroll.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.manage')
  ));

DROP POLICY IF EXISTS hris_payslips_membership_guard ON public.payslips;
DROP POLICY IF EXISTS hris_payslips_membership_guard ON public.payslips;
CREATE POLICY hris_payslips_membership_guard ON public.payslips AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    (employee_id = public.hris_own_employee_for_tenant(tenant_id) AND status = 'released')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'payroll.manage')
  ));

DROP POLICY IF EXISTS hris_performance_cycles_membership_guard ON public.performance_cycles;
DROP POLICY IF EXISTS hris_performance_cycles_membership_guard ON public.performance_cycles;
CREATE POLICY hris_performance_cycles_membership_guard ON public.performance_cycles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  ));

DROP POLICY IF EXISTS hris_performance_goals_membership_guard ON public.performance_goals;
DROP POLICY IF EXISTS hris_performance_goals_membership_guard ON public.performance_goals;
CREATE POLICY hris_performance_goals_membership_guard ON public.performance_goals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  ));

DROP POLICY IF EXISTS hris_project_performance_reviews_membership_guard ON public.project_performance_reviews;
DROP POLICY IF EXISTS hris_project_performance_reviews_membership_guard ON public.project_performance_reviews;
CREATE POLICY hris_project_performance_reviews_membership_guard ON public.project_performance_reviews AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR project_manager_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'performance.manage')
  ));

DROP POLICY IF EXISTS hris_service_requests_membership_guard ON public.service_requests;
DROP POLICY IF EXISTS hris_service_requests_membership_guard ON public.service_requests;
CREATE POLICY hris_service_requests_membership_guard ON public.service_requests AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id, 'self_service.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'self_service.manage')
  ));

DROP POLICY IF EXISTS hris_shifts_membership_guard ON public.shifts;
DROP POLICY IF EXISTS hris_shifts_membership_guard ON public.shifts;
CREATE POLICY hris_shifts_membership_guard ON public.shifts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

DROP POLICY IF EXISTS hris_teams_membership_guard ON public.teams;
DROP POLICY IF EXISTS hris_teams_membership_guard ON public.teams;
CREATE POLICY hris_teams_membership_guard ON public.teams AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (
    public.hris_admin_can_read_tenant(tenant_id, 'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id, 'organization.manage')
  ));

-- Source fragment: supabase/staging/phase2a/tenant_provisioning.staging.sql
-- Phase 2A function contract, installed atomically after isolated acceptance.
-- New tenants remain inactive until tenant-wide RBAC and RPC isolation are verified.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS default_locale text;
DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.tenants'::pg_catalog.regclass
    AND conname = 'hris_tenants_default_locale_check') THEN
  ALTER TABLE public.tenants ADD CONSTRAINT hris_tenants_default_locale_check
   CHECK (default_locale IS NULL OR default_locale IN ('en','bn'));
 END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.platform_hris_is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $func$
 SELECT public.is_live_session() AND EXISTS (
  SELECT 1 FROM public.admin_users a
  JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id = auth.uid() AND a.active IS TRUE AND a.is_super_admin IS TRUE
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
 );
$func$;

CREATE OR REPLACE FUNCTION public.platform_hris_list_tenants()
RETURNS TABLE(id uuid,code text,slug text,name text,is_active boolean,
 timezone text,default_locale text,active_admin_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $func$
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
 END IF;
 RETURN QUERY SELECT t.id,t.code,t.slug,t.name,t.is_active,t.timezone,
 t.default_locale,(
  SELECT count(*) FROM public.tenant_memberships m WHERE m.tenant_id=t.id
   AND m.role='hr_admin' AND m.status='active')::bigint
 FROM public.tenants t ORDER BY t.name,t.id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.platform_hris_provision_tenant(
 p_code text,p_slug text,p_name text,p_timezone text,
 p_default_locale text,p_admin_user_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $func$
DECLARE
 v_id uuid;
 v_code text := upper(btrim(p_code));
 v_slug text := lower(btrim(p_slug));
 v_name text := btrim(p_name);
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
 END IF;
 IF v_code IS NULL OR v_code !~ '^[A-Z0-9_]{2,24}$'
 OR v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 OR pg_catalog.length(v_slug)>80 OR v_name IS NULL
 OR pg_catalog.length(v_name) NOT BETWEEN 2 AND 180
 OR p_default_locale IS NULL OR p_default_locale NOT IN ('en','bn')
 OR p_timezone IS NULL OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone
 ) THEN
  RAISE EXCEPTION 'Invalid tenant configuration' USING ERRCODE = '22023';
 END IF;
 IF p_admin_user_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM auth.users u WHERE u.id=p_admin_user_id
  AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL
  AND (u.banned_until IS NULL OR u.banned_until <= now())
 ) THEN
  RAISE EXCEPTION 'Administrator account must be confirmed and active' USING ERRCODE='22023';
 END IF;
 -- Do not create a membership that the tenant-scoped RBAC resolver cannot
 -- resolve. Hosted legacy membership values exist without matching roles.
 IF NOT EXISTS (
  SELECT 1 FROM public.roles r
  JOIN public.role_permissions rp ON rp.role_id=r.id
    AND rp.permission_id='organization.manage'
  WHERE r.id='hr_admin' AND r.active IS TRUE
 ) THEN
  RAISE EXCEPTION 'Tenant administrator role is not configured for scoped authorization'
    USING ERRCODE='55000';
 END IF;
 INSERT INTO public.tenants(code,slug,name,timezone,default_locale,is_active)
 VALUES(v_code,v_slug,v_name,p_timezone,p_default_locale,FALSE)
 RETURNING public.tenants.id INTO v_id;
 INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
 VALUES(v_id,p_admin_user_id,'hr_admin','active');
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),'PLATFORM_TENANT_PROVISIONED','tenants',v_id::text,
  pg_catalog.jsonb_build_object('code',v_code,'slug',v_slug,'inactive_pending_certification',true));
 RETURN v_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.platform_hris_update_tenant_metadata(
 p_tenant_id uuid,p_name text,p_timezone text,p_default_locale text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $func$
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
 END IF;
 IF p_name IS NULL OR pg_catalog.length(btrim(p_name)) NOT BETWEEN 2 AND 180
 OR p_default_locale IS NULL OR p_default_locale NOT IN ('en','bn')
 OR p_timezone IS NULL OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone
 ) THEN
  RAISE EXCEPTION 'Invalid tenant configuration' USING ERRCODE='22023';
 END IF;
 UPDATE public.tenants t SET name=btrim(p_name), timezone=p_timezone,
 default_locale=p_default_locale, updated_at=now() WHERE t.id=p_tenant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),'PLATFORM_TENANT_METADATA_CHANGED','tenants',p_tenant_id::text,
  pg_catalog.jsonb_build_object('fields',pg_catalog.jsonb_build_array('name','timezone','default_locale')));
END;
$func$;

CREATE OR REPLACE FUNCTION public.platform_hris_set_tenant_admin(
 p_tenant_id uuid,p_user_id uuid,p_enabled boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $func$
DECLARE v_existing text;
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_enabled IS NULL
 OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id=p_tenant_id) THEN
  RAISE EXCEPTION 'Invalid tenant administrator request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_tenant_id::text)::bigint);
 IF p_enabled THEN
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_user_id
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())) THEN
    RAISE EXCEPTION 'Administrator account must be confirmed and active' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id=r.id
      AND rp.permission_id='organization.manage'
    WHERE r.id='hr_admin' AND r.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Tenant administrator role is not configured for scoped authorization'
      USING ERRCODE='55000';
  END IF;
  INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  VALUES(p_tenant_id,p_user_id,'hr_admin','active')
  ON CONFLICT (tenant_id,user_id) DO UPDATE
  SET status='active', updated_at=now()
  WHERE public.tenant_memberships.role='hr_admin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Existing membership cannot be converted to administrator until multi-role assignments are supported'
      USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT m.status INTO v_existing FROM public.tenant_memberships m
   WHERE m.tenant_id=p_tenant_id AND m.user_id=p_user_id
    AND m.role='hr_admin' FOR UPDATE;
  IF NOT FOUND OR v_existing<>'active' THEN
    RAISE EXCEPTION 'No active tenant administrator to revoke' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM public.tenant_memberships m
      WHERE m.tenant_id=p_tenant_id AND m.role='hr_admin' AND m.status='active')<=1 THEN
    RAISE EXCEPTION 'Cannot revoke last tenant administrator' USING ERRCODE='23514';
  END IF;
  UPDATE public.tenant_memberships SET status='inactive',updated_at=now()
   WHERE tenant_id=p_tenant_id AND user_id=p_user_id;
 END IF;
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),CASE WHEN p_enabled THEN 'PLATFORM_TENANT_ADMIN_ASSIGNED'
  ELSE 'PLATFORM_TENANT_ADMIN_REVOKED' END,'tenant_memberships',
  p_tenant_id::text,pg_catalog.jsonb_build_object('member_id',p_user_id::text));
END;
$func$;

REVOKE ALL ON FUNCTION public.platform_hris_is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_list_tenants() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_provision_tenant(text,text,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_update_tenant_metadata(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_set_tenant_admin(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_list_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_provision_tenant(text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_update_tenant_metadata(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_set_tenant_admin(uuid,uuid,boolean) TO authenticated;

-- Source fragment: supabase/staging/phase2b/platform_tenant_admin_email.staging.sql
-- PHASE 2B STAGING CONTRACT ONLY.
-- Resolves only an exact, confirmed Auth email for existing tenant-admin workflows.
-- It creates no Auth identities, sends no email, and does not change tenant activation.

CREATE OR REPLACE FUNCTION public._platform_hris_confirmed_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
BEGIN
  IF NOT public.platform_hris_is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' OR length(v_email) > 320 OR v_email ~ '[[:space:]]'
     OR position('@' IN v_email) < 2
     OR position('.' IN substring(v_email FROM position('@' IN v_email) + 1)) < 2 THEN
    RAISE EXCEPTION 'Enter a valid administrator email address.' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_user_id
  FROM auth.users AS u
  WHERE lower(u.email) = v_email
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'An active, confirmed Auth account was not found for this email.' USING ERRCODE = '22023';
  END IF;
  RETURN v_user_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_hris_provision_tenant_by_email(
  p_code text,
  p_slug text,
  p_name text,
  p_timezone text,
  p_default_locale text,
  p_admin_email text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_admin_user_id uuid;
BEGIN
  IF NOT public.platform_hris_is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  v_admin_user_id := public._platform_hris_confirmed_user_id_by_email(p_admin_email);
  RETURN public.platform_hris_provision_tenant(
    p_code, p_slug, p_name, p_timezone, p_default_locale, v_admin_user_id
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_hris_set_tenant_admin_by_email(
  p_tenant_id uuid,
  p_admin_email text,
  p_enabled boolean
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_admin_user_id uuid;
BEGIN
  IF NOT public.platform_hris_is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid tenant administrator request' USING ERRCODE = '22023';
  END IF;
  v_admin_user_id := public._platform_hris_confirmed_user_id_by_email(p_admin_email);
  PERFORM public.platform_hris_set_tenant_admin(p_tenant_id, v_admin_user_id, p_enabled);
END
$function$;

REVOKE ALL ON FUNCTION public._platform_hris_confirmed_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_hris_provision_tenant_by_email(text,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_hris_set_tenant_admin_by_email(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_provision_tenant_by_email(text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_set_tenant_admin_by_email(uuid,text,boolean) TO authenticated;

-- Source fragment: supabase/migrations/20261014160000_hris_learning_completion_verification.sql
-- Phase 12: employee-submitted learning completion with manager verification.
-- Evidence is optional until a program-level evidence requirement is approved.
-- Manager decisions use only the existing tenant learning.manage permission;
-- no manager/reporting-line relationship is present in the verified contract.

ALTER TABLE public.learning_enrollments
  ADD COLUMN IF NOT EXISTS completion_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_evidence_path text,
  ADD COLUMN IF NOT EXISTS completion_evidence_name text,
  ADD COLUMN IF NOT EXISTS completion_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_return_reason text;

-- Replace the existing status allow-list (the base table uses the standard
-- learning_enrollments_status_check name) while preserving unrelated checks.
ALTER TABLE public.learning_enrollments
  DROP CONSTRAINT IF EXISTS learning_enrollments_status_check;
ALTER TABLE public.learning_enrollments
  DROP CONSTRAINT IF EXISTS learning_enrollments_completion_status_check;
ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_completion_status_check
  CHECK (status IN ('requested','enrolled','rejected','pending_verification',
    'returned_for_correction','completed','cancelled')) NOT VALID;
ALTER TABLE public.learning_enrollments
  VALIDATE CONSTRAINT learning_enrollments_completion_status_check;

ALTER TABLE public.learning_enrollments
  DROP CONSTRAINT IF EXISTS learning_enrollments_completion_evidence_pair_check;
ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_completion_evidence_pair_check
  CHECK ((completion_evidence_path IS NULL) = (completion_evidence_name IS NULL)) NOT VALID;
ALTER TABLE public.learning_enrollments
  VALIDATE CONSTRAINT learning_enrollments_completion_evidence_pair_check;

CREATE UNIQUE INDEX IF NOT EXISTS learning_enrollments_tenant_id_id_key
  ON public.learning_enrollments(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_id_id_key
  ON public.employees(tenant_id,id);
-- Pending and returned submissions remain open learning assignments. Keep
-- the employee/program/session uniqueness guard active through verification.
DROP INDEX IF EXISTS public.learning_enrollments_open_employee_program_session_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS learning_enrollments_open_employee_program_session_uidx ON public.learning_enrollments(employee_id,program_id,
    coalesce(session_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('requested','enrolled','pending_verification','returned_for_correction');
CREATE INDEX IF NOT EXISTS learning_enrollments_completion_queue_idx
  ON public.learning_enrollments(tenant_id,completion_submitted_at,id)
  WHERE status='pending_verification';

CREATE TABLE IF NOT EXISTS public.learning_completion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('submitted','resubmitted','verified','returned_for_correction')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  evidence_path text,
  evidence_name text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,id),
  CONSTRAINT learning_completion_events_enrollment_fk FOREIGN KEY (tenant_id,enrollment_id)
    REFERENCES public.learning_enrollments(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS learning_completion_events_enrollment_idx ON public.learning_completion_events(tenant_id,enrollment_id,created_at,id);

CREATE TABLE IF NOT EXISTS public.learning_completion_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  recipient_employee_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('verified','returned_for_correction')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT learning_completion_notifications_employee_fk FOREIGN KEY (tenant_id,recipient_employee_id)
    REFERENCES public.employees(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT learning_completion_notifications_enrollment_fk FOREIGN KEY (tenant_id,enrollment_id)
    REFERENCES public.learning_enrollments(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT learning_completion_notifications_event_fk FOREIGN KEY (tenant_id,event_id)
    REFERENCES public.learning_completion_events(tenant_id,id) ON DELETE CASCADE,
  UNIQUE (tenant_id,recipient_employee_id,event_id)
);
CREATE INDEX IF NOT EXISTS learning_completion_notifications_employee_idx ON public.learning_completion_notifications(tenant_id,recipient_employee_id,created_at DESC,id DESC);

ALTER TABLE public.learning_completion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_completion_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_completion_events,public.learning_completion_notifications
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.learning_completion_notifications TO authenticated;
DROP POLICY IF EXISTS learning_completion_notifications_owner_read ON public.learning_completion_notifications;
CREATE POLICY learning_completion_notifications_owner_read ON public.learning_completion_notifications FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND recipient_employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.is_active IS TRUE));

CREATE OR REPLACE FUNCTION public.hris_get_my_learning_completion_data(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_enrollments jsonb;
  v_notifications jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'status',e.status,'completion_submitted_at',e.completion_submitted_at,
    'completion_evidence_name',e.completion_evidence_name,
    'completion_verified_at',e.completion_verified_at,
    'completion_verified_by',e.completion_verified_by,
    'completion_verified_by_name',reviewer.full_name,
    'completion_return_reason',e.completion_return_reason,
    'completion_history',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'event_type',ce.event_type,'reason',ce.reason,'evidence_name',ce.evidence_name,
        'created_at',ce.created_at
      ) ORDER BY ce.created_at,ce.id)
      FROM public.learning_completion_events ce
      WHERE ce.tenant_id=e.tenant_id AND ce.enrollment_id=e.id
    ),'[]'::jsonb)
  ) ORDER BY e.created_at DESC,e.id),'[]'::jsonb)
    INTO v_enrollments
  FROM public.learning_enrollments e
  LEFT JOIN public.employees reviewer
    ON reviewer.tenant_id=e.tenant_id AND reviewer.user_id=e.completion_verified_by
  WHERE e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'kind',n.kind,'enrollment_id',n.enrollment_id,
    'program_title',p.title,'created_at',n.created_at
  ) ORDER BY n.created_at DESC,n.id DESC),'[]'::jsonb)
    INTO v_notifications
  FROM public.learning_completion_notifications n
  JOIN public.learning_enrollments e ON e.tenant_id=n.tenant_id AND e.id=n.enrollment_id
  JOIN public.learning_programs p ON p.tenant_id=e.tenant_id AND p.id=e.program_id
  WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id;

  RETURN jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'enrollments',coalesce(v_enrollments,'[]'::jsonb),
    'notifications',coalesce(v_notifications,'[]'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_learning_completion_queue(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'employee_id',e.employee_id,'employee_number',em.employee_number,
    'employee_name',em.full_name,'program_id',p.id,'program_title',p.title,
    'session_id',e.session_id,'submitted_at',e.completion_submitted_at,
    'evidence_path',e.completion_evidence_path,'evidence_name',e.completion_evidence_name
  ) ORDER BY e.completion_submitted_at,e.id),'[]'::jsonb)
    INTO v_items
  FROM public.learning_enrollments e
  JOIN public.employees em ON em.tenant_id=e.tenant_id AND em.id=e.employee_id
  JOIN public.learning_programs p ON p.tenant_id=e.tenant_id AND p.id=e.program_id
  WHERE e.tenant_id=p_tenant_id AND e.status='pending_verification';
  RETURN v_items;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_employee_submit_learning_completion(
  p_tenant_id uuid,p_enrollment_id uuid,p_evidence_path text DEFAULT NULL,p_evidence_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_enrollment public.learning_enrollments%ROWTYPE;
  v_event_id uuid;
  v_mime text;
  v_size bigint;
  v_event_type text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF (p_evidence_path IS NULL) <> (p_evidence_name IS NULL)
     OR p_evidence_name IS NOT NULL AND (length(p_evidence_name)<1 OR length(p_evidence_name)>255
       OR position('/' in p_evidence_name)>0 OR position(chr(92) in p_evidence_name)>0)
     OR p_evidence_path IS NOT NULL AND (
       length(p_evidence_path)>700
       OR p_evidence_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
       OR (storage.foldername(p_evidence_path))[1]<>auth.uid()::text
       OR (storage.foldername(p_evidence_path))[2]<>p_tenant_id::text
       OR (storage.foldername(p_evidence_path))[3]<>p_enrollment_id::text
     ) THEN
    RAISE EXCEPTION 'Choose a PDF, PNG, or JPEG evidence file up to 5 MB.' USING errcode='22023';
  END IF;

  SELECT e.* INTO v_enrollment FROM public.learning_enrollments e
  WHERE e.id=p_enrollment_id AND e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id
  FOR UPDATE;
  IF NOT FOUND OR v_enrollment.status NOT IN ('enrolled','returned_for_correction') THEN
    RAISE EXCEPTION 'Only your active or returned learning assignments can be submitted for verification.' USING errcode='42501';
  END IF;
  IF p_evidence_path IS NOT NULL THEN
    SELECT o.metadata->>'mimetype',
      CASE WHEN coalesce(o.metadata->>'size','') ~ '^[0-9]+$' THEN (o.metadata->>'size')::bigint ELSE NULL END
      INTO v_mime,v_size FROM storage.objects o
      WHERE o.bucket_id='learning-completion-evidence' AND o.name=p_evidence_path;
    IF NOT FOUND OR v_mime NOT IN ('application/pdf','image/png','image/jpeg')
       OR v_size IS NULL OR v_size<1 OR v_size>5242880
       OR lower(p_evidence_name) !~ (CASE v_mime WHEN 'application/pdf' THEN '\.pdf$'
         WHEN 'image/png' THEN '\.png$' ELSE '\.(jpg|jpeg)$' END) THEN
      RAISE EXCEPTION 'The uploaded evidence is unavailable or does not match its file type and size.' USING errcode='22023';
    END IF;
  END IF;

  v_event_type := CASE WHEN v_enrollment.status='returned_for_correction' THEN 'resubmitted' ELSE 'submitted' END;
  UPDATE public.learning_enrollments e SET status='pending_verification',
    completion_submitted_at=clock_timestamp(),completion_evidence_path=p_evidence_path,
    completion_evidence_name=p_evidence_name,completion_return_reason=NULL,
    completion_verified_at=NULL,completion_verified_by=NULL,completed_at=NULL,updated_at=clock_timestamp()
  WHERE e.id=v_enrollment.id AND e.tenant_id=p_tenant_id;
  INSERT INTO public.learning_completion_events(
    tenant_id,enrollment_id,event_type,actor_user_id,evidence_path,evidence_name
  ) VALUES (p_tenant_id,v_enrollment.id,v_event_type,auth.uid(),p_evidence_path,p_evidence_name)
  RETURNING id INTO v_event_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'learning.completion.'||v_event_type,'learning_enrollment',v_enrollment.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,'event_id',v_event_id,
      'has_evidence',p_evidence_path IS NOT NULL));
  RETURN jsonb_build_object('id',v_enrollment.id,'status','pending_verification',
    'submitted_at',clock_timestamp(),'event_id',v_event_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_resolve_learning_completion(
  p_tenant_id uuid,p_enrollment_id uuid,p_decision text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_enrollment public.learning_enrollments%ROWTYPE;
  v_event_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_decision_at timestamptz := clock_timestamp();
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('verified','returned_for_correction')
     OR p_reason IS NOT NULL AND length(p_reason)>1000
     OR p_decision='returned_for_correction' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Choose Verify or Return for Correction and provide a reason when returning.' USING errcode='22023';
  END IF;
  SELECT e.* INTO v_enrollment FROM public.learning_enrollments e
  WHERE e.id=p_enrollment_id AND e.tenant_id=p_tenant_id AND e.status='pending_verification'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This completion is no longer pending verification. Refresh the queue.' USING errcode='P0002';
  END IF;
  v_status := CASE WHEN p_decision='verified' THEN 'completed' ELSE 'returned_for_correction' END;
  UPDATE public.learning_enrollments e SET status=v_status,
    completed_at=CASE WHEN v_status='completed' THEN v_decision_at ELSE NULL END,
    completion_verified_at=CASE WHEN v_status='completed' THEN v_decision_at ELSE NULL END,
    completion_verified_by=CASE WHEN v_status='completed' THEN auth.uid() ELSE NULL END,
    completion_return_reason=CASE WHEN v_status='returned_for_correction' THEN v_reason ELSE NULL END,
    resolution_note=CASE WHEN v_status='returned_for_correction' THEN v_reason ELSE e.resolution_note END,
    updated_at=v_decision_at
  WHERE e.id=v_enrollment.id AND e.tenant_id=p_tenant_id;
  INSERT INTO public.learning_completion_events(
    tenant_id,enrollment_id,event_type,actor_user_id,reason,evidence_path,evidence_name,created_at
  ) VALUES (p_tenant_id,v_enrollment.id,p_decision,auth.uid(),v_reason,
    v_enrollment.completion_evidence_path,v_enrollment.completion_evidence_name,v_decision_at)
  RETURNING id INTO v_event_id;
  INSERT INTO public.learning_completion_notifications(
    tenant_id,recipient_employee_id,enrollment_id,event_id,kind
  ) VALUES (p_tenant_id,v_enrollment.employee_id,v_enrollment.id,v_event_id,p_decision);
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'learning.completion.'||p_decision,'learning_enrollment',v_enrollment.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_enrollment.employee_id,
      'event_id',v_event_id,'reason',v_reason));
  RETURN jsonb_build_object('id',v_enrollment.id,'status',v_status,
    'completed_at',CASE WHEN v_status='completed' THEN v_decision_at ELSE NULL END,
    'verified_by',CASE WHEN v_status='completed' THEN auth.uid() ELSE NULL END,
    'event_id',v_event_id);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_learning_completion_data(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_get_learning_completion_queue(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_employee_submit_learning_completion(uuid,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_resolve_learning_completion(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_learning_completion_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_get_learning_completion_queue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_learning_completion(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_resolve_learning_completion(uuid,uuid,text,text) TO authenticated;

DROP POLICY IF EXISTS learning_completion_evidence_insert ON storage.objects;
DROP POLICY IF EXISTS learning_completion_evidence_insert ON storage.objects;
CREATE POLICY learning_completion_evidence_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='learning-completion-evidence' AND public.is_live_session()
    AND (storage.foldername(storage.objects.name))[1]=(SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.tenants t
      JOIN public.learning_enrollments e ON e.tenant_id=t.id
      WHERE t.id::text=(storage.foldername(storage.objects.name))[2] AND t.is_active IS TRUE
        AND e.id::text=(storage.foldername(storage.objects.name))[3]
        AND e.employee_id=public.hris_own_employee_for_tenant(t.id)
        AND e.status IN ('enrolled','returned_for_correction')));
DROP POLICY IF EXISTS learning_completion_evidence_read ON storage.objects;
DROP POLICY IF EXISTS learning_completion_evidence_read ON storage.objects;
CREATE POLICY learning_completion_evidence_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='learning-completion-evidence' AND public.is_live_session()
    AND EXISTS (SELECT 1 FROM public.learning_enrollments e
      WHERE e.tenant_id::text=(storage.foldername(storage.objects.name))[2]
        AND e.id::text=(storage.foldername(storage.objects.name))[3]
        AND e.completion_evidence_path=storage.objects.name
        AND (e.employee_id=public.hris_own_employee_for_tenant(e.tenant_id)
          OR public.has_tenant_permission(e.tenant_id,'learning.manage'))));
DROP POLICY IF EXISTS learning_completion_evidence_delete_unattached ON storage.objects;
DROP POLICY IF EXISTS learning_completion_evidence_delete_unattached ON storage.objects;
CREATE POLICY learning_completion_evidence_delete_unattached ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='learning-completion-evidence' AND public.is_live_session()
    AND (storage.foldername(storage.objects.name))[1]=(SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.tenants t
      WHERE t.id::text=(storage.foldername(storage.objects.name))[2] AND t.is_active IS TRUE
        AND public.hris_own_employee_for_tenant(t.id) IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.learning_enrollments e
      WHERE e.completion_evidence_path=storage.objects.name));

-- Source fragment: supabase/migrations/20261014160001_hris_learning_completion_evidence_requirement.sql
-- Phase 12: let authorized learning managers set a program-level evidence
-- requirement and enforce it whenever an employee submits for verification.

ALTER TABLE public.learning_programs
  ADD COLUMN IF NOT EXISTS completion_evidence_required boolean NOT NULL DEFAULT false;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.hris_enforce_learning_completion_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_required boolean;
BEGIN
  IF NEW.status='pending_verification' AND OLD.status IN ('enrolled','returned_for_correction') THEN
    SELECT p.completion_evidence_required INTO v_required
    FROM public.learning_programs p
    WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.program_id;
    IF coalesce(v_required,false) AND NEW.completion_evidence_path IS NULL THEN
      RAISE EXCEPTION 'Supporting evidence is required for this learning program.' USING errcode='22023';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.hris_enforce_learning_completion_evidence() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS learning_completion_requires_program_evidence ON public.learning_enrollments;
DROP TRIGGER IF EXISTS learning_completion_requires_program_evidence ON public.learning_enrollments;
CREATE TRIGGER learning_completion_requires_program_evidence
  BEFORE UPDATE OF status ON public.learning_enrollments
  FOR EACH ROW EXECUTE FUNCTION private.hris_enforce_learning_completion_evidence();

CREATE OR REPLACE FUNCTION public.hris_get_learning_admin_catalog(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_programs jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT coalesce(jsonb_agg(program_row.value ORDER BY program_row.title,program_row.id),'[]'::jsonb)
    INTO v_programs
  FROM (
    SELECT p.id,p.title,jsonb_build_object(
      'id',p.id,'title',p.title,'description',p.description,'category',p.category,
      'provider',p.provider,'delivery_mode',p.delivery_mode,'duration_hours',p.duration_hours,
      'self_enrollment',p.self_enrollment,'target_skills',p.target_skills,'active',p.active,
      'completion_evidence_required',p.completion_evidence_required,
      'enrollment_count',(SELECT count(*)::integer FROM public.learning_enrollments e
        WHERE e.tenant_id=p.tenant_id AND e.program_id=p.id AND e.status IN ('requested','enrolled')),
      'sessions',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',s.id,'trainer_name',s.trainer_name,'start_at',s.start_at,'end_at',s.end_at,
        'location',s.location,'meeting_url',s.meeting_url,'capacity',s.capacity,
        'enrollment_deadline',s.enrollment_deadline,'status',s.status,
        'enrolled_count',(SELECT count(*)::integer FROM public.learning_enrollments e
          WHERE e.tenant_id=s.tenant_id AND e.session_id=s.id AND e.status='enrolled')
      ) ORDER BY s.start_at NULLS LAST,s.created_at,s.id) FROM public.learning_sessions s
        WHERE s.tenant_id=p.tenant_id AND s.program_id=p.id),'[]'::jsonb)
    ) AS value
    FROM public.learning_programs p WHERE p.tenant_id=p_tenant_id
  ) program_row;
  RETURN coalesce(v_programs,'[]'::jsonb);
END
$function$;

-- Keep the established save contract for existing consumers. This overload
-- adds one manager-controlled field and delegates the original validation and
-- write path to the existing permission-checked RPC in the same transaction.
CREATE OR REPLACE FUNCTION public.hris_save_learning_program(
  p_tenant_id uuid,p_program_id uuid,p_title text,p_description text,p_category text,
  p_provider text,p_delivery_mode text,p_duration_hours numeric,p_self_enrollment boolean,
  p_target_skills text[],p_active boolean,p_completion_evidence_required boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_saved jsonb;
  v_program_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_completion_evidence_required IS NULL THEN
    RAISE EXCEPTION 'Choose whether completion evidence is required.' USING errcode='22023';
  END IF;
  v_saved := public.hris_save_learning_program(
    p_tenant_id,p_program_id,p_title,p_description,p_category,p_provider,p_delivery_mode,
    p_duration_hours,p_self_enrollment,p_target_skills,p_active
  );
  v_program_id := (v_saved->>'id')::uuid;
  UPDATE public.learning_programs p
  SET completion_evidence_required=p_completion_evidence_required,updated_at=now()
  WHERE p.tenant_id=p_tenant_id AND p.id=v_program_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Learning program not found in this organization.' USING errcode='P0002';
  END IF;
  RETURN v_saved || jsonb_build_object('completion_evidence_required',p_completion_evidence_required);
END
$function$;
COMMENT ON FUNCTION public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean)
  IS 'Tenant learning.manage-only program save with optional completion evidence requirement; preserves the existing save contract.';

CREATE OR REPLACE FUNCTION public.hris_get_my_learning_context(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_programs jsonb;
  v_enrollments jsonb;
  v_skills jsonb;
BEGIN
  IF NOT public.hris_can_read_learning_catalog(p_tenant_id) THEN
    RAISE EXCEPTION 'Learning access for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);

  SELECT coalesce(jsonb_agg(program_row.value ORDER BY program_row.title),'[]'::jsonb)
    INTO v_programs
  FROM (
    SELECT p.title,jsonb_build_object(
      'id',p.id,'title',p.title,'description',p.description,'category',p.category,
      'provider',p.provider,'delivery_mode',p.delivery_mode,'duration_hours',p.duration_hours,
      'self_enrollment',p.self_enrollment,'target_skills',p.target_skills,
      'completion_evidence_required',p.completion_evidence_required,
      'sessions',coalesce((
        SELECT jsonb_agg(session_row.value ORDER BY session_row.start_at NULLS LAST)
        FROM (
          SELECT s.start_at,jsonb_build_object(
            'id',s.id,'trainer_name',s.trainer_name,'start_at',s.start_at,'end_at',s.end_at,
            'location',s.location,'meeting_url',s.meeting_url,'capacity',s.capacity,
            'enrollment_deadline',s.enrollment_deadline,'status',s.status,
            'enrolled_count',seat_count.enrolled_count,
            'available_seats',CASE WHEN s.capacity IS NULL THEN NULL
              ELSE greatest(s.capacity-seat_count.enrolled_count,0) END
          ) AS value
          FROM public.learning_sessions s
          CROSS JOIN LATERAL (
            SELECT count(*)::integer AS enrolled_count
            FROM public.learning_enrollments e
            WHERE e.tenant_id=s.tenant_id AND e.session_id=s.id AND e.status='enrolled'
          ) seat_count
          WHERE s.tenant_id=p.tenant_id AND s.program_id=p.id AND s.status='scheduled'
        ) session_row
      ),'[]'::jsonb)
    ) AS value
    FROM public.learning_programs p
    WHERE p.tenant_id=p_tenant_id AND p.active IS TRUE
  ) program_row;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'program_id',e.program_id,'program_title',p.title,
    'session_id',e.session_id,'session_start_at',s.start_at,'session_location',s.location,
    'source',e.source,'status',e.status,'mandatory',e.mandatory,'due_date',e.due_date,
    'recommendation_reason',e.recommendation_reason,'skill_gap',e.skill_gap,
    'requested_at',e.requested_at,'resolved_at',e.resolved_at,
    'resolution_note',e.resolution_note,'completed_at',e.completed_at,
    'certificate_url',e.certificate_url,'created_at',e.created_at
  ) ORDER BY e.created_at DESC),'[]'::jsonb)
    INTO v_enrollments
  FROM public.learning_enrollments e
  JOIN public.learning_programs p ON p.id=e.program_id AND p.tenant_id=e.tenant_id
  LEFT JOIN public.learning_sessions s ON s.id=e.session_id AND s.tenant_id=e.tenant_id
  WHERE e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'skill_name',s.skill_name,'proficiency',s.proficiency,'verified',s.verified
  ) ORDER BY s.skill_name,s.id),'[]'::jsonb)
    INTO v_skills
  FROM public.employee_skills s
  JOIN public.employees e ON e.id=s.employee_id AND e.tenant_id=p_tenant_id
  WHERE s.employee_id=v_employee_id;

  RETURN jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'programs',coalesce(v_programs,'[]'::jsonb),'enrollments',coalesce(v_enrollments,'[]'::jsonb),
    'skills',coalesce(v_skills,'[]'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_my_learning_completion_data(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_enrollments jsonb;
  v_notifications jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'status',e.status,'completion_evidence_required',p.completion_evidence_required,
    'completion_submitted_at',e.completion_submitted_at,
    'completion_evidence_name',e.completion_evidence_name,
    'completion_verified_at',e.completion_verified_at,
    'completion_verified_by',e.completion_verified_by,
    'completion_verified_by_name',reviewer.full_name,
    'completion_return_reason',e.completion_return_reason,
    'completion_history',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'event_type',ce.event_type,'reason',ce.reason,'evidence_name',ce.evidence_name,
        'created_at',ce.created_at
      ) ORDER BY ce.created_at,ce.id)
      FROM public.learning_completion_events ce
      WHERE ce.tenant_id=e.tenant_id AND ce.enrollment_id=e.id
    ),'[]'::jsonb)
  ) ORDER BY e.created_at DESC,e.id),'[]'::jsonb)
    INTO v_enrollments
  FROM public.learning_enrollments e
  JOIN public.learning_programs p ON p.tenant_id=e.tenant_id AND p.id=e.program_id
  LEFT JOIN public.employees reviewer
    ON reviewer.tenant_id=e.tenant_id AND reviewer.user_id=e.completion_verified_by
  WHERE e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'kind',n.kind,'enrollment_id',n.enrollment_id,
    'program_title',p.title,'created_at',n.created_at
  ) ORDER BY n.created_at DESC,n.id DESC),'[]'::jsonb)
    INTO v_notifications
  FROM public.learning_completion_notifications n
  JOIN public.learning_enrollments e ON e.tenant_id=n.tenant_id AND e.id=n.enrollment_id
  JOIN public.learning_programs p ON p.tenant_id=e.tenant_id AND p.id=e.program_id
  WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id;

  RETURN jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'enrollments',coalesce(v_enrollments,'[]'::jsonb),
    'notifications',coalesce(v_notifications,'[]'::jsonb));
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_learning_admin_catalog(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_learning_admin_catalog(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean) TO authenticated,service_role;

-- Source fragment: supabase/migrations/20261015022305_hris_travel_decision_notifications.sql
-- Employee-owned alerts for tenant-authorized travel decisions.
-- Travel decisions remain transactional and do not add read-state or email policy.

CREATE SCHEMA IF NOT EXISTS private;
CREATE UNIQUE INDEX IF NOT EXISTS travel_requests_tenant_id_id_key
  ON public.travel_requests(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS travel_status_history_tenant_id_id_key
  ON public.travel_status_history(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_id_id_key
  ON public.employees(tenant_id,id);

CREATE TABLE IF NOT EXISTS public.travel_request_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  travel_request_id uuid NOT NULL,
  travel_status_history_id uuid NOT NULL,
  recipient_employee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('approved','rejected')),
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,recipient_employee_id,travel_status_history_id),
  CONSTRAINT travel_request_notifications_request_fk
    FOREIGN KEY (tenant_id,travel_request_id)
    REFERENCES public.travel_requests(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT travel_request_notifications_history_fk
    FOREIGN KEY (tenant_id,travel_status_history_id)
    REFERENCES public.travel_status_history(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT travel_request_notifications_employee_fk
    FOREIGN KEY (tenant_id,recipient_employee_id)
    REFERENCES public.employees(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS travel_request_notifications_employee_feed_idx ON public.travel_request_notifications(tenant_id,recipient_employee_id,created_at DESC,id DESC);

ALTER TABLE public.travel_request_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.travel_request_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.travel_request_notifications TO authenticated;
DROP POLICY IF EXISTS travel_request_notifications_owner_read ON public.travel_request_notifications;
DROP POLICY IF EXISTS travel_request_notifications_owner_read ON public.travel_request_notifications;
CREATE POLICY travel_request_notifications_owner_read ON public.travel_request_notifications FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND public.hris_own_employee_for_tenant(tenant_id)=recipient_employee_id);

CREATE OR REPLACE FUNCTION private.hris_create_travel_decision_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid;
BEGIN
  IF NEW.previous_status='submitted' AND NEW.new_status IN ('approved','rejected') THEN
    SELECT r.employee_id INTO v_employee_id
    FROM public.travel_requests r
    WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.travel_request_id
      AND r.status=NEW.new_status;
    IF v_employee_id IS NULL THEN
      RAISE EXCEPTION 'Travel decision history must match an employee request.' USING errcode='23503';
    END IF;
    INSERT INTO public.travel_request_notifications(
      tenant_id,travel_request_id,travel_status_history_id,recipient_employee_id,kind,created_at
    ) VALUES (
      NEW.tenant_id,NEW.travel_request_id,NEW.id,v_employee_id,NEW.new_status,NEW.created_at
    ) ON CONFLICT (tenant_id,recipient_employee_id,travel_status_history_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.hris_create_travel_decision_notification() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS travel_decision_notification_after_history ON public.travel_status_history;
DROP TRIGGER IF EXISTS travel_decision_notification_after_history ON public.travel_status_history;
CREATE TRIGGER travel_decision_notification_after_history
  AFTER INSERT ON public.travel_status_history
  FOR EACH ROW EXECUTE FUNCTION private.hris_create_travel_decision_notification();

-- Source fragment: supabase/migrations/20261016230201_hris_employee_roster_notifications.sql
-- Employee-owned roster reads and assignment-created notification history.
-- The assignment RPC remains governed by the existing attendance.manage rule.

CREATE SCHEMA IF NOT EXISTS private;
CREATE UNIQUE INDEX IF NOT EXISTS employee_shift_assignments_tenant_id_id_key
  ON public.employee_shift_assignments(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_id_id_key
  ON public.employees(tenant_id,id);

CREATE TABLE IF NOT EXISTS public.roster_change_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_shift_assignment_id uuid NOT NULL,
  recipient_employee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind='assigned'),
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,recipient_employee_id,employee_shift_assignment_id),
  CONSTRAINT roster_change_notifications_assignment_fk
    FOREIGN KEY (tenant_id,employee_shift_assignment_id)
    REFERENCES public.employee_shift_assignments(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT roster_change_notifications_employee_fk
    FOREIGN KEY (tenant_id,recipient_employee_id)
    REFERENCES public.employees(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS roster_change_notifications_employee_feed_idx ON public.roster_change_notifications(tenant_id,recipient_employee_id,created_at DESC,id DESC);

ALTER TABLE public.roster_change_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.roster_change_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.roster_change_notifications TO authenticated;
DROP POLICY IF EXISTS roster_change_notifications_owner_read ON public.roster_change_notifications;
DROP POLICY IF EXISTS roster_change_notifications_owner_read ON public.roster_change_notifications;
CREATE POLICY roster_change_notifications_owner_read ON public.roster_change_notifications FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND public.hris_own_employee_for_tenant(tenant_id)=recipient_employee_id
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.is_active IS TRUE));

CREATE OR REPLACE FUNCTION private.hris_create_roster_assignment_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid;
BEGIN
  SELECT e.id INTO v_employee_id
  FROM public.employees e
  JOIN public.shifts s ON s.tenant_id=e.tenant_id AND s.id=NEW.shift_id
  JOIN public.tenants t ON t.id=e.tenant_id AND t.is_active IS TRUE
  WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.employee_id AND e.user_id IS NOT NULL;

  IF v_employee_id IS NOT NULL THEN
    INSERT INTO public.roster_change_notifications(
      tenant_id,employee_shift_assignment_id,recipient_employee_id,kind,created_at
    ) VALUES (NEW.tenant_id,NEW.id,v_employee_id,'assigned',NEW.created_at)
    ON CONFLICT (tenant_id,recipient_employee_id,employee_shift_assignment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.hris_create_roster_assignment_notification() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS roster_assignment_notification_after_insert ON public.employee_shift_assignments;
DROP TRIGGER IF EXISTS roster_assignment_notification_after_insert ON public.employee_shift_assignments;
CREATE TRIGGER roster_assignment_notification_after_insert
  AFTER INSERT ON public.employee_shift_assignments
  FOR EACH ROW EXECUTE FUNCTION private.hris_create_roster_assignment_notification();

CREATE OR REPLACE FUNCTION private.hris_get_my_shift_roster(
  p_tenant_id uuid,
  p_start date,
  p_end date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_assignments jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end-p_start > 30 THEN
    RAISE EXCEPTION 'Choose a valid roster date range of 31 days or fewer.' USING errcode='22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'assignment_id',a.id,
    'assignment_date',a.assignment_date,
    'assignment_status',a.status,
    'shift_id',s.id,
    'shift_name',s.name,
    'shift_code',s.code,
    'start_time',s.start_time,
    'end_time',s.end_time,
    'break_minutes',s.break_minutes,
    'grace_minutes',s.grace_minutes,
    'weekly_off_days',s.weekly_off_days
  ) ORDER BY a.assignment_date,a.id), '[]'::jsonb)
  INTO v_assignments
  FROM public.employee_shift_assignments a
  JOIN public.shifts s ON s.tenant_id=a.tenant_id AND s.id=a.shift_id
  WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee_id
    AND a.assignment_date BETWEEN p_start AND p_end;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,
    'employee_id',v_employee_id,
    'start_date',p_start,
    'end_date',p_end,
    'assignments',v_assignments
  );
END
$function$;
REVOKE ALL ON FUNCTION private.hris_get_my_shift_roster(uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.hris_get_my_shift_roster(uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_my_shift_roster(
  p_tenant_id uuid,
  p_start date,
  p_end date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.hris_get_my_shift_roster(p_tenant_id,p_start,p_end)
$function$;
REVOKE ALL ON FUNCTION public.hris_get_my_shift_roster(uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_shift_roster(uuid,date,date) TO authenticated;

-- Source fragment: supabase/migrations/20261017095321_roster_shift_change_history.sql
-- Keep a durable employee-visible record when an existing roster assignment
-- changes shift. Assignment status and date remain unchanged.

CREATE UNIQUE INDEX IF NOT EXISTS shifts_tenant_id_id_key
  ON public.shifts(tenant_id,id);

CREATE TABLE IF NOT EXISTS public.employee_shift_assignment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_shift_assignment_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  previous_shift_id uuid NOT NULL,
  new_shift_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_shift_assignment_changes_tenant_id_id_key UNIQUE (tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_assignment_fk
    FOREIGN KEY (tenant_id,employee_shift_assignment_id)
    REFERENCES public.employee_shift_assignments(tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_employee_fk
    FOREIGN KEY (tenant_id,employee_id)
    REFERENCES public.employees(tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_previous_shift_fk
    FOREIGN KEY (tenant_id,previous_shift_id)
    REFERENCES public.shifts(tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_new_shift_fk
    FOREIGN KEY (tenant_id,new_shift_id)
    REFERENCES public.shifts(tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_distinct_shifts
    CHECK (previous_shift_id <> new_shift_id)
);

CREATE INDEX IF NOT EXISTS employee_shift_assignment_changes_employee_date_idx ON public.employee_shift_assignment_changes(tenant_id,employee_id,changed_at DESC,id DESC);

ALTER TABLE public.employee_shift_assignment_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_shift_assignment_changes FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.roster_change_notifications
  DROP CONSTRAINT IF EXISTS roster_change_notifications_kind_check;
ALTER TABLE public.roster_change_notifications
  ADD CONSTRAINT roster_change_notifications_kind_check CHECK (kind IN ('assigned','changed'));

CREATE OR REPLACE FUNCTION private.hris_record_employee_shift_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid;
BEGIN
  IF NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated attendance manager is required for roster changes.' USING errcode='42501';
  END IF;

  SELECT e.id INTO v_employee_id
  FROM public.employees e
  JOIN public.tenants t ON t.id=e.tenant_id AND t.is_active IS TRUE
  WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.employee_id AND e.user_id IS NOT NULL;

  INSERT INTO public.employee_shift_assignment_changes(
    tenant_id,employee_shift_assignment_id,employee_id,previous_shift_id,new_shift_id,changed_by,changed_at
  ) VALUES (
    NEW.tenant_id,NEW.id,NEW.employee_id,OLD.shift_id,NEW.shift_id,auth.uid(),clock_timestamp()
  );

  IF v_employee_id IS NOT NULL THEN
    UPDATE public.roster_change_notifications n
    SET kind='changed',created_at=clock_timestamp()
    WHERE n.tenant_id=NEW.tenant_id AND n.recipient_employee_id=v_employee_id
      AND n.employee_shift_assignment_id=NEW.id;
    IF NOT FOUND THEN
      INSERT INTO public.roster_change_notifications(
        tenant_id,employee_shift_assignment_id,recipient_employee_id,kind,created_at
      ) VALUES (NEW.tenant_id,NEW.id,v_employee_id,'changed',clock_timestamp())
      ON CONFLICT (tenant_id,recipient_employee_id,employee_shift_assignment_id)
      DO UPDATE SET kind='changed',created_at=excluded.created_at;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.hris_record_employee_shift_change() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS employee_shift_assignment_change_history ON public.employee_shift_assignments;
DROP TRIGGER IF EXISTS employee_shift_assignment_change_history ON public.employee_shift_assignments;
CREATE TRIGGER employee_shift_assignment_change_history
  AFTER UPDATE OF shift_id ON public.employee_shift_assignments
  FOR EACH ROW EXECUTE FUNCTION private.hris_record_employee_shift_change();

CREATE OR REPLACE FUNCTION public.hris_change_tenant_employee_shift(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_new_shift_id uuid,
  p_expected_shift_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_current_shift_id uuid;
  v_updated_id uuid;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'attendance.manage') THEN
    RAISE EXCEPTION 'Tenant attendance management permission required.' USING errcode='42501';
  END IF;
  IF p_tenant_id IS NULL OR p_assignment_id IS NULL OR p_new_shift_id IS NULL OR p_expected_shift_id IS NULL THEN
    RAISE EXCEPTION 'Choose an assignment and replacement shift.' USING errcode='22023';
  END IF;

  SELECT a.employee_id,a.shift_id INTO v_employee_id,v_current_shift_id
  FROM public.employee_shift_assignments a
  WHERE a.tenant_id=p_tenant_id AND a.id=p_assignment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roster assignment not found in the authorized tenant.' USING errcode='P0002';
  END IF;
  IF v_current_shift_id IS DISTINCT FROM p_expected_shift_id THEN
    RAISE EXCEPTION 'This roster assignment changed since it was loaded. Refresh and try again.' USING errcode='40001';
  END IF;
  IF p_new_shift_id=v_current_shift_id THEN
    RAISE EXCEPTION 'Choose a different shift.' USING errcode='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.tenant_id=p_tenant_id AND e.id=v_employee_id
      AND e.employment_status NOT IN ('resigned','terminated')
  ) THEN
    RAISE EXCEPTION 'Active employee not found in the authorized tenant.' USING errcode='P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.tenant_id=p_tenant_id AND s.id=p_new_shift_id AND s.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active replacement shift not found in the authorized tenant.' USING errcode='P0002';
  END IF;

  UPDATE public.employee_shift_assignments a
  SET shift_id=p_new_shift_id
  WHERE a.tenant_id=p_tenant_id AND a.id=p_assignment_id AND a.shift_id=p_expected_shift_id
  RETURNING a.id INTO v_updated_id;
  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'This roster assignment changed since it was loaded. Refresh and try again.' USING errcode='40001';
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'shift.assignment.changed','employee_shift_assignment',v_updated_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
      'assignment_id',v_updated_id,'previous_shift_id',v_current_shift_id,
      'new_shift_id',p_new_shift_id));
  RETURN v_updated_id;
END
$function$;
REVOKE ALL ON FUNCTION public.hris_change_tenant_employee_shift(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hris_change_tenant_employee_shift(uuid,uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_my_shift_changes(
  p_tenant_id uuid,
  p_start date,
  p_end date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_changes jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>30 THEN
    RAISE EXCEPTION 'Choose a valid roster date range of 31 days or fewer.' USING errcode='22023';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'change_id',c.id,'assignment_id',a.id,'assignment_date',a.assignment_date,
    'previous_shift_name',old_shift.name,'new_shift_name',new_shift.name,'changed_at',c.changed_at
  ) ORDER BY c.changed_at DESC,c.id DESC),'[]'::jsonb)
  INTO v_changes
  FROM public.employee_shift_assignment_changes c
  JOIN public.employee_shift_assignments a
    ON a.tenant_id=c.tenant_id AND a.id=c.employee_shift_assignment_id AND a.employee_id=c.employee_id
  JOIN public.shifts old_shift ON old_shift.tenant_id=c.tenant_id AND old_shift.id=c.previous_shift_id
  JOIN public.shifts new_shift ON new_shift.tenant_id=c.tenant_id AND new_shift.id=c.new_shift_id
  WHERE c.tenant_id=p_tenant_id AND c.employee_id=v_employee_id
    AND a.assignment_date BETWEEN p_start AND p_end;

  RETURN v_changes;
END
$function$;
REVOKE ALL ON FUNCTION public.hris_get_my_shift_changes(uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_shift_changes(uuid,date,date) TO authenticated;

COMMENT ON FUNCTION public.hris_change_tenant_employee_shift(uuid,uuid,uuid,uuid)
  IS 'Changes only the shift on an existing same-tenant roster assignment for attendance.manage; expected-shift matching prevents stale overwrites. Date and status are preserved.';
COMMENT ON FUNCTION public.hris_get_my_shift_changes(uuid,date,date)
  IS 'Returns append-only shift-change history for the authenticated employee in their active tenant and requested date range.';

-- Source fragment: supabase/migrations/20261017010000_hris_employee_document_self_service.sql
-- Employee self-service projection for the existing document vault.
-- It exposes only the signed-in employee's records in the requested active
-- tenant. Upload and replacement remain on the existing unimplemented path.

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

-- Source fragment: supabase/migrations/20261017020000_hris_employee_identity_card.sql
-- Employee self-service identity card. The linked employee helper already
-- excludes resigned and terminated employment records; this read-only RPC
-- uses the same linked employee identity as the existing employee
-- self-service dashboard. Employee Auth links do not require an admin
-- membership row; the tenant itself must still be active.

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

-- Source fragment: supabase/migrations/20261017030000_hris_employee_announcement_audience.sql
-- Enforce employee announcement targeting through existing tenant and
-- department relationships. Location targeting remains hidden from employees
-- until the schema has an approved normalized employee/location relationship.

-- Platform Super Admin notice access is anchored to an explicit active tenant
-- membership. Global admin status or global role grants alone never satisfy it.
CREATE OR REPLACE FUNCTION public.hris_notices_super_admin_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.admin_users au
      JOIN auth.users u ON u.id = au.user_id
      WHERE au.user_id = auth.uid()
        AND au.active IS TRUE
        AND au.is_super_admin IS TRUE
        AND u.email_confirmed_at IS NOT NULL
        AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
    )
    AND EXISTS (
      SELECT 1
      FROM public.tenant_memberships m
      JOIN public.tenants t ON t.id = m.tenant_id AND t.is_active IS TRUE
      JOIN public.roles r ON r.id = m.role AND r.active IS TRUE
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = p_tenant_id
        AND lower(m.status) = 'active'
    )
$function$;
REVOKE ALL ON FUNCTION public.hris_notices_super_admin_tenant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_notices_super_admin_tenant_member(uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS hris_notices_membership_guard ON public.notices;
DROP POLICY IF EXISTS hris_notices_membership_guard ON public.notices;
CREATE POLICY hris_notices_membership_guard ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.hris_notices_super_admin_tenant_member(tenant_id)
      OR public.has_tenant_permission(tenant_id, 'notices.view')
      OR public.has_tenant_permission(tenant_id, 'notices.manage')
      OR (
        active IS TRUE
        AND EXISTS (
          SELECT 1 FROM public.tenants t
          WHERE t.id=notices.tenant_id AND t.is_active IS TRUE
        )
        AND (
          (
            audience_type = 'all'
            AND (
              public.hris_is_active_tenant_member(tenant_id)
              OR public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
            )
          )
          OR (
            audience_type = 'department'
            AND audience_id IS NOT NULL
            AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.employees e
              WHERE e.id = public.hris_own_employee_for_tenant(notices.tenant_id)
                AND e.tenant_id = notices.tenant_id
                AND e.department_id = notices.audience_id
            )
          )
        )
      )
    )
  );

-- Source fragment: supabase/migrations/20261017040000_hris_employee_dashboard_work_identity.sql
-- Add the linked employee ID to the authenticated employee's own dashboard projection.
-- The RPC continues to bind identity through hris_own_employee_for_tenant.

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
      'id',e.id,
      'full_name',e.full_name,
      'employee_number',e.employee_number,
      'official_email',e.official_email,
      'official_phone',e.official_phone,
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

-- Source fragment: supabase/migrations/20261017050000_hris_employee_dashboard_team_identity.sql
-- Add the employee's own same-tenant team name to the Figma-aligned profile projection.
-- The employee team join is explicitly tenant-bound because employees.team_id is a legacy single-column FK.

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
      'id',e.id,
      'full_name',e.full_name,
      'employee_number',e.employee_number,
      'official_email',e.official_email,
      'official_phone',e.official_phone,
      'designation_title',ds.title,
      'team_name',t.name,
      'department_name',d.name
    )
    INTO v_gender,v_weekly_off,v_employee_profile
  FROM public.employees e
  LEFT JOIN public.teams t ON t.id=e.team_id AND t.tenant_id=e.tenant_id
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

-- Source fragment: supabase/migrations/20261017060000_hris_employee_dashboard_pending_requests.sql
-- Return only the authenticated employee's open requests for the dashboard.
-- Request descriptions, amounts, reasons, notes, and evidence stay in their
-- existing detail/history workflows and are not duplicated into this summary.

CREATE OR REPLACE FUNCTION public.hris_get_my_pending_requests(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_requests jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode='42501';
  END IF;
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'An active organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee link is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'kind',q.kind,'status',q.status,'requested_at',q.requested_at
  ) ORDER BY q.requested_at DESC NULLS LAST,q.kind,q.id),'[]'::jsonb)
    INTO v_requests
  FROM (
    SELECT r.id,'leave'::text AS kind,r.status,r.submitted_at AS requested_at
    FROM public.leave_requests r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id AND r.status='pending'
    UNION ALL
    SELECT r.id,'attendance'::text,r.status,r.requested_at
    FROM public.attendance_corrections r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id AND r.status='pending'
    UNION ALL
    SELECT r.id,'expense'::text,r.status,r.submitted_at
    FROM public.expense_claims r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id AND r.status='submitted'
    UNION ALL
    SELECT r.id,'travel'::text,r.status,r.submitted_at
    FROM public.travel_requests r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id AND r.status='submitted'
    UNION ALL
    SELECT r.id,'service'::text,r.status,r.submitted_at
    FROM public.service_requests r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
      AND r.status IN ('pending','in_progress')
    UNION ALL
    SELECT r.id,'learning'::text,r.status,coalesce(r.requested_at,r.created_at)
    FROM public.learning_enrollments r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id AND r.status='requested'
  ) q;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'employee_id',v_employee_id,'requests',v_requests
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_pending_requests(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_pending_requests(uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.hris_get_my_pending_requests(uuid) IS
  'Returns only the active employee’s tenant-bound open request IDs, existing status values and request dates for the personal dashboard.';

-- Source fragment: supabase/migrations/20261017060001_hris_employee_unavailable_leave_type_reason.sql
-- Explain active leave types excluded by the existing employee-profile eligibility rule.
-- Return no employee profile value or restricted policy field; request options remain eligible-only.

CREATE OR REPLACE FUNCTION public.hris_get_my_dashboard_data(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
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
      'id',e.id,
      'full_name',e.full_name,
      'employee_number',e.employee_number,
      'official_email',e.official_email,
      'official_phone',e.official_phone,
      'designation_title',ds.title,
      'team_name',t.name,
      'department_name',d.name
    )
    INTO v_gender,v_weekly_off,v_employee_profile
  FROM public.employees e
  LEFT JOIN public.teams t ON t.id=e.team_id AND t.tenant_id=e.tenant_id
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
    'unavailable_leave_types',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',lt.id,'name',lt.name,
        'availability_reason_code','profile_eligibility'
      ) ORDER BY lt.name)
      FROM public.leave_types lt
      WHERE lt.tenant_id=p_tenant_id AND lt.active IS TRUE
        AND lt.applicable_gender IS NOT NULL
        AND upper(lt.applicable_gender)<>upper(coalesce(v_gender,''))
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

REVOKE ALL ON FUNCTION public.hris_get_my_dashboard_data(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_dashboard_data(uuid) TO authenticated,service_role;

-- Source fragment: supabase/migrations/20261017074518_hris_employee_attendance_correction_existing_record.sql
-- Attendance corrections must refer to a persisted attendance row. This
-- protects the self-service RPC from creating new attendance through a
-- manager-approved correction request.
CREATE OR REPLACE FUNCTION public.hris_employee_submit_attendance_correction(
  p_tenant_id uuid, p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_date date := nullif(p_payload->>'attendance_date','')::date;
  v_check_in_time time := nullif(p_payload->>'check_in_time','')::time;
  v_check_out_time time := nullif(p_payload->>'check_out_time','')::time;
  v_work_mode text := nullif(btrim(coalesce(p_payload->>'work_mode','')),'');
  v_client_name text := nullif(btrim(coalesce(p_payload->>'client_name','')),'');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_check_in timestamptz;
  v_check_out timestamptz;
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
  IF v_date IS NULL OR v_reason IS NULL THEN
    RAISE EXCEPTION 'Attendance date and reason are required.' USING errcode='22000';
  END IF;
  IF v_check_in_time IS NULL AND v_check_out_time IS NULL
     AND v_work_mode IS NULL AND v_client_name IS NULL THEN
    RAISE EXCEPTION 'Provide at least one attendance field to correct.' USING errcode='22000';
  END IF;
  IF v_work_mode IS NOT NULL AND v_work_mode NOT IN ('office','home','client_meeting') THEN
    RAISE EXCEPTION 'Choose a supported work location.' USING errcode='22000';
  END IF;
  IF v_check_in_time IS NOT NULL AND v_check_out_time IS NOT NULL
     AND v_check_out_time < v_check_in_time THEN
    RAISE EXCEPTION 'Check-out must be after check-in.' USING errcode='22000';
  END IF;

  PERFORM 1 FROM public.attendance_records a
  WHERE a.tenant_id=p_tenant_id AND a.employee_id=v_employee
    AND a.attendance_date=v_date
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found for correction.' USING errcode='P0002';
  END IF;

  v_check_in := CASE WHEN v_check_in_time IS NULL THEN NULL
    ELSE (v_date + v_check_in_time) AT TIME ZONE v_timezone END;
  v_check_out := CASE WHEN v_check_out_time IS NULL THEN NULL
    ELSE (v_date + v_check_out_time) AT TIME ZONE v_timezone END;

  INSERT INTO public.attendance_corrections(
    id,tenant_id,employee_id,attendance_date,requested_check_in,
    requested_check_out,requested_work_mode,client_name,reason,status,requested_by
  ) VALUES (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_employee,v_date,v_check_in,
    v_check_out,v_work_mode,v_client_name,v_reason,'pending',auth.uid()
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'attendance.correction.submitted','attendance_correction',v_request_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee,'attendance_date',v_date));
  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb) TO authenticated, service_role;

-- Source fragment: supabase/migrations/20261017092147_employee_directory_team_filter.sql
-- Add a tenant-scoped team filter without changing the established directory RPC contract.

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

-- Source fragment: supabase/migrations/20261017100000_employee_profile_change_request_tenant_scope.sql
-- E02 profile requests must resolve authorization from the requested active
-- tenant, not the legacy single-tenant Synesis helper.

CREATE OR REPLACE FUNCTION public.hris_profile_change_active_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      JOIN public.tenant_memberships m
        ON m.tenant_id = t.id
       AND m.user_id = auth.uid()
       AND lower(m.status) = 'active'
      JOIN public.roles r ON r.id = m.role AND r.active IS TRUE
      WHERE t.id = p_tenant_id AND t.is_active IS TRUE
    )
$function$;
REVOKE ALL ON FUNCTION public.hris_profile_change_active_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_profile_change_active_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS employee_profile_change_read_own_or_authorized_review
  ON public.employee_profile_change_requests;
DROP POLICY IF EXISTS employee_profile_change_read_own_or_authorized_review ON public.employee_profile_change_requests;
CREATE POLICY employee_profile_change_read_own_or_authorized_review ON public.employee_profile_change_requests
  FOR SELECT TO authenticated
  USING (
    public.hris_profile_change_active_member(tenant_id)
    AND (
      employee_id = public.hris_own_employee_for_tenant(tenant_id)
      OR public.has_tenant_permission(tenant_id, 'self_service.manage')
    )
  );

DROP FUNCTION IF EXISTS public.employee_submit_profile_change_request(text, text, text);
DROP FUNCTION IF EXISTS public.employee_get_my_profile_change_requests();
DROP FUNCTION IF EXISTS public.admin_list_profile_change_requests();
DROP FUNCTION IF EXISTS public.admin_review_profile_change_request(uuid, text, text);

CREATE OR REPLACE FUNCTION public.employee_submit_profile_change_request(
  p_tenant_id uuid,
  p_field_key text,
  p_requested_value text,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE
  v_employee uuid := public.hris_own_employee_for_tenant(p_tenant_id);
  v_value text := nullif(btrim(coalesce(p_requested_value, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current text;
  v_id uuid;
BEGIN
  IF NOT public.hris_profile_change_active_member(p_tenant_id) OR v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee membership is required.' USING errcode = '42501';
  END IF;
  IF p_field_key IS NULL OR p_field_key NOT IN (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation',
    'father_name', 'mother_name', 'birthplace', 'blood_group', 'religion',
    'nid_number', 'passport_number', 'etin_number'
  ) THEN
    RAISE EXCEPTION 'This profile field is not available for an employee change request.' USING errcode = '22023';
  END IF;
  IF v_value IS NULL OR length(v_value) > 500 THEN
    RAISE EXCEPTION 'Enter a proposed value of 1 to 500 characters.' USING errcode = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Enter a reason of 1 to 1000 characters.' USING errcode = '22023';
  END IF;
  IF p_field_key IN ('official_email', 'personal_email')
     AND v_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING errcode = '22023';
  END IF;

  SELECT CASE p_field_key
    WHEN 'full_name' THEN e.full_name
    WHEN 'official_email' THEN e.official_email
    WHEN 'personal_email' THEN e.personal_email
    WHEN 'official_phone' THEN e.official_phone
    WHEN 'address' THEN e.address
    WHEN 'mailing_address' THEN e.mailing_address
    WHEN 'emergency_contact_name' THEN e.emergency_contact_name
    WHEN 'emergency_contact_phone' THEN e.emergency_contact_phone
    WHEN 'emergency_contact_relation' THEN e.emergency_contact_relation
    WHEN 'father_name' THEN e.father_name
    WHEN 'mother_name' THEN e.mother_name
    WHEN 'birthplace' THEN e.birthplace
    WHEN 'blood_group' THEN e.blood_group
    WHEN 'religion' THEN e.religion
    WHEN 'nid_number' THEN e.nid_number
    WHEN 'passport_number' THEN e.passport_number
    WHEN 'etin_number' THEN e.etin_number
  END INTO v_current
  FROM public.employees e
  WHERE e.id = v_employee AND e.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked employee record not found.' USING errcode = 'P0002';
  END IF;
  IF v_current IS NOT DISTINCT FROM v_value THEN
    RAISE EXCEPTION 'The proposed value matches the current value.' USING errcode = '22023';
  END IF;

  INSERT INTO public.employee_profile_change_requests(
    tenant_id, employee_id, requested_by, field_key, requested_value, reason
  ) VALUES (p_tenant_id, v_employee, auth.uid(), p_field_key, v_value, v_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A pending request already exists for this profile field.' USING errcode = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_get_my_profile_change_requests(p_tenant_id uuid)
RETURNS TABLE (
  id uuid, field_key text, reason text, status text,
  submitted_at timestamptz, reviewed_at timestamptz, review_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE v_employee uuid := public.hris_own_employee_for_tenant(p_tenant_id);
BEGIN
  IF NOT public.hris_profile_change_active_member(p_tenant_id) OR v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee membership is required.' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT r.id, r.field_key, r.reason, r.status, r.submitted_at, r.reviewed_at, r.review_note
    FROM public.employee_profile_change_requests r
    WHERE r.employee_id = v_employee AND r.tenant_id = p_tenant_id
    ORDER BY r.submitted_at DESC LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_profile_change_requests(p_tenant_id uuid)
RETURNS TABLE (
  id uuid, employee_id uuid, employee_number text, full_name text,
  field_key text, requested_value text, reason text, submitted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'self_service.manage') THEN
    RAISE EXCEPTION 'Active-tenant self-service management permission required.' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT r.id, r.employee_id, e.employee_number, e.full_name,
      r.field_key, r.requested_value, r.reason, r.submitted_at
    FROM public.employee_profile_change_requests r
    JOIN public.employees e ON e.id = r.employee_id AND e.tenant_id = r.tenant_id
    WHERE r.tenant_id = p_tenant_id AND r.status = 'pending'
    ORDER BY r.submitted_at ASC LIMIT 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_profile_change_request(
  p_tenant_id uuid,
  p_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE
  r public.employee_profile_change_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'self_service.manage') THEN
    RAISE EXCEPTION 'Active-tenant self-service management permission required.' USING errcode = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode = '22023';
  END IF;
  IF length(coalesce(v_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer.' USING errcode = '22023';
  END IF;

  SELECT * INTO r
  FROM public.employee_profile_change_requests
  WHERE id = p_id AND tenant_id = p_tenant_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending profile change request not found.' USING errcode = 'P0002';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.employees e SET
      full_name = CASE WHEN r.field_key = 'full_name' THEN r.requested_value ELSE e.full_name END,
      official_email = CASE WHEN r.field_key = 'official_email' THEN r.requested_value ELSE e.official_email END,
      personal_email = CASE WHEN r.field_key = 'personal_email' THEN r.requested_value ELSE e.personal_email END,
      official_phone = CASE WHEN r.field_key = 'official_phone' THEN r.requested_value ELSE e.official_phone END,
      address = CASE WHEN r.field_key = 'address' THEN r.requested_value ELSE e.address END,
      mailing_address = CASE WHEN r.field_key = 'mailing_address' THEN r.requested_value ELSE e.mailing_address END,
      emergency_contact_name = CASE WHEN r.field_key = 'emergency_contact_name' THEN r.requested_value ELSE e.emergency_contact_name END,
      emergency_contact_phone = CASE WHEN r.field_key = 'emergency_contact_phone' THEN r.requested_value ELSE e.emergency_contact_phone END,
      emergency_contact_relation = CASE WHEN r.field_key = 'emergency_contact_relation' THEN r.requested_value ELSE e.emergency_contact_relation END,
      father_name = CASE WHEN r.field_key = 'father_name' THEN r.requested_value ELSE e.father_name END,
      mother_name = CASE WHEN r.field_key = 'mother_name' THEN r.requested_value ELSE e.mother_name END,
      birthplace = CASE WHEN r.field_key = 'birthplace' THEN r.requested_value ELSE e.birthplace END,
      blood_group = CASE WHEN r.field_key = 'blood_group' THEN r.requested_value ELSE e.blood_group END,
      religion = CASE WHEN r.field_key = 'religion' THEN r.requested_value ELSE e.religion END,
      nid_number = CASE WHEN r.field_key = 'nid_number' THEN r.requested_value ELSE e.nid_number END,
      passport_number = CASE WHEN r.field_key = 'passport_number' THEN r.requested_value ELSE e.passport_number END,
      etin_number = CASE WHEN r.field_key = 'etin_number' THEN r.requested_value ELSE e.etin_number END,
      updated_at = now()
    WHERE e.id = r.employee_id AND e.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked employee record not found.' USING errcode = 'P0002';
    END IF;
  END IF;

  UPDATE public.employee_profile_change_requests
  SET status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = v_note, updated_at = now()
  WHERE id = r.id AND tenant_id = p_tenant_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile change request was already decided.' USING errcode = 'P0002';
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'self_service.profile_change.' || p_decision,
    'employee_profile_change_request', r.id::text,
    jsonb_build_object('employee_id', r.employee_id, 'field_key', r.field_key)
  );
  RETURN jsonb_build_object('success', true, 'status', p_decision);
END;
$function$;

REVOKE ALL ON FUNCTION public.employee_submit_profile_change_request(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_get_my_profile_change_requests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_profile_change_requests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_profile_change_request(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_submit_profile_change_request(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_get_my_profile_change_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profile_change_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_profile_change_request(uuid, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Source fragment: supabase/migrations/20261017130000_employee_profile_change_schema_contract.sql
-- E02 profile requests must match the existing employees contract. The prior
-- allowlist referenced profile columns absent from public.employees.

CREATE OR REPLACE FUNCTION public.hris_profile_change_active_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      JOIN public.tenant_memberships m
        ON m.tenant_id = t.id
       AND m.user_id = auth.uid()
       AND lower(m.status) = 'active'
      JOIN public.roles r ON r.id = m.role AND r.active IS TRUE
      WHERE t.id = p_tenant_id AND t.is_active IS TRUE
    )
$function$;
REVOKE ALL ON FUNCTION public.hris_profile_change_active_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_profile_change_active_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS employee_profile_change_read_own_or_authorized_review
  ON public.employee_profile_change_requests;
DROP POLICY IF EXISTS employee_profile_change_read_own_or_authorized_review ON public.employee_profile_change_requests;
CREATE POLICY employee_profile_change_read_own_or_authorized_review ON public.employee_profile_change_requests
  FOR SELECT TO authenticated
  USING (
    public.hris_profile_change_active_member(tenant_id)
    AND (
      employee_id = public.hris_own_employee_for_tenant(tenant_id)
      OR public.has_tenant_permission(tenant_id, 'self_service.manage')
    )
  );

DROP FUNCTION IF EXISTS public.employee_submit_profile_change_request(text, text, text);
DROP FUNCTION IF EXISTS public.employee_get_my_profile_change_requests();
DROP FUNCTION IF EXISTS public.admin_list_profile_change_requests();
DROP FUNCTION IF EXISTS public.admin_review_profile_change_request(uuid, text, text);

CREATE OR REPLACE FUNCTION public.employee_submit_profile_change_request(
  p_tenant_id uuid,
  p_field_key text,
  p_requested_value text,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE
  v_employee uuid := public.hris_own_employee_for_tenant(p_tenant_id);
  v_value text := nullif(btrim(coalesce(p_requested_value, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current text;
  v_id uuid;
BEGIN
  IF NOT public.hris_profile_change_active_member(p_tenant_id) OR v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee membership is required.' USING errcode = '42501';
  END IF;
  IF p_field_key IS NULL OR p_field_key NOT IN (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation'
  ) THEN
    RAISE EXCEPTION 'This profile field is not available for an employee change request.' USING errcode = '22023';
  END IF;
  IF v_value IS NULL OR length(v_value) > 500 THEN
    RAISE EXCEPTION 'Enter a proposed value of 1 to 500 characters.' USING errcode = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Enter a reason of 1 to 1000 characters.' USING errcode = '22023';
  END IF;
  IF p_field_key IN ('official_email', 'personal_email')
     AND v_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING errcode = '22023';
  END IF;

  SELECT CASE p_field_key
    WHEN 'full_name' THEN e.full_name
    WHEN 'official_email' THEN e.official_email
    WHEN 'personal_email' THEN e.personal_email
    WHEN 'official_phone' THEN e.official_phone
    WHEN 'address' THEN e.address
    WHEN 'mailing_address' THEN e.mailing_address
    WHEN 'emergency_contact_name' THEN e.emergency_contact_name
    WHEN 'emergency_contact_phone' THEN e.emergency_contact_phone
    WHEN 'emergency_contact_relation' THEN e.emergency_contact_relation
  END INTO v_current
  FROM public.employees e
  WHERE e.id = v_employee AND e.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked employee record not found.' USING errcode = 'P0002';
  END IF;
  IF v_current IS NOT DISTINCT FROM v_value THEN
    RAISE EXCEPTION 'The proposed value matches the current value.' USING errcode = '22023';
  END IF;

  INSERT INTO public.employee_profile_change_requests(
    tenant_id, employee_id, requested_by, field_key, requested_value, reason
  ) VALUES (p_tenant_id, v_employee, auth.uid(), p_field_key, v_value, v_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A pending request already exists for this profile field.' USING errcode = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_get_my_profile_change_requests(p_tenant_id uuid)
RETURNS TABLE (
  id uuid, field_key text, reason text, status text,
  submitted_at timestamptz, reviewed_at timestamptz, review_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE v_employee uuid := public.hris_own_employee_for_tenant(p_tenant_id);
BEGIN
  IF NOT public.hris_profile_change_active_member(p_tenant_id) OR v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee membership is required.' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT r.id, r.field_key, r.reason, r.status, r.submitted_at, r.reviewed_at, r.review_note
    FROM public.employee_profile_change_requests r
    WHERE r.employee_id = v_employee AND r.tenant_id = p_tenant_id
    ORDER BY r.submitted_at DESC LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_profile_change_requests(p_tenant_id uuid)
RETURNS TABLE (
  id uuid, employee_id uuid, employee_number text, full_name text,
  field_key text, requested_value text, reason text, submitted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'self_service.manage') THEN
    RAISE EXCEPTION 'Active-tenant self-service management permission required.' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT r.id, r.employee_id, e.employee_number, e.full_name,
      r.field_key, r.requested_value, r.reason, r.submitted_at
    FROM public.employee_profile_change_requests r
    JOIN public.employees e ON e.id = r.employee_id AND e.tenant_id = r.tenant_id
    WHERE r.tenant_id = p_tenant_id AND r.status = 'pending'
    ORDER BY r.submitted_at ASC LIMIT 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_profile_change_request(
  p_tenant_id uuid,
  p_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE
  r public.employee_profile_change_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'self_service.manage') THEN
    RAISE EXCEPTION 'Active-tenant self-service management permission required.' USING errcode = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode = '22023';
  END IF;
  IF length(coalesce(v_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer.' USING errcode = '22023';
  END IF;

  SELECT * INTO r
  FROM public.employee_profile_change_requests
  WHERE id = p_id AND tenant_id = p_tenant_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending profile change request not found.' USING errcode = 'P0002';
  END IF;

  IF p_decision = 'approved' AND r.field_key NOT IN (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation'
  ) THEN
    RAISE EXCEPTION 'This request targets a profile field no longer supported by the employee schema.' USING errcode = '22023';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.employees e SET
      full_name = CASE WHEN r.field_key = 'full_name' THEN r.requested_value ELSE e.full_name END,
      official_email = CASE WHEN r.field_key = 'official_email' THEN r.requested_value ELSE e.official_email END,
      personal_email = CASE WHEN r.field_key = 'personal_email' THEN r.requested_value ELSE e.personal_email END,
      official_phone = CASE WHEN r.field_key = 'official_phone' THEN r.requested_value ELSE e.official_phone END,
      address = CASE WHEN r.field_key = 'address' THEN r.requested_value ELSE e.address END,
      mailing_address = CASE WHEN r.field_key = 'mailing_address' THEN r.requested_value ELSE e.mailing_address END,
      emergency_contact_name = CASE WHEN r.field_key = 'emergency_contact_name' THEN r.requested_value ELSE e.emergency_contact_name END,
      emergency_contact_phone = CASE WHEN r.field_key = 'emergency_contact_phone' THEN r.requested_value ELSE e.emergency_contact_phone END,
      emergency_contact_relation = CASE WHEN r.field_key = 'emergency_contact_relation' THEN r.requested_value ELSE e.emergency_contact_relation END,
      updated_at = now()
    WHERE e.id = r.employee_id AND e.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked employee record not found.' USING errcode = 'P0002';
    END IF;
  END IF;

  UPDATE public.employee_profile_change_requests
  SET status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = v_note, updated_at = now()
  WHERE id = r.id AND tenant_id = p_tenant_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile change request was already decided.' USING errcode = 'P0002';
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'self_service.profile_change.' || p_decision,
    'employee_profile_change_request', r.id::text,
    jsonb_build_object('employee_id', r.employee_id, 'field_key', r.field_key)
  );
  RETURN jsonb_build_object('success', true, 'status', p_decision);
END;
$function$;

REVOKE ALL ON FUNCTION public.employee_submit_profile_change_request(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_get_my_profile_change_requests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_profile_change_requests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_profile_change_request(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_submit_profile_change_request(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_get_my_profile_change_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profile_change_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_profile_change_request(uuid, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Source fragment: supabase/staging/phase03/tenant_optional_modules.staging.sql
-- Phase 03 SA12 — tenant optional modules; dependencies created above in this transaction.
-- Defaults remain enabled for existing tenants; disabling blocks ALL new writes
-- (including edits/deletes) while existing SELECT policies remain unchanged.

CREATE TABLE IF NOT EXISTS public.tenant_module_settings (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 module_key text NOT NULL CHECK (module_key IN ('travel','expenses','learning')),
 enabled boolean NOT NULL DEFAULT true,
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,module_key)
);
ALTER TABLE public.tenant_module_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_module_settings FROM PUBLIC,anon,authenticated;
-- No public/anonymous/authenticated table-level policies or write grants.
-- The platform RPC is the only application mutation surface.

CREATE OR REPLACE FUNCTION private.hris_optional_module_enabled(
 p_tenant_id uuid,p_module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
 SELECT p_tenant_id IS NOT NULL
   AND p_module_key IN ('travel','expenses','learning')
   AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id)
   AND coalesce((SELECT s.enabled FROM public.tenant_module_settings s
      WHERE s.tenant_id=p_tenant_id AND s.module_key=p_module_key),true);
$fn$;
REVOKE ALL ON FUNCTION private.hris_optional_module_enabled(uuid,text)
 FROM PUBLIC,anon,authenticated;

-- Row triggers enforce writes even inside SECURITY DEFINER workflow RPCs or
-- through direct table access. Cross-tenant UPDATEs check both tenant IDs.
CREATE OR REPLACE FUNCTION private.hris_optional_module_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
 v_module text := TG_ARGV[0];
 v_old_tenant uuid;
 v_new_tenant uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN v_old_tenant := OLD.tenant_id; END IF;
 IF TG_OP <> 'DELETE' THEN v_new_tenant := NEW.tenant_id; END IF;
 IF (v_old_tenant IS NOT NULL AND NOT private.hris_optional_module_enabled(v_old_tenant,v_module))
    OR (v_new_tenant IS NOT NULL AND NOT private.hris_optional_module_enabled(v_new_tenant,v_module)) THEN
  RAISE EXCEPTION 'Optional module % is disabled for this tenant',v_module
    USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.hris_optional_module_write_guard()
 FROM PUBLIC,anon,authenticated;

-- A fixed allowlist: both Travel and Expenses protect expense_travel_links.
-- This deliberately fails if any needed table has not yet been deployed.
DO $install$
DECLARE v_row record; v_trigger text;
BEGIN
 FOR v_row IN SELECT * FROM (VALUES
  ('travel_requests','travel'),
  ('travel_status_history','travel'),
  ('travel_request_notifications','travel'),
  ('expense_travel_links','travel'),
  ('expense_categories','expenses'),
  ('expense_claims','expenses'),
  ('expense_claim_receipts','expenses'),
  ('expense_claim_status_history','expenses'),
  ('expense_travel_links','expenses'),
  ('learning_programs','learning'),
  ('learning_sessions','learning'),
  ('learning_enrollments','learning'),
  ('learning_completion_events','learning'),
  ('learning_completion_notifications','learning')
 ) AS allowed(table_name,module_key) LOOP
  IF pg_catalog.to_regclass(pg_catalog.format('public.%I',v_row.table_name)) IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=v_row.table_name
                      AND c.column_name='tenant_id') THEN
   RAISE EXCEPTION 'Missing Phase 03 module guard prerequisite: %',v_row.table_name
     USING ERRCODE='55000';
  END IF;
  v_trigger := 'hris_optional_' || v_row.module_key || '_write_guard';
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tg
                 WHERE tg.tgrelid=pg_catalog.to_regclass(pg_catalog.format('public.%I',v_row.table_name))
                   AND tg.tgname=v_trigger) THEN
   EXECUTE pg_catalog.format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.hris_optional_module_write_guard(%L)',
    v_trigger,v_row.table_name,v_row.module_key);
  END IF;
 END LOOP;
END;
$install$;

-- Expense receipts and Learning completion evidence also enter through the
-- Storage API. Protect those writes without changing any historical reads.
-- Expense object path: <auth-user>/<claim-id>/<file>.
-- Learning evidence path: <auth-user>/<tenant-id>/<enrollment-id>/<file>.
CREATE OR REPLACE FUNCTION private.hris_storage_optional_module_enabled(
 p_bucket_id text,p_object_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
 IF p_bucket_id='expense-receipts' THEN
  RETURN EXISTS (SELECT 1 FROM public.expense_claims c
   WHERE c.id::text=(storage.foldername(p_object_name))[2]
     AND private.hris_optional_module_enabled(c.tenant_id,'expenses'));
 ELSIF p_bucket_id='learning-completion-evidence' THEN
  RETURN EXISTS (SELECT 1 FROM public.tenants t
   WHERE t.id::text=(storage.foldername(p_object_name))[2]
     AND private.hris_optional_module_enabled(t.id,'learning'));
 END IF;
 RETURN true; -- Unrelated Storage buckets keep their existing policies.
END;
$fn$;
REVOKE ALL ON FUNCTION private.hris_storage_optional_module_enabled(text,text)
 FROM PUBLIC,anon,authenticated;
-- RLS expressions run with the active authenticated role even when their
-- helper function itself is SECURITY DEFINER.
GRANT EXECUTE ON FUNCTION private.hris_storage_optional_module_enabled(text,text)
 TO authenticated;

DROP POLICY IF EXISTS hris_optional_module_storage_insert ON storage.objects;
CREATE POLICY hris_optional_module_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (private.hris_storage_optional_module_enabled(bucket_id,name));
DROP POLICY IF EXISTS hris_optional_module_storage_update ON storage.objects;
CREATE POLICY hris_optional_module_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (private.hris_storage_optional_module_enabled(bucket_id,name))
 WITH CHECK (private.hris_storage_optional_module_enabled(bucket_id,name));
DROP POLICY IF EXISTS hris_optional_module_storage_delete ON storage.objects;
CREATE POLICY hris_optional_module_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING (private.hris_storage_optional_module_enabled(bucket_id,name));

CREATE OR REPLACE FUNCTION public.platform_hris_list_tenant_modules(p_tenant_id uuid)
RETURNS TABLE(module_key text,enabled boolean,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id=p_tenant_id) THEN
  RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002';
 END IF;
 RETURN QUERY SELECT k.module_key,coalesce(s.enabled,true),s.updated_at
 FROM (VALUES('travel'::text),('expenses'::text),('learning'::text)) k(module_key)
 LEFT JOIN public.tenant_module_settings s
 ON s.tenant_id=p_tenant_id AND s.module_key=k.module_key
 ORDER BY k.module_key;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_hris_set_tenant_module(
 p_tenant_id uuid,p_module_key text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_previous boolean;
BEGIN
 IF NOT public.platform_hris_is_super_admin() THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF p_tenant_id IS NULL OR p_module_key NOT IN ('travel','expenses','learning')
    OR p_module_key IS NULL OR p_enabled IS NULL THEN
  RAISE EXCEPTION 'Invalid optional-module request' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
 SELECT coalesce((SELECT s.enabled FROM public.tenant_module_settings s
    WHERE s.tenant_id=p_tenant_id AND s.module_key=p_module_key),true)
 INTO v_previous;
 IF v_previous IS NOT DISTINCT FROM p_enabled THEN RETURN; END IF;
 INSERT INTO public.tenant_module_settings(tenant_id,module_key,enabled,updated_by)
 VALUES(p_tenant_id,p_module_key,p_enabled,auth.uid())
 ON CONFLICT(tenant_id,module_key) DO UPDATE SET
  enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),'PLATFORM_TENANT_MODULE_CHANGED','tenant_module_settings',p_tenant_id::text,
  pg_catalog.jsonb_build_object('module',p_module_key,'from_enabled',v_previous,
    'to_enabled',p_enabled,'history_retained',true));
END;
$fn$;

REVOKE ALL ON FUNCTION public.platform_hris_list_tenant_modules(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.platform_hris_set_tenant_module(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_hris_list_tenant_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hris_set_tenant_module(uuid,text,boolean) TO authenticated;
-- Retire only the reviewed legacy notices guard after the replacement is installed.
-- Retire only the legacy Synesis-pinned notices guard after the tenant-membership
-- policy from 20261017030000 is installed and catalog-verified. This is a
-- staging transition script; run only after reviewing the hosted preflight and
-- confirming all affected administrators have an approved tenant access path.
SET LOCAL lock_timeout = '5s';

DO $retire_legacy_notices_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'notices'
      AND p.policyname = 'hris_notices_membership_guard'
      AND p.permissive = 'RESTRICTIVE'
      AND p.cmd = 'SELECT'
      AND 'authenticated' = ANY(p.roles)
      AND p.qual LIKE '%has_tenant_permission%'
      AND p.qual LIKE '%hris_own_employee_for_tenant%'
      AND p.qual LIKE '%hris_notices_super_admin_tenant_member%'
      AND p.qual NOT LIKE '%is_active_admin%'
      AND to_regprocedure('public.hris_notices_super_admin_tenant_member(uuid)') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Refusing to retire the legacy notices guard: the tenant-membership replacement is not installed as expected.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'notices'
      AND p.policyname = 'hris_notices_legacy_security_guard'
      AND (
        p.permissive <> 'RESTRICTIVE'
        OR p.cmd <> 'SELECT'
        OR NOT ('authenticated' = ANY(p.roles))
        OR p.qual NOT LIKE '%synesis_tenant_id%'
        OR p.qual NOT LIKE '%is_active_admin%'
        OR p.qual NOT LIKE '%has_permission%'
      )
  ) THEN
    RAISE EXCEPTION 'Refusing to retire the legacy notices guard: its catalog definition has drifted.';
  END IF;
END
$retire_legacy_notices_guard$;

DROP POLICY IF EXISTS hris_notices_legacy_security_guard ON public.notices;
DO $hosted_postflight$
DECLARE
  v_admin_fp text; v_auth_fp text; v_audit_fp text; v_membership_fp text;
  v_user_role_fp text; v_role_permission_fp text; v_module_fp text;
  v_total integer; v_failed integer; v_failures text;
BEGIN
  v_admin_fp := md5(coalesce((SELECT string_agg(to_jsonb(a)::text,chr(10) ORDER BY a.user_id::text) FROM public.admin_users a),''));
  v_auth_fp := md5(coalesce((SELECT string_agg(to_jsonb(u)::text,chr(10) ORDER BY u.id::text) FROM auth.users u),''));
  v_audit_fp := md5(coalesce((SELECT string_agg(to_jsonb(a)::text,chr(10) ORDER BY a.id::text) FROM public.admin_audit_logs a),''));
  v_membership_fp := md5(coalesce((SELECT string_agg(to_jsonb(m)::text,chr(10) ORDER BY m.tenant_id::text,m.user_id::text) FROM public.tenant_memberships m),''));
  v_user_role_fp := md5(coalesce((SELECT string_agg(to_jsonb(ur)::text,chr(10) ORDER BY ur.user_id::text,ur.role_id) FROM public.user_roles ur),''));
  v_role_permission_fp := md5(coalesce((SELECT string_agg(to_jsonb(rp)::text,chr(10) ORDER BY rp.role_id,rp.permission_id) FROM public.role_permissions rp),''));
  IF current_setting('synesis.hosted_transition.admin_fp',true) IS DISTINCT FROM v_admin_fp
    OR current_setting('synesis.hosted_transition.auth_fp',true) IS DISTINCT FROM v_auth_fp
    OR current_setting('synesis.hosted_transition.audit_fp',true) IS DISTINCT FROM v_audit_fp
    OR current_setting('synesis.hosted_transition.membership_fp',true) IS DISTINCT FROM v_membership_fp
    OR current_setting('synesis.hosted_transition.user_role_fp',true) IS DISTINCT FROM v_user_role_fp
    OR current_setting('synesis.hosted_transition.role_permission_fp',true) IS DISTINCT FROM v_role_permission_fp THEN
    RAISE EXCEPTION 'Hosted transition stopped: Auth, admin, membership, role grants, or audit history changed.';
  END IF;
  IF current_setting('synesis.hosted_transition.module_settings_existed',true)='yes' THEN
    EXECUTE 'SELECT md5(coalesce(string_agg(to_jsonb(s)::text,chr(10) ORDER BY s.tenant_id::text,s.module_key),'''')) FROM public.tenant_module_settings s'
      INTO v_module_fp;
    IF current_setting('synesis.hosted_transition.module_settings_fp',true) IS DISTINCT FROM v_module_fp THEN
      RAISE EXCEPTION 'Hosted transition stopped: existing module preferences changed.';
    END IF;
  ELSIF EXISTS(SELECT 1 FROM public.tenant_module_settings) THEN
    RAISE EXCEPTION 'Hosted transition stopped: module defaults were unexpectedly seeded.';
  END IF;

  IF EXISTS(SELECT 1 FROM public.admin_users a JOIN public.tenant_memberships m ON m.user_id=a.user_id
       WHERE a.active IS TRUE AND a.is_super_admin IS FALSE AND lower(m.status)='active') THEN
    RAISE EXCEPTION 'Hosted transition stopped: an unassigned administrator acquired a tenant membership.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname='public' AND p.tablename='notices'
      AND p.policyname='hris_notices_membership_guard'
      AND p.permissive='RESTRICTIVE' AND p.cmd='SELECT'
      AND p.qual LIKE '%hris_notices_super_admin_tenant_member%'
      AND p.qual NOT LIKE '%is_active_admin%'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname='public' AND p.tablename='notices'
      AND p.policyname='hris_notices_legacy_security_guard'
  ) THEN
    RAISE EXCEPTION 'Hosted transition stopped: notices guard replacement was incomplete.';
  END IF;
  IF to_regclass('public.travel_request_notifications') IS NULL
     OR to_regclass('public.learning_completion_events') IS NULL
     OR to_regclass('public.learning_completion_notifications') IS NULL
     OR to_regclass('public.roster_change_notifications') IS NULL
     OR to_regclass('public.employee_shift_assignment_changes') IS NULL
     OR to_regclass('public.tenant_module_settings') IS NULL THEN
    RAISE EXCEPTION 'Hosted transition stopped: one or more Phase 03/04 dependency tables remain absent.';
  END IF;
  IF to_regprocedure('public.hris_notices_super_admin_tenant_member(uuid)') IS NULL
     OR to_regprocedure('public.platform_hris_is_super_admin()') IS NULL
     OR to_regprocedure('public.platform_hris_list_tenant_modules(uuid)') IS NULL
     OR to_regprocedure('public.platform_hris_set_tenant_module(uuid,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Hosted transition stopped: an authorized platform RPC/helper is absent.';
  END IF;

WITH required_procedures(signature, source) AS (
  VALUES
    ('private.hris_get_my_employee_documents(uuid)', '20261017010000'),
    ('public.hris_get_my_employee_documents(uuid)', '20261017010000'),
    ('public.hris_get_my_employee_identity_card(uuid)', '20261017020000'),
    ('public.hris_get_my_dashboard_data(uuid)', '20261017060001'),
    ('public.hris_get_my_pending_requests(uuid)', '20261017060000'),
    ('public.hris_employee_submit_attendance_correction(uuid,jsonb)', '20261017074518'),
    ('public.hris_get_tenant_employee_directory_v2(uuid,text,uuid,uuid,text,integer,integer)', '20261017092147'),
    ('public.hris_change_tenant_employee_shift(uuid,uuid,uuid,uuid)', '20261017095321'),
    ('public.hris_get_my_shift_changes(uuid,date,date)', '20261017095321'),
    ('public.hris_profile_change_active_member(uuid)', '20261017130000'),
    ('public.hris_notices_super_admin_tenant_member(uuid)', '20261017030000'),
    ('public.employee_submit_profile_change_request(uuid,text,text,text)', '20261017130000'),
    ('public.employee_get_my_profile_change_requests(uuid)', '20261017130000'),
    ('public.admin_list_profile_change_requests(uuid)', '20261017130000'),
    ('public.admin_review_profile_change_request(uuid,uuid,text,text)', '20261017130000')
),
required_internal_procedures(signature, source) AS (
  VALUES
    ('private.hris_record_employee_shift_change()', '20261017095321')
),
required_prerequisites(kind, signature, source) AS (
  VALUES
    ('function', 'public.has_tenant_permission(uuid,text)', '20261012091930'),
    ('function', 'public.hris_is_active_tenant_member(uuid)', '20261012230100'),
    ('table', 'public.roster_change_notifications', '20261016230201'),
    ('table', 'public.employee_shift_assignment_changes', '20261017095321')
),
retired_procedures(signature, source) AS (
  VALUES
    ('public.employee_submit_profile_change_request(text,text,text)', '20261017130000'),
    ('public.employee_get_my_profile_change_requests()', '20261017130000'),
    ('public.admin_list_profile_change_requests()', '20261017130000'),
    ('public.admin_review_profile_change_request(uuid,text,text)', '20261017130000')
),
required_policies(table_name, policy_name, expected_permissive, source) AS (
  VALUES
    ('notices', 'hris_notices_membership_guard', 'RESTRICTIVE', '20261017030000'),
    ('employee_profile_change_requests', 'employee_profile_change_read_own_or_authorized_review', 'PERMISSIVE', '20261017130000')
),
checks AS (
  SELECT 'required_rpc'::text AS kind, signature AS object, source,
    COALESCE(to_regprocedure(signature) IS NOT NULL
      AND has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
      AND NOT has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false) AS passed,
    'exists, authenticated executable, anon not executable'::text AS requirement
  FROM required_procedures
  UNION ALL
  SELECT 'internal_trigger', signature, source,
    COALESCE(to_regprocedure(signature) IS NOT NULL
      AND NOT has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
      AND NOT has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false),
    'exists, not executable by authenticated or anon'
  FROM required_internal_procedures
  UNION ALL
  SELECT 'prerequisite', signature, source,
    CASE WHEN kind = 'function' THEN to_regprocedure(signature) IS NOT NULL
      ELSE to_regclass(signature) IS NOT NULL END,
    kind || ' exists'
  FROM required_prerequisites
  UNION ALL
  SELECT 'retired_overload', signature, source, to_regprocedure(signature) IS NULL,
    'legacy tenant-implicit RPC absent'
  FROM retired_procedures
  UNION ALL
  SELECT 'policy', 'public.' || table_name || '/' || policy_name, source,
    EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = table_name
        AND p.policyname = policy_name AND p.permissive = expected_permissive
        AND CASE
          WHEN table_name = 'employee_profile_change_requests'
            THEN p.qual LIKE '%hris_profile_change_active_member%'
          WHEN table_name = 'notices'
            THEN p.qual LIKE '%hris_own_employee_for_tenant%'
              AND p.qual LIKE '%hris_notices_super_admin_tenant_member%'
              AND p.qual NOT LIKE '%is_active_admin%'
              AND NOT EXISTS (
                SELECT 1 FROM pg_policies legacy
                WHERE legacy.schemaname = 'public'
                  AND legacy.tablename = 'notices'
                  AND legacy.policyname = 'hris_notices_legacy_security_guard'
              )
          ELSE FALSE
        END
    ), 'tenant-scoped predicate; legacy notices guard absent where applicable'
  FROM required_policies
)
  SELECT count(*)::integer,count(*) FILTER(WHERE NOT passed)::integer,
    string_agg(kind || ':' || object,', ' ORDER BY kind,object)
  INTO v_total,v_failed,v_failures
  FROM checks;
  IF v_total<>26 OR v_failed<>0 THEN
    RAISE EXCEPTION 'Hosted Phase 04 parity is %/%; failed: %',v_total-v_failed,v_total,coalesce(v_failures,'unexpected contract count');
  END IF;
END
$hosted_postflight$;

COMMIT;
