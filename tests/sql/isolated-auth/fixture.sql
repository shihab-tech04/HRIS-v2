-- DISPOSABLE LOCAL SUPABASE ONLY. This fixture contains synthetic users/data.
-- It mirrors the production function and policy contracts inspected on 2026-10-12;
-- it is not a production migration and must never run against a hosted project.
BEGIN;

DROP POLICY IF EXISTS leave_evidence_admin_select ON storage.objects;
DROP POLICY IF EXISTS leave_evidence_employee_delete ON storage.objects;
DROP POLICY IF EXISTS leave_evidence_employee_insert ON storage.objects;
DROP POLICY IF EXISTS leave_evidence_employee_select ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_employee_upload ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_upload_tenant_guard ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_scoped_read ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_tenant_read_guard ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_employee_delete ON storage.objects;
DROP POLICY IF EXISTS hris_leave_evidence_delete_tenant_guard ON storage.objects;

DROP FUNCTION IF EXISTS public.admin_resolve_attendance_correction(uuid,text,text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_resolve_leave_request(uuid,text,text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_save_attendance(uuid,date,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.hris_get_my_timesheet_context(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.hris_submit_my_timesheet(uuid,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.hris_admin_can_read_tenant(uuid,text) CASCADE;
DROP FUNCTION IF EXISTS public.hris_is_active_tenant_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.hris_own_employee_for_tenant(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.employee_for_auth_user() CASCADE;
DROP FUNCTION IF EXISTS public.has_tenant_permission(uuid,text) CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(text) CASCADE;
DROP FUNCTION IF EXISTS public.is_active_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_live_session() CASCADE;
DROP FUNCTION IF EXISTS public.synesis_tenant_id() CASCADE;

DROP TABLE IF EXISTS public.attendance_corrections CASCADE;
DROP TABLE IF EXISTS public.attendance_records CASCADE;
DROP TABLE IF EXISTS public.confirmation_reviews CASCADE;
DROP TABLE IF EXISTS public.employee_referrals CASCADE;
DROP TABLE IF EXISTS public.employee_leave_balances CASCADE;
DROP TABLE IF EXISTS public.grades CASCADE;
DROP TABLE IF EXISTS public.hr_policies CASCADE;
DROP TABLE IF EXISTS public.manpower_requisitions CASCADE;
DROP TABLE IF EXISTS public.notices CASCADE;
DROP TABLE IF EXISTS public.org_locations CASCADE;
DROP TABLE IF EXISTS public.pay_periods CASCADE;
DROP TABLE IF EXISTS public.payslips CASCADE;
DROP TABLE IF EXISTS public.performance_cycles CASCADE;
DROP TABLE IF EXISTS public.performance_goals CASCADE;
DROP TABLE IF EXISTS public.project_performance_reviews CASCADE;
DROP TABLE IF EXISTS public.timesheet_entries CASCADE;
DROP TABLE IF EXISTS public.timesheets CASCADE;
DROP TABLE IF EXISTS public.timesheet_activities CASCADE;
DROP TABLE IF EXISTS public.service_requests CASCADE;
DROP TABLE IF EXISTS public.leave_requests CASCADE;
DROP TABLE IF EXISTS public.leave_types CASCADE;
DROP TABLE IF EXISTS public.holidays CASCADE;
DROP TABLE IF EXISTS public.designations CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.departments CASCADE;
DROP TABLE IF EXISTS public.employee_shift_assignments CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.shifts CASCADE;
DROP TABLE IF EXISTS public.admin_audit_logs CASCADE;
DROP TABLE IF EXISTS public.tenant_memberships CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.role_permissions CASCADE;
DROP TABLE IF EXISTS public.permissions CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.admin_users CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Asia/Dhaka'
);

CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  is_super_admin boolean NOT NULL DEFAULT false
);

CREATE TABLE public.roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.permissions (
  id text PRIMARY KEY,
  module text NOT NULL,
  action text NOT NULL
);

CREATE TABLE public.role_permissions (
  role_id text NOT NULL REFERENCES public.roles(id),
  permission_id text NOT NULL REFERENCES public.permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

-- Deliberately mirrors the production global user_id primary key. The local test
-- demonstrates why this schema cannot express tenant-scoped permissions.
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY,
  role_id text NOT NULL REFERENCES public.roles(id)
);

CREATE TABLE public.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE public.shifts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Synthetic Shift',
  code text NOT NULL DEFAULT 'SYN',
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '17:00',
  grace_minutes integer NOT NULL DEFAULT 0,
  break_minutes integer NOT NULL DEFAULT 0,
  weekly_off_days integer[] NOT NULL DEFAULT '{}',
  full_day_hours numeric,
  half_day_hours numeric NOT NULL DEFAULT 4,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  code text NOT NULL
);

CREATE TABLE public.teams (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  department_id uuid REFERENCES public.departments(id),
  name text NOT NULL,
  code text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.designations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  department_id uuid REFERENCES public.departments(id),
  title text NOT NULL,
  code text NOT NULL
);

CREATE TABLE public.employees (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid,
  department_id uuid REFERENCES public.departments(id),
  team_id uuid REFERENCES public.teams(id),
  designation_id uuid REFERENCES public.designations(id),
  shift_id uuid REFERENCES public.shifts(id),
  employee_number text NOT NULL,
  full_name text NOT NULL,
  official_email text NOT NULL,
  joining_date date NOT NULL,
  gender text,
  employment_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employee_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  assignment_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, assignment_date)
);

CREATE TABLE public.holidays (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  code text NOT NULL,
  applicable_gender text,
  min_days_notice integer,
  requires_document_proof boolean NOT NULL DEFAULT false,
  annual_entitlement numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  leave_type_id uuid NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  requested_days numeric NOT NULL,
  reason text NOT NULL,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  attachment_url text,
  day_portion text NOT NULL DEFAULT 'full',
  status text NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employee_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  leave_type_id uuid NOT NULL,
  balance_year integer NOT NULL,
  opening_days numeric NOT NULL DEFAULT 0,
  allocated_days numeric NOT NULL DEFAULT 0,
  used_days numeric NOT NULL DEFAULT 0,
  pending_days numeric NOT NULL DEFAULT 0,
  adjusted_days numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, leave_type_id, balance_year)
);

CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  attendance_date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  work_mode text NOT NULL DEFAULT 'office',
  client_name text,
  status text NOT NULL DEFAULT 'present',
  source text NOT NULL DEFAULT 'system',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, attendance_date)
);

CREATE TABLE public.attendance_corrections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  attendance_date date NOT NULL,
  requested_check_in timestamptz,
  requested_check_out timestamptz,
  requested_work_mode text,
  client_name text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  evidence_path text
);

-- Small synthetic replicas for the remaining exposed tables. Only the columns
-- referenced by their legacy RLS policies and the new tenant guards are needed
-- in this disposable fixture; production column shapes were separately read.
CREATE TABLE public.confirmation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  employee_id uuid, status text DEFAULT 'pending'
);
CREATE TABLE public.employee_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  referrer_employee_id uuid
);
CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL
);
CREATE TABLE public.hr_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.manpower_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL
);
CREATE TABLE public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.org_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL
);
CREATE TABLE public.pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL
);
CREATE TABLE public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  employee_id uuid, status text NOT NULL DEFAULT 'released'
);
CREATE TABLE public.performance_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL
);
CREATE TABLE public.performance_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  employee_id uuid
);
CREATE TABLE public.project_performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  employee_id uuid, project_manager_employee_id uuid
);
CREATE TABLE public.timesheet_activities (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  activity_type text NOT NULL CHECK (activity_type IN ('project','client','task','activity')),
  name text NOT NULL,
  code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);
CREATE TABLE public.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  period_type text NOT NULL CHECK (period_type IN ('daily','weekly')),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, period_type, period_start, period_end)
);
CREATE TABLE public.timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.timesheet_activities(id),
  work_date date NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  note text
);
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  employee_id uuid
);

CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.is_live_session()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'auth' AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id = nullif(auth.jwt()->>'session_id', '')::uuid
      AND s.user_id = auth.uid()
      AND (s.not_after IS NULL OR s.not_after > now())
  );
$function$;

CREATE FUNCTION public.is_active_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
  SELECT public.is_live_session() AND EXISTS (
    SELECT 1 FROM public.admin_users au
    JOIN auth.users u ON u.id = au.user_id
    WHERE au.user_id = auth.uid()
      AND au.active IS TRUE
      AND u.email_confirmed_at IS NOT NULL
  );
$function$;

CREATE FUNCTION public.has_permission(p_permission_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE v_super boolean := false;
BEGIN
  IF NOT public.is_active_admin() THEN RETURN false; END IF;
  SELECT au.is_super_admin INTO v_super FROM public.admin_users au
  WHERE au.user_id = auth.uid() AND au.active IS TRUE;
  IF v_super IS TRUE THEN
    RETURN EXISTS (SELECT 1 FROM public.permissions p WHERE p.id = p_permission_id);
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.active IS TRUE
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE ur.user_id = auth.uid() AND rp.permission_id = p_permission_id
  );
END;
$function$;

CREATE FUNCTION public.synesis_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public' AS $function$
  SELECT id FROM public.tenants
  WHERE slug = 'synesis-it' AND is_active IS TRUE LIMIT 1;
$function$;

CREATE FUNCTION public.employee_for_auth_user()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
  SELECT e.id FROM public.employees e
  WHERE e.user_id = auth.uid()
    AND e.tenant_id = public.synesis_tenant_id()
    AND e.employment_status NOT IN ('resigned', 'terminated')
    AND public.is_active_admin()
  ORDER BY e.created_at LIMIT 1;
$function$;

CREATE FUNCTION public.hris_own_employee_for_tenant(p_tenant_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
  SELECT e.id FROM public.employees e
  WHERE e.user_id = auth.uid() AND e.tenant_id = p_tenant_id
    AND e.employment_status NOT IN ('resigned', 'terminated')
    AND public.is_live_session()
  ORDER BY e.created_at LIMIT 1;
$function$;

CREATE FUNCTION public.hris_admin_can_read_tenant(p_tenant_id uuid, p_permission_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND p_tenant_id = public.synesis_tenant_id()
    AND public.is_active_admin()
    AND public.has_permission(p_permission_id);
$function$;

CREATE FUNCTION public.admin_save_attendance(p_employee_id uuid, p_date date, p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE v_tenant uuid := public.synesis_tenant_id(); v_id uuid;
BEGIN
  IF NOT public.has_permission('attendance.manage') THEN
    RAISE EXCEPTION 'Attendance management permission required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id=p_employee_id AND tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'Employee not found.' USING errcode='P0002';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Attendance date is required.' USING errcode='22000'; END IF;
  INSERT INTO public.attendance_records(tenant_id,employee_id,attendance_date,check_in,check_out,
    work_mode,client_name,status,source,remarks)
  VALUES(v_tenant,p_employee_id,p_date,nullif(p_payload->>'check_in','')::timestamptz,
    nullif(p_payload->>'check_out','')::timestamptz,
    coalesce(nullif(p_payload->>'work_mode',''),'office'),
    nullif(btrim(coalesce(p_payload->>'client_name','')),''),
    coalesce(nullif(p_payload->>'status',''),'present'),'admin',
    nullif(btrim(coalesce(p_payload->>'remarks','')),''))
  ON CONFLICT(tenant_id,employee_id,attendance_date) DO UPDATE SET
    check_in=excluded.check_in,check_out=excluded.check_out,work_mode=excluded.work_mode,
    client_name=excluded.client_name,status=excluded.status,source='admin',remarks=excluded.remarks
  RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'attendance.record.saved','attendance_record',v_id::text,
    jsonb_build_object('employee_id',p_employee_id,'date',p_date));
  RETURN v_id;
END;
$function$;

CREATE FUNCTION public.admin_resolve_leave_request(p_id uuid,p_decision text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
BEGIN RETURN '{}'::jsonb; END;
$function$;

CREATE FUNCTION public.admin_resolve_attendance_correction(p_id uuid,p_decision text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
BEGIN RETURN '{}'::jsonb; END;
$function$;

REVOKE ALL ON FUNCTION public.is_live_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.synesis_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_for_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hris_own_employee_for_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hris_admin_can_read_tenant(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resolve_leave_request(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_attendance_correction(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_live_session(),public.is_active_admin(),
  public.has_permission(text),public.synesis_tenant_id(),public.employee_for_auth_user(),
  public.hris_own_employee_for_tenant(uuid),public.hris_admin_can_read_tenant(uuid,text),
  public.admin_resolve_leave_request(uuid,text,text),
  public.admin_resolve_attendance_correction(uuid,text,text) TO authenticated,service_role;

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manpower_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY employees_admin_read ON public.employees
  FOR SELECT TO authenticated USING (
    public.has_permission('employees.view') OR public.has_permission('employees.manage')
  );
CREATE POLICY hris_employees_own_read ON public.employees
  AS PERMISSIVE FOR SELECT TO authenticated USING (
    id=public.hris_own_employee_for_tenant(tenant_id)
  );
CREATE POLICY hris_employees_tenant_read_guard ON public.employees
  AS RESTRICTIVE FOR SELECT TO authenticated USING (
    id=public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id,'employees.view')
    OR public.hris_admin_can_read_tenant(tenant_id,'employees.manage')
  );
CREATE POLICY departments_admin_read ON public.departments
  FOR SELECT TO authenticated USING (
    public.has_permission('organization.view') OR public.has_permission('organization.manage')
  );
CREATE POLICY designations_admin_read ON public.designations FOR SELECT TO authenticated USING (
  public.has_permission('organization.view') OR public.has_permission('organization.manage')
);
CREATE POLICY teams_admin_read ON public.teams FOR SELECT TO authenticated USING (
  public.has_permission('organization.view') OR public.has_permission('organization.manage')
);
CREATE POLICY shifts_admin_read ON public.shifts FOR SELECT TO authenticated USING (
  public.has_permission('organization.view') OR public.has_permission('organization.manage')
);
CREATE POLICY holidays_read ON public.holidays FOR SELECT TO authenticated USING (
  active IS TRUE OR public.has_permission('holidays.manage')
);
CREATE POLICY hris_departments_tenant_read_guard ON public.departments
  AS RESTRICTIVE FOR SELECT TO authenticated USING (
    public.hris_admin_can_read_tenant(tenant_id,'organization.view')
    OR public.hris_admin_can_read_tenant(tenant_id,'organization.manage')
  );
CREATE POLICY leave_types_read ON public.leave_types
  FOR SELECT TO authenticated USING (
    public.has_permission('leave.view') OR public.has_permission('leave.manage')
    OR public.employee_for_auth_user() IS NOT NULL
  );
CREATE POLICY hris_leave_types_employee_read ON public.leave_types
  AS PERMISSIVE FOR SELECT TO authenticated USING (
    public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
  );
CREATE POLICY hris_leave_types_tenant_read_guard ON public.leave_types
  AS RESTRICTIVE FOR SELECT TO authenticated USING (
    public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL
    OR public.hris_admin_can_read_tenant(tenant_id,'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id,'leave.manage')
  );

CREATE POLICY attendance_admin_read ON public.attendance_records
  FOR SELECT TO authenticated USING (
    public.has_permission('attendance.view') OR public.has_permission('attendance.manage')
    OR employee_id=public.employee_for_auth_user()
  );
CREATE POLICY attendance_corrections_admin_or_own_read ON public.attendance_corrections
  FOR SELECT TO authenticated USING (
    public.has_permission('attendance.view') OR public.has_permission('attendance.manage')
    OR employee_id=public.employee_for_auth_user()
  );
CREATE POLICY leave_requests_read ON public.leave_requests
  FOR SELECT TO authenticated USING (
    employee_id=public.employee_for_auth_user()
    OR public.has_permission('leave.view') OR public.has_permission('leave.manage')
  );
CREATE POLICY hris_leave_requests_own_read ON public.leave_requests
  AS PERMISSIVE FOR SELECT TO authenticated USING (
    employee_id=public.hris_own_employee_for_tenant(tenant_id)
  );
CREATE POLICY hris_leave_requests_tenant_read_guard ON public.leave_requests
  AS RESTRICTIVE FOR SELECT TO authenticated USING (
    employee_id=public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id,'leave.view')
    OR public.hris_admin_can_read_tenant(tenant_id,'leave.manage')
  );
CREATE POLICY leave_balances_read ON public.employee_leave_balances
  FOR SELECT TO authenticated USING (
    employee_id=public.employee_for_auth_user()
    OR public.has_permission('leave.view') OR public.has_permission('leave.manage')
  );

-- Model the current, unscoped global-permission read branches so the tests can
-- prove the restrictive migration closes those exact paths.
CREATE POLICY confirmation_reviews_admin_read ON public.confirmation_reviews
  FOR SELECT TO authenticated USING (public.has_permission('performance.view'));
CREATE POLICY employee_referrals_read ON public.employee_referrals
  FOR SELECT TO authenticated USING (
    referrer_employee_id=public.employee_for_auth_user()
    OR public.has_permission('referrals.view') OR public.has_permission('referrals.manage')
  );
CREATE POLICY grades_admin_read ON public.grades FOR SELECT TO authenticated USING (
  public.has_permission('organization.view') OR public.has_permission('organization.manage')
);
CREATE POLICY hr_policies_read ON public.hr_policies FOR SELECT TO authenticated USING (
  (active IS TRUE AND public.employee_for_auth_user() IS NOT NULL)
  OR public.has_permission('policies.view') OR public.has_permission('policies.manage')
);
CREATE POLICY manpower_requisitions_admin_read ON public.manpower_requisitions
  FOR SELECT TO authenticated USING (public.has_permission('recruitment.view'));
CREATE POLICY notices_read ON public.notices FOR SELECT TO authenticated USING (
  active IS TRUE OR public.has_permission('notices.manage')
);
CREATE POLICY org_locations_admin_read ON public.org_locations FOR SELECT TO authenticated USING (
  public.has_permission('organization.view') OR public.has_permission('organization.manage')
);
CREATE POLICY pay_periods_admin_read ON public.pay_periods FOR SELECT TO authenticated USING (
  public.has_permission('payroll.view')
);
CREATE POLICY payslips_admin_or_own_read ON public.payslips FOR SELECT TO authenticated USING (
  public.has_permission('payroll.view')
  OR (employee_id=public.employee_for_auth_user() AND status='released')
);
CREATE POLICY performance_cycles_admin_read ON public.performance_cycles
  FOR SELECT TO authenticated USING (public.has_permission('performance.view'));
CREATE POLICY performance_goals_admin_read ON public.performance_goals
  FOR SELECT TO authenticated USING (
    public.has_permission('performance.view') OR employee_id=public.employee_for_auth_user()
  );
CREATE POLICY project_performance_reviews_admin_read ON public.project_performance_reviews
  FOR SELECT TO authenticated USING (
    public.has_permission('performance.view') OR employee_id=public.employee_for_auth_user()
  );
CREATE POLICY service_requests_read ON public.service_requests FOR SELECT TO authenticated USING (
  employee_id=public.employee_for_auth_user()
  OR public.has_permission('self_service.view') OR public.has_permission('self_service.manage')
);

GRANT USAGE ON SCHEMA public TO authenticated,anon,service_role;
GRANT SELECT ON public.employees,public.departments,public.designations,public.leave_types,
  public.attendance_records,public.attendance_corrections,public.leave_requests,
  public.employee_leave_balances,public.confirmation_reviews,public.employee_referrals,
  public.grades,public.holidays,public.hr_policies,public.manpower_requisitions,public.notices,
  public.org_locations,public.pay_periods,public.payslips,public.performance_cycles,
  public.performance_goals,public.project_performance_reviews,public.service_requests,
  public.shifts,public.teams,public.timesheet_activities,public.timesheets,
  public.timesheet_entries TO authenticated,anon;
GRANT ALL ON public.tenants,public.admin_users,public.roles,public.permissions,
  public.role_permissions,public.user_roles,public.tenant_memberships,public.shifts,
  public.departments,public.designations,public.employees,public.holidays,public.leave_types,
  public.leave_requests,public.employee_leave_balances,
  public.attendance_records,public.attendance_corrections,public.admin_audit_logs
  TO service_role;
GRANT ALL ON public.timesheet_activities,public.timesheets,public.timesheet_entries TO service_role;

INSERT INTO public.tenants(id,slug,code,name,is_active) VALUES
  ('11111111-1111-4111-8111-111111111111','synesis-it','SYN','Synthetic Synesis',true),
  ('22222222-2222-4222-8222-222222222222','qa-two','QA2','Synthetic Tenant Two',true);
INSERT INTO public.roles(id,name) VALUES
  ('qa_global_manager','Synthetic global-only role'),
  ('qa_tenant_manager_a','Synthetic tenant A HR manager'),
  ('qa_tenant_manager_b','Synthetic tenant B HR manager'),
  ('qa_tenant_viewer_b','Synthetic tenant B viewer'),
  ('qa_tenant_reporter_a','Synthetic tenant A report-only viewer');
INSERT INTO public.permissions(id,module,action) VALUES
  ('leave.manage','leave','manage'),('leave.view','leave','view'),
  ('attendance.manage','attendance','manage'),('attendance.view','attendance','view'),
  ('dashboard.view','dashboard','view'),('reports.view','reports','view');
INSERT INTO public.role_permissions(role_id,permission_id) VALUES
  ('qa_global_manager','leave.manage'),('qa_global_manager','leave.view'),
  ('qa_global_manager','attendance.manage'),('qa_global_manager','attendance.view'),
  ('qa_global_manager','dashboard.view'),('qa_global_manager','reports.view'),
  ('qa_tenant_manager_a','leave.manage'),('qa_tenant_manager_a','leave.view'),
  ('qa_tenant_manager_a','attendance.manage'),('qa_tenant_manager_a','attendance.view'),
  ('qa_tenant_manager_a','dashboard.view'),('qa_tenant_manager_a','reports.view'),
  ('qa_tenant_manager_b','leave.manage'),('qa_tenant_manager_b','leave.view'),
  ('qa_tenant_manager_b','attendance.manage'),('qa_tenant_manager_b','attendance.view'),
  ('qa_tenant_manager_b','dashboard.view'),('qa_tenant_manager_b','reports.view'),
  ('qa_tenant_viewer_b','leave.view'),('qa_tenant_viewer_b','attendance.view'),
  ('qa_tenant_reporter_a','reports.view');
INSERT INTO public.permissions(id,module,action) VALUES
  ('performance.view','performance','view'),('performance.manage','performance','manage'),
  ('organization.view','organization','view'),('organization.manage','organization','manage'),
  ('referrals.view','referrals','view'),('referrals.manage','referrals','manage'),
  ('holidays.manage','holidays','manage'),
  ('policies.view','policies','view'),('policies.manage','policies','manage'),
  ('recruitment.view','recruitment','view'),('recruitment.manage','recruitment','manage'),
  ('notices.view','notices','view'),('notices.manage','notices','manage'),
  ('payroll.view','payroll','view'),('payroll.manage','payroll','manage'),
  ('self_service.view','self_service','view'),('self_service.manage','self_service','manage');
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT role_id, permission_id
FROM (VALUES ('qa_global_manager'),('qa_tenant_manager_a'),('qa_tenant_manager_b')) roles(role_id)
CROSS JOIN (VALUES
  ('performance.view'),('performance.manage'),('organization.view'),('organization.manage'),
  ('referrals.view'),('referrals.manage'),('holidays.manage'),('policies.view'),('policies.manage'),
  ('recruitment.view'),('recruitment.manage'),('notices.view'),('notices.manage'),
  ('payroll.view'),('payroll.manage'),('self_service.view'),('self_service.manage')
) perms(permission_id);
INSERT INTO public.admin_users(user_id,display_name,active,is_super_admin)
  SELECT id,email,true,false FROM auth.users
  WHERE email IN ('global-only@hris.test','manager-a@hris.test','manager-b@hris.test');
INSERT INTO public.user_roles(user_id,role_id)
  SELECT id,'qa_global_manager' FROM auth.users
  WHERE email IN ('manager-a@hris.test','manager-b@hris.test','global-only@hris.test');
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  SELECT '11111111-1111-4111-8111-111111111111',id,'qa_tenant_manager_a','active'
  FROM auth.users WHERE email='manager-a@hris.test';
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  SELECT '11111111-1111-4111-8111-111111111111',id,'qa_tenant_manager_a','active'
  FROM auth.users WHERE email='manager-a2@hris.test';
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  SELECT '22222222-2222-4222-8222-222222222222',id,'qa_tenant_manager_b','active'
  FROM auth.users WHERE email='manager-b@hris.test';
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  SELECT '22222222-2222-4222-8222-222222222222',id,'qa_tenant_viewer_b','active'
  FROM auth.users WHERE email='tenant-viewer@hris.test';
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  SELECT '11111111-1111-4111-8111-111111111111',id,'qa_tenant_reporter_a','active'
  FROM auth.users WHERE email='report-viewer-a@hris.test';

INSERT INTO public.shifts(id,tenant_id,name,code,start_time,end_time,grace_minutes,break_minutes,weekly_off_days,full_day_hours,active) VALUES
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Synthetic Day Shift','QA-DAY','09:00','17:00',10,60,ARRAY[0,6],8,true),
  ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','Synthetic Tenant B Shift','QA-B','10:00','18:00',5,45,ARRAY[0,6],8,true);
INSERT INTO public.departments(id,tenant_id,name,code) VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','QA A department','QA-A'),
  ('eeeeeeee-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','QA B department','QA-B');
INSERT INTO public.teams(id,tenant_id,department_id,name,code) VALUES
  ('dddddddd-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','eeeeeeee-0000-4000-8000-000000000001','QA A Team','QA-A-T'),
  ('dddddddd-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','eeeeeeee-0000-4000-8000-000000000002','QA B Team','QA-B-T');
INSERT INTO public.designations(id,tenant_id,department_id,title,code) VALUES
  ('ffffffff-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','eeeeeeee-0000-4000-8000-000000000001','QA A designation','QA-A-D'),
  ('ffffffff-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','eeeeeeee-0000-4000-8000-000000000002','QA B designation','QA-B-D');
INSERT INTO public.employees(id,tenant_id,user_id,department_id,team_id,designation_id,shift_id,employee_number,full_name,official_email,joining_date)
  VALUES
  ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',(SELECT id FROM auth.users WHERE email='employee-a@hris.test'),'eeeeeeee-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000001','ffffffff-0000-4000-8000-000000000001','33333333-3333-4333-8333-333333333333','QA-A-001','Synthetic Employee A','employee-a@hris.test','2026-01-01'),
  ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222',(SELECT id FROM auth.users WHERE email='employee-b@hris.test'),'eeeeeeee-0000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000002','ffffffff-0000-4000-8000-000000000002','44444444-4444-4444-8444-444444444444','QA-B-001','Synthetic Employee B','employee-b@hris.test','2026-01-01'),
  ('55555555-5555-4555-8555-555555555560','11111111-1111-4111-8111-111111111111',(SELECT id FROM auth.users WHERE email='employee-clock@hris.test'),'eeeeeeee-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000001','ffffffff-0000-4000-8000-000000000001','33333333-3333-4333-8333-333333333333','QA-A-006','Synthetic Clock Employee','employee-clock@hris.test','2026-01-01');
INSERT INTO public.employees(id,tenant_id,team_id,employee_number,full_name,official_email,joining_date) VALUES
  ('55555555-5555-4555-8555-555555555556','11111111-1111-4111-8111-111111111111','dddddddd-0000-4000-8000-000000000002','QA-A-002','Synthetic Absent Employee A','employee-a-absent@hris.test','2026-01-01'),
  ('55555555-5555-4555-8555-555555555557','11111111-1111-4111-8111-111111111111','dddddddd-0000-4000-8000-000000000001','QA-A-003','Synthetic Late Employee A','employee-a-late@hris.test','2026-01-01'),
  ('55555555-5555-4555-8555-555555555558','11111111-1111-4111-8111-111111111111','dddddddd-0000-4000-8000-000000000001','QA-A-004','Synthetic Leave Employee A','employee-a-leave@hris.test','2026-01-01'),
  ('55555555-5555-4555-8555-555555555559','11111111-1111-4111-8111-111111111111','dddddddd-0000-4000-8000-000000000001','QA-A-005','Synthetic WFH Employee A','employee-a-wfh@hris.test','2026-01-01');
INSERT INTO public.timesheet_activities(id,tenant_id,activity_type,name,code,active) VALUES
  ('88888888-8888-4888-8888-888888888901','11111111-1111-4111-8111-111111111111','activity','QA A Delivery','QA-A-DELIVERY',true),
  ('88888888-8888-4888-8888-888888888902','22222222-2222-4222-8222-222222222222','activity','QA B Delivery','QA-B-DELIVERY',true),
  ('88888888-8888-4888-8888-888888888903','11111111-1111-4111-8111-111111111111','task','Inactive QA A Task','QA-A-INACTIVE',false);
INSERT INTO public.timesheets(id,tenant_id,employee_id,period_type,period_start,period_end,status) VALUES
  ('77777777-7777-4777-8777-777777777701','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','weekly','2026-10-05','2026-10-11','draft'),
  ('77777777-7777-4777-8777-777777777702','22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','weekly','2026-10-05','2026-10-11','draft');
INSERT INTO public.timesheet_entries(timesheet_id,activity_id,work_date,hours,note) VALUES
  ('77777777-7777-4777-8777-777777777701','88888888-8888-4888-8888-888888888901','2026-10-06',4,'Synthetic A entry'),
  ('77777777-7777-4777-8777-777777777702','88888888-8888-4888-8888-888888888902','2026-10-06',5,'Synthetic B entry');
INSERT INTO public.confirmation_reviews(tenant_id,employee_id) VALUES
  ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555'),
  ('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666');
INSERT INTO public.employee_referrals(tenant_id,referrer_employee_id) VALUES
  ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555'),
  ('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666');
INSERT INTO public.grades(tenant_id) VALUES
  ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.hr_policies(tenant_id,active) VALUES
  ('11111111-1111-4111-8111-111111111111',true),('22222222-2222-4222-8222-222222222222',true);
INSERT INTO public.manpower_requisitions(tenant_id) VALUES
  ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.notices(tenant_id,active) VALUES
  ('11111111-1111-4111-8111-111111111111',true),('22222222-2222-4222-8222-222222222222',true);
INSERT INTO public.org_locations(tenant_id) VALUES
  ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.pay_periods(tenant_id) VALUES
  ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.payslips(tenant_id,employee_id,status) VALUES
  ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','released'),
  ('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','released');
INSERT INTO public.performance_cycles(tenant_id) VALUES
  ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.performance_goals(tenant_id,employee_id) VALUES
  ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555'),
  ('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666');
INSERT INTO public.project_performance_reviews(tenant_id,employee_id,project_manager_employee_id) VALUES
  ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','55555555-5555-4555-8555-555555555555'),
  ('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','66666666-6666-4666-8666-666666666666');
INSERT INTO public.service_requests(tenant_id,employee_id) VALUES
  ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555'),
  ('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666');
INSERT INTO public.holidays(id,tenant_id,name,start_date,end_date,active) VALUES
  ('77777777-7777-4777-8777-777777777778','22222222-2222-4222-8222-222222222222',
    'Synthetic QA holiday B','2026-10-13','2026-10-13',true);
INSERT INTO public.employee_shift_assignments(tenant_id,employee_id,shift_id,assignment_date,status) VALUES
  ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333',(now() AT TIME ZONE 'Asia/Dhaka')::date,'scheduled'),
  ('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444',(now() AT TIME ZONE 'Asia/Dhaka')::date,'scheduled');
INSERT INTO public.holidays(id,tenant_id,name,start_date,end_date,active)
  VALUES('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',
    'Synthetic QA holiday','2026-10-13','2026-10-13',true);

INSERT INTO public.leave_types(id,tenant_id,name,code,annual_entitlement,active,applicable_gender) VALUES
  ('99999999-9999-4999-8999-999999999901','11111111-1111-4111-8111-111111111111','Synthetic annual leave','SYN-A',20,true,NULL),
  ('99999999-9999-4999-8999-999999999902','11111111-1111-4111-8111-111111111111','Synthetic missing-ledger leave','SYN-M',20,true,NULL),
  ('99999999-9999-4999-8999-999999999903','22222222-2222-4222-8222-222222222222','Synthetic tenant B leave','SYN-B',20,true,NULL),
  ('99999999-9999-4999-8999-999999999904','11111111-1111-4111-8111-111111111111','Synthetic evidence-required leave','SYN-E',20,true,NULL);
UPDATE public.leave_types SET requires_document_proof=true
WHERE id='99999999-9999-4999-8999-999999999904';

INSERT INTO public.leave_requests(id,tenant_id,employee_id,leave_type_id,from_date,to_date,requested_days,reason,day_portion,status) VALUES
  ('88888888-8888-4888-8888-888888888801','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999901','2026-10-12','2026-10-13',1,'Synthetic approval','full','pending'),
  ('88888888-8888-4888-8888-888888888802','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999901','2026-12-31','2027-01-01',2,'Synthetic year boundary','full','pending'),
  ('88888888-8888-4888-8888-888888888803','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999902','2026-12-31','2027-01-01',2,'Synthetic missing ledger','full','pending'),
  ('88888888-8888-4888-8888-888888888804','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999901','2026-10-14','2026-10-14',0.5,'Synthetic half day','first_half','pending'),
  ('88888888-8888-4888-8888-888888888805','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999901','2026-10-15','2026-10-15',1,'Synthetic concurrent decision','full','pending'),
  ('88888888-8888-4888-8888-888888888806','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999901','2026-10-16','2026-10-16',1,'Synthetic cross-tenant attempt','full','pending'),
  ('88888888-8888-4888-8888-888888888807','22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','99999999-9999-4999-8999-999999999903','2026-10-19','2026-10-19',1,'Synthetic tenant B request','full','pending'),
  ('88888888-8888-4888-8888-888888888808','22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','99999999-9999-4999-8999-999999999903','2026-10-20','2026-10-20',1,'Synthetic tenant B viewer request','full','pending'),
  ('88888888-8888-4888-8888-888888888809','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555558','99999999-9999-4999-8999-999999999901',(now() AT TIME ZONE 'Asia/Dhaka')::date,(now() AT TIME ZONE 'Asia/Dhaka')::date,1,'Synthetic approved leave dashboard count','full','approved');
INSERT INTO public.employee_leave_balances(id,tenant_id,employee_id,leave_type_id,balance_year,allocated_days,pending_days,used_days) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999901',2026,20,5,0),
  ('aaaaaaaa-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999901',2027,20,1,0),
  ('aaaaaaaa-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999902',2026,20,1,0),
  ('aaaaaaaa-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','99999999-9999-4999-8999-999999999903',2026,20,2,0);

INSERT INTO public.attendance_records(id,tenant_id,employee_id,attendance_date,check_in,check_out,work_mode,client_name,status,source,remarks) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',(now() AT TIME ZONE 'Asia/Dhaka')::date,now(),'2026-10-12 17:00:00+06','home','Existing Client','present','employee','Existing attendance'),
  ('bbbbbbbb-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666',(now() AT TIME ZONE 'Asia/Dhaka')::date,((now() AT TIME ZONE 'Asia/Dhaka')::date + time '09:10') AT TIME ZONE 'Asia/Dhaka','2026-10-12 17:10:00+06','office','Tenant B Client','present','employee','Tenant B attendance'),
  ('bbbbbbbb-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555556',(now() AT TIME ZONE 'Asia/Dhaka')::date,NULL,NULL,'office',NULL,'absent','employee','Explicit absent status'),
  ('bbbbbbbb-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555557',(now() AT TIME ZONE 'Asia/Dhaka')::date,now(),NULL,'client_meeting',NULL,'late','employee','Explicit late and client meeting values'),
  ('bbbbbbbb-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555559',(now() AT TIME ZONE 'Asia/Dhaka')::date,now(),NULL,'home',NULL,'present','employee','Explicit home work mode');
INSERT INTO public.attendance_corrections(id,tenant_id,employee_id,attendance_date,requested_check_in,requested_check_out,requested_work_mode,client_name,reason,status) VALUES
  ('cccccccc-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','2026-10-12','2026-10-12 09:30:00+06',NULL,NULL,NULL,'Synthetic check-in-only correction','pending'),
  ('cccccccc-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','2026-10-12','2026-10-12 09:45:00+06',NULL,NULL,NULL,'Synthetic tenant B manager attempt','pending'),
  ('cccccccc-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666',(now() AT TIME ZONE 'Asia/Dhaka')::date,NULL,((now() AT TIME ZONE 'Asia/Dhaka')::date + time '17:30') AT TIME ZONE 'Asia/Dhaka',NULL,NULL,'Synthetic tenant B checkout correction','pending'),
  ('cccccccc-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','2026-10-12',NULL,'2026-10-12 18:00:00+06',NULL,NULL,'Synthetic check-out-only correction','pending'),
  ('cccccccc-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','2026-10-12',NULL,NULL,'office',NULL,'Synthetic work-mode-only correction','pending'),
  ('cccccccc-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','2026-10-13','2026-10-13 09:00:00+06',NULL,NULL,NULL,'Synthetic missing-attendance-row correction','pending'),
  ('cccccccc-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','2026-10-14',NULL,'2026-10-14 17:00:00+06',NULL,NULL,'Synthetic concurrent attendance correction','pending'),
  ('cccccccc-0000-4000-8000-000000000008','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','2026-10-15',NULL,'2026-10-15 17:00:00+06',NULL,NULL,'Synthetic unauthorized attendance correction','pending'),
  ('cccccccc-0000-4000-8000-000000000009','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','2026-10-16',NULL,'2026-10-16 17:00:00+06',NULL,NULL,'Synthetic revoked attendance correction','pending');

CREATE POLICY leave_evidence_admin_select ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id='leave-evidence'
    AND (public.has_permission('leave.view') OR public.has_permission('leave.manage'))
  );
CREATE POLICY leave_evidence_employee_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id='leave-evidence'
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND public.employee_for_auth_user() IS NOT NULL
  );
CREATE POLICY leave_evidence_employee_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id='leave-evidence'
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND public.employee_for_auth_user() IS NOT NULL
  );
CREATE POLICY leave_evidence_employee_select ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id='leave-evidence'
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND public.employee_for_auth_user() IS NOT NULL
  );

COMMIT;
