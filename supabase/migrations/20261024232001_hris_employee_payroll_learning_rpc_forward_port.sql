-- Forward-only hosted release port: employee, referral, payroll, reporting and learning RPCs.
-- Target: replacement Supabase xfuxnljfrgvusbrpvxpa only.
-- Preserves the newest canonical Main definitions; does not synthesize historical ledger entries.
-- Source migration SHA-256 provenance:
--   20261024082000_employee_employment_details_e02_09.sql: 00c326daf4f4f2363570227bff7d7254d72f69df44cc1ddbd96369f4834005c1
--   20261013175151_employee_referral_workflow.sql: d37e9848e10d1e758b696408d477a5e5fe93e4c8e166d488397b6390b8b6116a
--   20261014120000_hris_tenant_payroll_register_read.sql: 1fb5f3509aa97a086ae6b0ab197b972576da4f91446ef9c9faa0870173b4fabc
--   20261015120000_hris_dashboard_team_report_date_filter.sql: ce8058cf0237580b55d9f4dfa39618873473cff9e3b7183af264d841b41b725b
--   20261013174500_hris_learning_program_management.sql: 9e1ecce9526a17bb157c87f65a52e81f0166f90330ef949c00aa951dd1bc9020
--   20261013190000_hris_learning_session_roster.sql: 08f13e9ce28c78a223de1ba046117390bba2ca916a5c551cbea3943af53fe91d
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.employee_referrals
  ADD COLUMN IF NOT EXISTS preferred_department_id uuid,
  ADD COLUMN IF NOT EXISTS candidate_profile_url text,
  ADD COLUMN IF NOT EXISTS referral_reason text,
  ADD COLUMN IF NOT EXISTS resume_storage_path text,
  ADD COLUMN IF NOT EXISTS resume_file_name text,
  ADD COLUMN IF NOT EXISTS resume_content_type text,
  ADD COLUMN IF NOT EXISTS resume_file_size bigint,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_referrals_preferred_department_id_fkey') THEN
    ALTER TABLE public.employee_referrals
      ADD CONSTRAINT employee_referrals_preferred_department_id_fkey
      FOREIGN KEY (preferred_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_referrals_status_updated_by_fkey') THEN
    ALTER TABLE public.employee_referrals
      ADD CONSTRAINT employee_referrals_status_updated_by_fkey
      FOREIGN KEY (status_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_referrals_candidate_profile_url_check') THEN
    ALTER TABLE public.employee_referrals
      ADD CONSTRAINT employee_referrals_candidate_profile_url_check
      CHECK (candidate_profile_url IS NULL OR
        (char_length(candidate_profile_url) <= 1000 AND candidate_profile_url ~* '^https?://[^[:space:]]+$'))
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_referrals_resume_metadata_check') THEN
    ALTER TABLE public.employee_referrals
      ADD CONSTRAINT employee_referrals_resume_metadata_check
      CHECK (
        (resume_storage_path IS NULL AND resume_file_name IS NULL AND resume_content_type IS NULL AND resume_file_size IS NULL)
        OR
        (resume_storage_path IS NOT NULL AND resume_file_name IS NOT NULL
          AND resume_content_type IS NOT NULL
          AND resume_content_type IN ('application/pdf','application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          AND resume_file_size BETWEEN 1 AND 5242880)
      ) NOT VALID;
  END IF;
END;
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS employee_referrals_resume_storage_path_key
  ON public.employee_referrals(resume_storage_path)
  WHERE resume_storage_path IS NOT NULL;

ALTER TABLE public.employee_referrals ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.employee_referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employee_referrals TO authenticated;

REVOKE ALL ON SCHEMA private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Source: 20261024082000_employee_employment_details_e02_09.sql :: public.employee_get_my_employment_info_v1
CREATE OR REPLACE FUNCTION public.employee_get_my_employment_info_v1(p_tenant_id uuid)
RETURNS TABLE (
  joining_date date,
  employment_type text,
  department_name text,
  department_code text,
  designation_title text,
  designation_code text,
  manager_name text,
  work_location_name text,
  grade_name text,
  grade_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_employee uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode = '42501';
  END IF;

  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.joining_date,
    NULLIF(btrim(e.employment_type), ''),
    NULLIF(btrim(department.name), ''),
    NULLIF(btrim(department.code), ''),
    NULLIF(btrim(designation.title), ''),
    NULLIF(btrim(designation.code), ''),
    NULLIF(btrim(manager.full_name), ''),
    NULLIF(btrim(work_location.name), ''),
    NULLIF(btrim(grade.name), ''),
    NULLIF(btrim(grade.code), '')
  FROM public.employees AS e
  LEFT JOIN public.designations AS designation
    ON designation.id = e.designation_id
   AND designation.tenant_id = e.tenant_id
  LEFT JOIN public.departments AS department
    ON department.id = COALESCE(e.department_id, designation.department_id)
   AND department.tenant_id = e.tenant_id
  LEFT JOIN public.grades AS grade
    ON grade.id = COALESCE(e.grade_id, designation.grade_id)
   AND grade.tenant_id = e.tenant_id
  LEFT JOIN public.employees AS manager
    ON manager.id = e.reporting_manager_id
   AND manager.tenant_id = e.tenant_id
  LEFT JOIN public.org_locations AS work_location
    ON work_location.id = COALESCE(e.work_location_id, department.location_id)
   AND work_location.tenant_id = e.tenant_id
  WHERE e.id = v_employee
    AND e.tenant_id = p_tenant_id
  LIMIT 1;
END;
$function$;
REVOKE ALL ON FUNCTION public.employee_get_my_employment_info_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_get_my_employment_info_v1(uuid) TO authenticated;

-- Source: 20261013175151_employee_referral_workflow.sql :: public.hris_get_employee_referral_workspace
CREATE OR REPLACE FUNCTION public.hris_get_employee_referral_workspace(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_can_view boolean;
  v_can_manage boolean;
  v_referrals jsonb;
  v_jobs jsonb;
  v_departments jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active organization and sign-in are required.' USING errcode='42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  v_can_view := public.has_tenant_permission(p_tenant_id,'referrals.view')
    OR public.has_tenant_permission(p_tenant_id,'referrals.manage');
  v_can_manage := public.has_tenant_permission(p_tenant_id,'referrals.manage');
  IF v_employee_id IS NULL AND NOT v_can_view THEN
    RAISE EXCEPTION 'An employee record or referral-view membership in this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'candidate_name',r.candidate_name,'candidate_email',r.candidate_email,
    'candidate_phone',r.candidate_phone,'relationship_note',r.relationship_note,
    'candidate_profile_url',r.candidate_profile_url,'referral_reason',r.referral_reason,
    'job_id',r.job_id,'job_title',j.title,'job_reference',j.reference_number,
    'preferred_department_id',r.preferred_department_id,'preferred_department',d.name,
    'resume_storage_path',r.resume_storage_path,'resume_file_name',r.resume_file_name,
    'resume_content_type',r.resume_content_type,'resume_file_size',r.resume_file_size,
    'status',r.status,'status_note',r.status_note,'status_updated_by',r.status_updated_by,
    'submitted_at',r.submitted_at,'updated_at',r.updated_at,
    'referrer_employee_id',e.id,'referrer_name',e.full_name,
    'referrer_employee_number',e.employee_number,'referrer_department',rd.name,
    'referrer_designation',des.title
  ) ORDER BY r.submitted_at DESC,r.id),'[]'::jsonb)
  INTO v_referrals
  FROM public.employee_referrals r
  JOIN public.employees e ON e.id=r.referrer_employee_id AND e.tenant_id=r.tenant_id
  LEFT JOIN public.jobs j ON j.id=r.job_id AND j.tenant_id=r.tenant_id
  LEFT JOIN public.departments d ON d.id=r.preferred_department_id AND d.tenant_id=r.tenant_id
  LEFT JOIN public.departments rd ON rd.id=e.department_id AND rd.tenant_id=r.tenant_id
  LEFT JOIN public.designations des ON des.id=e.designation_id AND des.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant_id
    AND (v_can_view OR r.referrer_employee_id=v_employee_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'reference_number',j.reference_number,'title',j.title,
    'department_id',j.department_id,'department_name',j.department_name
  ) ORDER BY j.title,j.reference_number),'[]'::jsonb)
  INTO v_jobs
  FROM public.jobs j
  WHERE j.tenant_id=p_tenant_id AND j.is_published IS TRUE AND j.status='published'
    AND j.is_active IS TRUE AND (j.application_deadline IS NULL OR j.application_deadline>=current_date);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) ORDER BY d.name,d.id),'[]'::jsonb)
  INTO v_departments
  FROM public.departments d
  WHERE d.tenant_id=p_tenant_id AND d.active IS TRUE;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'can_review',v_can_manage,'referrals',coalesce(v_referrals,'[]'::jsonb),
    'jobs',coalesce(v_jobs,'[]'::jsonb),'departments',coalesce(v_departments,'[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.hris_get_employee_referral_workspace(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_employee_referral_workspace(uuid) TO authenticated,service_role;

-- Source: 20261013175151_employee_referral_workflow.sql :: public.hris_submit_employee_referral
CREATE OR REPLACE FUNCTION public.hris_submit_employee_referral(p_tenant_id uuid,p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_referral_id uuid;
  v_name text := nullif(btrim(p_payload->>'candidate_name'),'');
  v_email text := lower(nullif(btrim(p_payload->>'candidate_email'),''));
  v_phone text := nullif(btrim(p_payload->>'candidate_phone'),'');
  v_relationship text := nullif(btrim(p_payload->>'relationship_note'),'');
  v_profile_url text := nullif(btrim(p_payload->>'candidate_profile_url'),'');
  v_reason text := nullif(btrim(p_payload->>'referral_reason'),'');
  v_job_id uuid := nullif(p_payload->>'job_id','')::uuid;
  v_department_id uuid := nullif(p_payload->>'preferred_department_id','')::uuid;
  v_path text := nullif(btrim(p_payload->>'resume_path'),'');
  v_file_name text := nullif(btrim(p_payload->>'resume_file_name'),'');
  v_mime text;
  v_size bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active organization and sign-in are required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF jsonb_typeof(p_payload)<>'object'
     OR v_name IS NULL OR length(v_name)>160
     OR v_email IS NULL OR length(v_email)>320
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_phone IS NOT NULL AND length(v_phone)>80
     OR v_relationship IS NULL OR length(v_relationship)>240
     OR v_profile_url IS NOT NULL AND (length(v_profile_url)>1000 OR v_profile_url !~* '^https?://[^[:space:]]+$')
     OR v_reason IS NOT NULL AND length(v_reason)>4000
     OR v_path IS NULL OR v_file_name IS NULL OR length(v_file_name)>255
     OR position('/' in v_file_name)>0 OR position(chr(92) in v_file_name)>0
     OR lower(v_path) !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+\.(pdf|doc|docx)$'
     OR split_part(v_path,'/',4)<>v_file_name
     OR (storage.foldername(v_path))[1]<>auth.uid()::text
     OR (storage.foldername(v_path))[2]<>p_tenant_id::text THEN
    RAISE EXCEPTION 'Enter the required referral details and attach a PDF or Word resume up to 5 MB.' USING errcode='22000';
  END IF;
  IF v_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.id=v_job_id AND j.tenant_id=p_tenant_id
      AND j.is_published IS TRUE AND j.status='published' AND j.is_active IS TRUE
      AND (j.application_deadline IS NULL OR j.application_deadline>=current_date)
  ) THEN
    RAISE EXCEPTION 'Select an open job in this organization.' USING errcode='22000';
  END IF;
  IF v_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.departments d WHERE d.id=v_department_id AND d.tenant_id=p_tenant_id AND d.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Select an active department in this organization.' USING errcode='22000';
  END IF;

  SELECT o.metadata->>'mimetype',
    CASE WHEN coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
      THEN (o.metadata->>'size')::bigint ELSE NULL END
  INTO v_mime,v_size FROM storage.objects o
  WHERE o.bucket_id='employee-referral-files' AND o.name=v_path;
  IF NOT FOUND OR v_mime NOT IN ('application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
     OR v_size IS NULL OR v_size<1 OR v_size>5242880
     OR lower(v_path) !~ (CASE v_mime
       WHEN 'application/pdf' THEN '\.pdf$'
       WHEN 'application/msword' THEN '\.doc$'
       ELSE '\.docx$'
     END) THEN
    RAISE EXCEPTION 'The uploaded resume is unavailable or does not match the accepted file type and size.' USING errcode='22000';
  END IF;

  INSERT INTO public.employee_referrals(
    tenant_id,referrer_employee_id,job_id,candidate_name,candidate_email,candidate_phone,
    relationship_note,cv_url,resume_storage_path,resume_file_name,resume_content_type,resume_file_size,
    candidate_profile_url,preferred_department_id,referral_reason,status,submitted_by
  ) VALUES (
    p_tenant_id,v_employee_id,v_job_id,v_name,v_email,v_phone,
    v_relationship,NULL,v_path,v_file_name,v_mime,v_size,
    v_profile_url,v_department_id,v_reason,'submitted',auth.uid()
  ) RETURNING id INTO v_referral_id;

  RETURN jsonb_build_object('id',v_referral_id,'status','submitted','submitted_at',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.hris_submit_employee_referral(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_submit_employee_referral(uuid,jsonb) TO authenticated,service_role;

-- Source: 20261013175151_employee_referral_workflow.sql :: public.hris_mark_employee_referral_in_review
CREATE OR REPLACE FUNCTION public.hris_mark_employee_referral_in_review(
  p_tenant_id uuid,p_referral_id uuid,p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE v_referral public.employee_referrals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'referrals.manage') THEN
    RAISE EXCEPTION 'Referral management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_note IS NOT NULL AND length(btrim(p_note))>2000 THEN
    RAISE EXCEPTION 'The review note must be 2,000 characters or fewer.' USING errcode='22000';
  END IF;

  UPDATE public.employee_referrals r
  SET status='in_review',status_note=nullif(btrim(coalesce(p_note,'')),''),
      status_updated_by=auth.uid(),updated_at=now()
  WHERE r.id=p_referral_id AND r.tenant_id=p_tenant_id AND r.status='submitted'
  RETURNING r.* INTO v_referral;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This referral is not available for review or is no longer awaiting review.' USING errcode='P0002';
  END IF;
  RETURN jsonb_build_object('id',v_referral.id,'status',v_referral.status,
    'status_note',v_referral.status_note,'updated_at',v_referral.updated_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.hris_mark_employee_referral_in_review(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_mark_employee_referral_in_review(uuid,uuid,text) TO authenticated,service_role;

-- Source: 20261014120000_hris_tenant_payroll_register_read.sql :: public.hris_get_tenant_payroll_register
CREATE OR REPLACE FUNCTION public.hris_get_tenant_payroll_register(
  p_tenant_id uuid,
  p_pay_period_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_periods jsonb;
  v_payslips jsonb;
  v_total_count integer;
  v_search text;
BEGIN
  IF NOT public.is_live_session()
      OR NOT EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id=p_tenant_id AND t.is_active IS TRUE
      )
      OR NOT (
        public.has_tenant_permission(p_tenant_id,'payroll.view')
        OR public.has_tenant_permission(p_tenant_id,'payroll.manage')
      ) THEN
    RAISE EXCEPTION 'Active payroll membership required.' USING errcode='42501';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('draft','released','void') THEN
    RAISE EXCEPTION 'Unsupported payslip status.' USING errcode='22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
      OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Invalid payroll register page.' USING errcode='22023';
  END IF;
  v_search:=NULLIF(btrim(p_search),'');
  IF length(v_search)>100 THEN
    RAISE EXCEPTION 'Search text is too long.' USING errcode='22023';
  END IF;

  IF p_pay_period_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pay_periods p
    WHERE p.id=p_pay_period_id AND p.tenant_id=p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Pay period was not found in this tenant.' USING errcode='22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'start_date',p.start_date,'end_date',p.end_date,
    'pay_date',p.pay_date,'status',p.status,'currency',p.currency
  ) ORDER BY COALESCE(p.pay_date,p.end_date) DESC,p.end_date DESC,p.id DESC),'[]'::jsonb)
  INTO v_periods
  FROM public.pay_periods p
  WHERE p.tenant_id=p_tenant_id;

  SELECT count(*)::integer INTO v_total_count
  FROM public.payslips s
  JOIN public.pay_periods p ON p.tenant_id=s.tenant_id AND p.id=s.pay_period_id
  JOIN public.employees e ON e.tenant_id=s.tenant_id AND e.id=s.employee_id
  WHERE s.tenant_id=p_tenant_id
    AND (p_pay_period_id IS NULL OR s.pay_period_id=p_pay_period_id)
    AND (p_status IS NULL OR s.status=p_status)
    AND (v_search IS NULL OR e.full_name ILIKE '%'||v_search||'%' OR e.employee_number ILIKE '%'||v_search||'%');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',r.id,'pay_period_id',r.pay_period_id,'period_name',r.period_name,
    'period_start_date',r.period_start_date,'pay_date',r.pay_date,
    'employee_id',r.employee_id,'employee_name',r.employee_name,
    'employee_number',r.employee_number,'currency',r.currency,'status',r.status,
    'gross_earnings',r.gross_earnings,'total_deductions',r.total_deductions,
    'net_salary',r.net_salary,'released_at',r.released_at
  ) ORDER BY COALESCE(r.pay_date,r.period_end_date) DESC,r.period_end_date DESC,
    r.employee_name,r.id),'[]'::jsonb)
  INTO v_payslips
  FROM (
    SELECT s.id,s.pay_period_id,p.name AS period_name,p.start_date AS period_start_date,
      p.end_date AS period_end_date,p.pay_date,e.id AS employee_id,e.full_name AS employee_name,
      e.employee_number,s.currency,s.status,s.gross_earnings,s.total_deductions,
      s.net_salary,s.released_at
    FROM public.payslips s
    JOIN public.pay_periods p ON p.tenant_id=s.tenant_id AND p.id=s.pay_period_id
    JOIN public.employees e ON e.tenant_id=s.tenant_id AND e.id=s.employee_id
    WHERE s.tenant_id=p_tenant_id
      AND (p_pay_period_id IS NULL OR s.pay_period_id=p_pay_period_id)
      AND (p_status IS NULL OR s.status=p_status)
      AND (v_search IS NULL OR e.full_name ILIKE '%'||v_search||'%' OR e.employee_number ILIKE '%'||v_search||'%')
    ORDER BY COALESCE(p.pay_date,p.end_date) DESC,p.end_date DESC,e.full_name,s.id
    LIMIT p_limit OFFSET p_offset
  ) r;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'periods',v_periods,'payslips',v_payslips,
    'total_count',v_total_count,'limit',p_limit,'offset',p_offset
  );
END
$function$;
REVOKE ALL ON FUNCTION public.hris_get_tenant_payroll_register(uuid,uuid,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_payroll_register(uuid,uuid,text,text,integer,integer) TO authenticated,service_role;

-- Source: 20261015120000_hris_dashboard_team_report_date_filter.sql :: public.hris_get_tenant_dashboard_team_report
CREATE OR REPLACE FUNCTION public.hris_get_tenant_dashboard_team_report(
  p_tenant_id uuid,
  p_report_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_timezone text;
  v_report_date date;
  v_teams jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'dashboard.view')
     OR NOT public.has_tenant_permission(p_tenant_id, 'reports.view') THEN
    RAISE EXCEPTION 'Tenant dashboard and report permissions required.' USING errcode = '42501';
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active dashboard organization required.' USING errcode = '42501';
  END IF;
  v_report_date := coalesce(p_report_date, (now() AT TIME ZONE v_timezone)::date);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'team_id', report.team_id,
    'team_name', report.team_name,
    'present_members', report.present_members,
    'absent_members', report.absent_members,
    'total_members', report.total_members,
    'work_from_office', report.work_from_office,
    'work_from_home', report.work_from_home,
    'client_meeting', report.client_meeting
  ) ORDER BY report.team_name), '[]'::jsonb)
  INTO v_teams
  FROM (
    SELECT
      t.id AS team_id,
      coalesce(t.name, 'Unassigned') AS team_name,
      count(a.id) FILTER (WHERE lower(btrim(a.status)) = 'present')::integer AS present_members,
      count(a.id) FILTER (WHERE lower(btrim(a.status)) = 'absent')::integer AS absent_members,
      count(e.id)::integer AS total_members,
      count(a.id) FILTER (WHERE lower(btrim(a.work_mode)) = 'office')::integer AS work_from_office,
      count(a.id) FILTER (WHERE lower(btrim(a.work_mode)) = 'home')::integer AS work_from_home,
      count(a.id) FILTER (WHERE lower(btrim(a.work_mode)) = 'client_meeting')::integer AS client_meeting
    FROM public.employees e
    LEFT JOIN public.teams t
      ON t.id = e.team_id AND t.tenant_id = e.tenant_id
    LEFT JOIN public.attendance_records a
      ON a.tenant_id = e.tenant_id
     AND a.employee_id = e.id
     AND a.attendance_date = v_report_date
    WHERE e.tenant_id = p_tenant_id
      AND e.employment_status NOT IN ('resigned', 'terminated')
    GROUP BY t.id, t.name
  ) report;

  RETURN jsonb_build_object('dashboard_date', v_report_date, 'teams', v_teams);
END;
$function$;
REVOKE ALL ON FUNCTION public.hris_get_tenant_dashboard_team_report(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_dashboard_team_report(uuid, date) TO authenticated, service_role;

-- Source: 20261015120000_hris_dashboard_team_report_date_filter.sql :: public.hris_get_tenant_dashboard_team_details
CREATE OR REPLACE FUNCTION public.hris_get_tenant_dashboard_team_details(
  p_tenant_id uuid,
  p_team_id uuid,
  p_unassigned boolean,
  p_report_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_timezone text;
  v_details jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'dashboard.view')
     OR NOT public.has_tenant_permission(p_tenant_id, 'reports.view') THEN
    RAISE EXCEPTION 'Tenant dashboard and report permissions required.' USING errcode = '42501';
  END IF;
  IF p_report_date IS NULL OR p_unassigned IS NULL OR p_unassigned = (p_team_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A valid report date and exactly one team scope are required.' USING errcode = '22000';
  END IF;

  SELECT t.timezone INTO v_timezone
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active dashboard organization required.' USING errcode = '42501';
  END IF;
  IF NOT p_unassigned AND NOT EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = p_team_id AND t.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Selected team is outside the active organization.' USING errcode = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'employee_name', report.employee_name,
    'employee_number', report.employee_number,
    'designation_title', report.designation_title,
    'department_name', report.department_name,
    'attendance_days', report.attendance_days,
    'office_hours', report.office_hours,
    'working_hours', report.working_hours,
    'deviation', report.deviation
  ) ORDER BY report.employee_name), '[]'::jsonb)
  INTO v_details
  FROM (
    SELECT
      e.full_name AS employee_name,
      e.employee_number,
      ds.title AS designation_title,
      d.name AS department_name,
      count(a.id)::integer AS attendance_days,
      round(sum(CASE WHEN a.id IS NULL OR lower(btrim(a.status)) IN ('weekend', 'holiday', 'on_leave') THEN 0
        ELSE coalesce(s.full_day_hours, 8) END)::numeric, 2) AS office_hours,
      round(sum(CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out >= a.check_in
        THEN extract(epoch FROM (a.check_out - a.check_in)) / 3600 ELSE 0 END)::numeric, 2) AS working_hours,
      round((
        sum(CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL AND a.check_out >= a.check_in
          THEN extract(epoch FROM (a.check_out - a.check_in)) / 3600 ELSE 0 END)
        - sum(CASE WHEN a.id IS NULL OR lower(btrim(a.status)) IN ('weekend', 'holiday', 'on_leave') THEN 0
          ELSE coalesce(s.full_day_hours, 8) END)
      )::numeric, 2) AS deviation
    FROM public.employees e
    LEFT JOIN public.teams t ON t.id = e.team_id AND t.tenant_id = e.tenant_id
    LEFT JOIN public.departments d ON d.id = e.department_id AND d.tenant_id = e.tenant_id
    LEFT JOIN public.designations ds ON ds.id = e.designation_id AND ds.tenant_id = e.tenant_id
    LEFT JOIN public.shifts s ON s.id = e.shift_id AND s.tenant_id = e.tenant_id
    LEFT JOIN public.attendance_records a
      ON a.tenant_id = e.tenant_id AND a.employee_id = e.id AND a.attendance_date = p_report_date
    WHERE e.tenant_id = p_tenant_id
      AND e.employment_status NOT IN ('resigned', 'terminated')
      AND (CASE WHEN p_unassigned THEN t.id IS NULL ELSE t.id = p_team_id END)
    GROUP BY e.id, e.employee_number, e.full_name, ds.title, d.name, s.full_day_hours
  ) report;

  RETURN jsonb_build_object('report_date', p_report_date, 'details', v_details);
END;
$function$;
REVOKE ALL ON FUNCTION public.hris_get_tenant_dashboard_team_details(uuid, uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_dashboard_team_details(uuid, uuid, boolean, date) TO authenticated, service_role;

-- Source: 20261013174500_hris_learning_program_management.sql :: public.hris_save_learning_session
CREATE OR REPLACE FUNCTION public.hris_save_learning_session(
  p_tenant_id uuid,p_program_id uuid,p_session_id uuid,p_trainer_name text,
  p_start_at timestamptz,p_end_at timestamptz,p_location text,p_meeting_url text,
  p_capacity integer,p_enrollment_deadline timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_session public.learning_sessions%ROWTYPE; v_enrolled_count integer;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_program_id IS NULL OR length(COALESCE(p_trainer_name,''))>200
      OR length(COALESCE(p_location,''))>300 OR length(COALESCE(p_meeting_url,''))>1000
      OR (NULLIF(btrim(COALESCE(p_meeting_url,'')),'') IS NOT NULL
        AND btrim(p_meeting_url)!~* '^https?://')
      OR (p_capacity IS NOT NULL AND p_capacity<1)
      OR (p_start_at IS NOT NULL AND p_end_at IS NOT NULL AND p_end_at<=p_start_at) THEN
    RAISE EXCEPTION 'Check the session details, time range, capacity and meeting link.' USING errcode='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_programs p
      WHERE p.tenant_id=p_tenant_id AND p.id=p_program_id AND p.active IS TRUE) THEN
    RAISE EXCEPTION 'Choose an active learning program before scheduling a session.' USING errcode='22023';
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.learning_sessions(
      tenant_id,program_id,trainer_name,start_at,end_at,location,meeting_url,
      capacity,enrollment_deadline,status,created_by
    ) VALUES (
      p_tenant_id,p_program_id,NULLIF(btrim(COALESCE(p_trainer_name,'')),''),p_start_at,p_end_at,
      NULLIF(btrim(COALESCE(p_location,'')),''),NULLIF(btrim(COALESCE(p_meeting_url,'')),''),
      p_capacity,p_enrollment_deadline,'scheduled',auth.uid()
    ) RETURNING * INTO v_session;
  ELSE
    SELECT s.* INTO v_session FROM public.learning_sessions s
    WHERE s.tenant_id=p_tenant_id AND s.program_id=p_program_id
      AND s.id=p_session_id AND s.status='scheduled' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Scheduled session not found in this organization.' USING errcode='P0002'; END IF;
    SELECT count(*)::integer INTO v_enrolled_count FROM public.learning_enrollments e
    WHERE e.tenant_id=p_tenant_id AND e.session_id=p_session_id AND e.status='enrolled';
    IF p_capacity IS NOT NULL AND p_capacity<v_enrolled_count THEN
      RAISE EXCEPTION 'Capacity cannot be lower than the current enrolled count.' USING errcode='22023';
    END IF;
    UPDATE public.learning_sessions s SET
      trainer_name=NULLIF(btrim(COALESCE(p_trainer_name,'')),''),start_at=p_start_at,end_at=p_end_at,
      location=NULLIF(btrim(COALESCE(p_location,'')),''),meeting_url=NULLIF(btrim(COALESCE(p_meeting_url,'')),''),
      capacity=p_capacity,enrollment_deadline=p_enrollment_deadline,updated_at=now()
    WHERE s.tenant_id=p_tenant_id AND s.id=p_session_id
    RETURNING s.* INTO v_session;
  END IF;
  RETURN jsonb_build_object(
    'id',v_session.id,'tenant_id',v_session.tenant_id,'program_id',v_session.program_id,
    'status',v_session.status,'capacity',v_session.capacity
  );
END $function$;
REVOKE ALL ON FUNCTION public.hris_save_learning_session(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_save_learning_session(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,timestamptz) TO authenticated,service_role;

-- Source: 20261013190000_hris_learning_session_roster.sql :: private.hris_get_learning_session_roster
CREATE OR REPLACE FUNCTION private.hris_get_learning_session_roster(
  p_tenant_id uuid,
  p_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_session public.learning_sessions%ROWTYPE;
  v_program_title text;
  v_learners jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
      OR NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;

  SELECT s.* INTO v_session
  FROM public.learning_sessions s
  WHERE s.tenant_id=p_tenant_id AND s.id=p_session_id AND s.status='scheduled';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scheduled learning session not found.' USING errcode='P0002';
  END IF;
  SELECT p.title INTO v_program_title
  FROM public.learning_programs p
  WHERE p.tenant_id=p_tenant_id AND p.id=v_session.program_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'enrollment_id',e.id,
    'employee_number',em.employee_number,
    'employee_name',em.full_name,
    'enrolled_at',e.created_at,
    'mandatory',e.mandatory,
    'due_date',e.due_date
  ) ORDER BY em.full_name,e.id),'[]'::jsonb)
    INTO v_learners
  FROM public.learning_enrollments e
  JOIN public.employees em ON em.tenant_id=e.tenant_id AND em.id=e.employee_id
  WHERE e.tenant_id=p_tenant_id AND e.session_id=p_session_id AND e.status='enrolled';

  RETURN jsonb_build_object(
    'session',jsonb_build_object(
      'id',v_session.id,
      'program_title',v_program_title,
      'trainer_name',v_session.trainer_name,
      'start_at',v_session.start_at,
      'end_at',v_session.end_at,
      'location',v_session.location,
      'capacity',v_session.capacity,
      'enrollment_deadline',v_session.enrollment_deadline,
      'status',v_session.status
    ),
    'learners',v_learners
  );
END
$function$;
REVOKE ALL ON FUNCTION private.hris_get_learning_session_roster(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.hris_get_learning_session_roster(uuid,uuid) TO authenticated;

-- Source: 20261013190000_hris_learning_session_roster.sql :: public.hris_get_learning_session_roster
CREATE OR REPLACE FUNCTION public.hris_get_learning_session_roster(
  p_tenant_id uuid,
  p_session_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT private.hris_get_learning_session_roster(p_tenant_id,p_session_id)
$function$;
REVOKE ALL ON FUNCTION public.hris_get_learning_session_roster(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_learning_session_roster(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS employee_referral_files_employee_insert ON storage.objects;
CREATE POLICY employee_referral_files_employee_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='employee-referral-files' AND public.is_live_session()
    AND (storage.foldername(storage.objects.name))[1]=(SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.tenants t
      WHERE t.id::text=(storage.foldername(storage.objects.name))[2] AND t.is_active IS TRUE
        AND public.hris_own_employee_for_tenant(t.id) IS NOT NULL));

DROP POLICY IF EXISTS employee_referral_files_scoped_read ON storage.objects;
CREATE POLICY employee_referral_files_scoped_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='employee-referral-files' AND public.is_live_session()
    AND EXISTS (SELECT 1 FROM public.employee_referrals r
      WHERE r.tenant_id::text=(storage.foldername(storage.objects.name))[2] AND r.resume_storage_path=storage.objects.name
        AND (r.referrer_employee_id=public.hris_own_employee_for_tenant(r.tenant_id)
          OR public.has_tenant_permission(r.tenant_id,'referrals.view')
          OR public.has_tenant_permission(r.tenant_id,'referrals.manage'))));

DROP POLICY IF EXISTS employee_referral_files_employee_delete_unattached ON storage.objects;
CREATE POLICY employee_referral_files_employee_delete_unattached
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='employee-referral-files' AND public.is_live_session()
    AND (storage.foldername(storage.objects.name))[1]=(SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.tenants t
      WHERE t.id::text=(storage.foldername(storage.objects.name))[2] AND t.is_active IS TRUE
        AND public.hris_own_employee_for_tenant(t.id) IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.employee_referrals r WHERE r.resume_storage_path=storage.objects.name));

COMMIT;
