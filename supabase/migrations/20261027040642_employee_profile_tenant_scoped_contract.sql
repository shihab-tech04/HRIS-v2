-- WS02: restore the Employee Profile fields and mutations represented by the
-- approved profile frames with explicit active-tenant/own-employee checks.
-- Scalar employee corrections continue through the HR review queue. The
-- scalar corrections remain in employees.address/mailing_address;
-- original structured address rows retain their separate existing table and
-- get an explicit-tenant, owner-scoped read/save contract (no new fields).
BEGIN;

-- P1-01 original verification-form parity: tax circle is a separate field from E-TIN.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tax_circle text;

-- These two source-backed fields exist in the approved Figma forms but were
-- missing from the prior row contracts. No other columns are introduced.
ALTER TABLE public.employee_education
  ADD COLUMN IF NOT EXISTS currently_studying boolean NOT NULL DEFAULT false;
ALTER TABLE public.employee_experience
  ADD COLUMN IF NOT EXISTS job_type text,
  ADD COLUMN IF NOT EXISTS company_website text;

-- Bank details are personal profile data. Keep them separate from salary and
-- payroll compensation rows so employees can add/update their own bank record
-- without creating a compensation record or supplying salary values.
CREATE TABLE IF NOT EXISTS public.employee_bank_details (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_name text CHECK (length(btrim(bank_name)) BETWEEN 1 AND 200),
  account_name text CHECK (length(btrim(account_name)) BETWEEN 1 AND 200),
  account_number text CHECK (length(btrim(account_number)) BETWEEN 1 AND 64),
  branch_name text CHECK (length(btrim(branch_name)) BETWEEN 1 AND 200),
  routing_number text CHECK (length(btrim(routing_number)) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_bank_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.employee_bank_details FROM PUBLIC, anon, authenticated, service_role;

-- Preserve bank values already stored in the former compensation/employee
-- columns, while leaving every salary and tax field untouched.
INSERT INTO public.employee_bank_details (
  employee_id, tenant_id, bank_name, account_name, account_number, branch_name, routing_number
)
SELECT e.id, e.tenant_id, c.bank_name, e.bank_account_name, c.bank_account_no,
       e.bank_branch_name, e.bank_routing_number
FROM public.employees e
LEFT JOIN public.employee_compensation c ON c.employee_id=e.id
WHERE c.bank_name IS NOT NULL OR c.bank_account_no IS NOT NULL
   OR e.bank_account_name IS NOT NULL OR e.bank_branch_name IS NOT NULL OR e.bank_routing_number IS NOT NULL
ON CONFLICT (employee_id) DO NOTHING;

-- Internal resolver: only an authenticated live session with active
-- membership may resolve its own active employee row in the requested tenant.
CREATE OR REPLACE FUNCTION private.hris_profile_own_employee(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
BEGIN
  IF p_tenant_id IS NULL
     OR NOT public.is_live_session()
     OR NOT public.hris_profile_change_active_member(p_tenant_id) THEN
    RAISE EXCEPTION 'Active employee membership is required.' USING errcode='42501';
  END IF;
  RETURN public.hris_own_employee_for_tenant(p_tenant_id);
END;
$function$;
REVOKE ALL ON FUNCTION private.hris_profile_own_employee(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Single tenant-scoped read projection for the Employee Profile. It returns
-- only the caller's own profile and deliberately omits payroll/salary/tax
-- compensation values. Legacy address rows are not merged into scalar fields.
CREATE OR REPLACE FUNCTION public.employee_get_my_profile_v1(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_result jsonb;
BEGIN
  IF v_employee IS NULL THEN
    RETURN jsonb_build_object('tenant_id',p_tenant_id,'employee',NULL,
      'addresses','[]'::jsonb,'education','[]'::jsonb,'experience','[]'::jsonb,'training','[]'::jsonb,
      'certifications','[]'::jsonb,'family_members','[]'::jsonb,'bank',NULL);
  END IF;

  SELECT jsonb_build_object(
    'tenant_id',p_tenant_id,
    'employee',jsonb_build_object(
      'id',e.id,'employee_number',e.employee_number,'full_name',e.full_name,
      'preferred_name',e.preferred_name,'official_email',e.official_email,
      'phone',e.phone,'official_phone',e.official_phone,'personal_email',e.personal_email,
      'date_of_birth',e.date_of_birth,'gender',e.gender,'father_name',e.father_name,
      'mother_name',e.mother_name,'birthplace',e.birthplace,'blood_group',e.blood_group,
      'religion',e.religion,'nationality',e.nationality,'marital_status',e.marital_status,
      'address',e.address,'mailing_address',e.mailing_address,
      'emergency_contact_name',e.emergency_contact_name,
      'emergency_contact_phone',e.emergency_contact_phone,
      'emergency_contact_relation',e.emergency_contact_relation,
      'nid_number',e.nid_number,'passport_number',e.passport_number,'etin_number',e.etin_number,
      'tax_circle',e.tax_circle,
      'designation_title',ds.title,'department_name',d.name,'team_name',tm.name,
      'work_location_name',wl.name
    ),
    'addresses',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',a.id,'address_type',a.address_type,'district',a.district,
        'thana',a.thana,'post_code',a.post_code,'city_village',a.city_village,
        'road_block_house',a.road_block_house
      ) ORDER BY CASE a.address_type WHEN 'Present' THEN 0 WHEN 'Permanent' THEN 1 ELSE 2 END,
        a.created_at,a.id)
      FROM public.employee_addresses a WHERE a.employee_id=e.id
    ),'[]'::jsonb),
    'education',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',x.id,'education_level',x.education_level,'institution',x.institution,
        'subject_major',x.subject_major,'degree_title',x.degree_title,
        'result_type',x.result_type,'result',x.result,
        'currently_studying',x.currently_studying,'starting_year',x.starting_year,
        'passing_year',x.passing_year,'duration',x.duration,'achievements',x.achievements
      ) ORDER BY x.passing_year DESC NULLS LAST,x.starting_year DESC NULLS LAST,x.created_at DESC)
      FROM public.employee_education x WHERE x.employee_id=e.id
    ),'[]'::jsonb),
    'experience',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',x.id,'role_title',x.role_title,'company',x.company,'job_type',x.job_type,
        'company_website',x.company_website,'joining_date',x.joining_date,
        'departure_date',x.departure_date,'total_duration',x.total_duration,
        'office_address',x.office_address,'description',x.description,
        'currently_working',x.currently_working
      ) ORDER BY x.joining_date DESC NULLS LAST,x.created_at DESC)
      FROM public.employee_experience x WHERE x.employee_id=e.id
    ),'[]'::jsonb),
    'training',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',x.id,'title',x.title,'institute_name',x.institute_name,
        'training_number',x.training_number,'start_date',x.start_date,'end_date',x.end_date,
        'year',x.year,'duration',x.duration,'summary',x.summary,'certificate_url',x.certificate_url
      ) ORDER BY x.start_date DESC NULLS LAST,x.created_at DESC)
      FROM public.employee_training x WHERE x.employee_id=e.id
    ),'[]'::jsonb),
    'certifications',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',x.id,'title',x.title,'institute_name',x.institute_name,'issued_by',x.issued_by,
        'certification_number',x.certification_number,'license_number',x.license_number,
        'issue_date',x.issue_date,'expiry_date',x.expiry_date,'year',x.year,
        'duration',x.duration,'summary',x.summary,'certificate_document_url',x.certificate_document_url
      ) ORDER BY x.issue_date DESC NULLS LAST,x.created_at DESC)
      FROM public.employee_certifications x WHERE x.employee_id=e.id
    ),'[]'::jsonb),
    'family_members',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',x.id,'name',x.name,'phone',x.phone,'nid_number',x.nid_number,
        'date_of_birth',x.date_of_birth,'relationship',x.relationship,
        'present_address',x.present_address,'permanent_address',x.permanent_address,
        'is_nominee',x.is_nominee
      ) ORDER BY x.name,x.created_at)
      FROM public.employee_family_members x WHERE x.employee_id=e.id
    ),'[]'::jsonb),
    'bank',(SELECT jsonb_build_object(
        'bank_name',b.bank_name,'account_name',b.account_name,'account_number',b.account_number,
        'branch_name',b.branch_name,'routing_number',b.routing_number
      ) FROM public.employee_bank_details b
      WHERE b.employee_id=e.id AND b.tenant_id=p_tenant_id)
  ) INTO v_result
  FROM public.employees e
  LEFT JOIN public.designations ds ON ds.id=e.designation_id AND ds.tenant_id=e.tenant_id
  LEFT JOIN public.departments d ON d.id=e.department_id AND d.tenant_id=e.tenant_id
  LEFT JOIN public.teams tm ON tm.id=e.team_id AND tm.tenant_id=e.tenant_id
  LEFT JOIN public.org_locations wl ON wl.id=e.work_location_id AND wl.tenant_id=e.tenant_id
  WHERE e.id=v_employee AND e.tenant_id=p_tenant_id;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.employee_get_my_profile_v1(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.employee_get_my_profile_v1(uuid) TO authenticated;

-- Structured employee addresses retain the already deployed row/field model.
-- This is the tenant-explicit successor of the previous implicit-tenant writer.
-- It never deletes an existing address by omission or alters scalar
-- employees.address / employees.mailing_address correction-workflow fields.
CREATE OR REPLACE FUNCTION public.employee_save_my_addresses_v1(
  p_tenant_id uuid, p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_id uuid;
  v_existing uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_count integer := 0;
  v_omitted integer;
  v_type text;
  r jsonb;
BEGIN
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee record is required.' USING errcode='42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'Expected an array of up to 100 address records.' USING errcode='22023';
  END IF;
  PERFORM 1 FROM public.employees e
    WHERE e.id=v_employee AND e.tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee record not found in this tenant.' USING errcode='42501';
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(r) <> 'object' OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(r) AS k
      WHERE k NOT IN (
        'id','address_type','district','thana','post_code','city_village','road_block_house'
      )
    ) THEN
      RAISE EXCEPTION 'Unsupported address fields.' USING errcode='22023';
    END IF;
    v_id := nullif(r->>'id','')::uuid;
    v_type := coalesce(nullif(r->>'address_type',''),'Other');
    IF v_type NOT IN ('Present','Permanent','Other') THEN
      RAISE EXCEPTION 'Unsupported address type.' USING errcode='22023';
    END IF;
    IF v_id IS NOT NULL AND v_id=ANY(v_seen) THEN
      RAISE EXCEPTION 'Duplicate address ID.' USING errcode='22023';
    END IF;
    IF v_id IS NULL THEN
      INSERT INTO public.employee_addresses (
        employee_id,address_type,district,thana,post_code,city_village,road_block_house
      ) VALUES (
        v_employee,v_type,nullif(r->>'district',''),nullif(r->>'thana',''),
        nullif(r->>'post_code',''),nullif(r->>'city_village',''),
        nullif(r->>'road_block_house','')
      ) RETURNING id INTO v_id;
    ELSE
      SELECT a.id INTO v_existing FROM public.employee_addresses a
      WHERE a.id=v_id AND a.employee_id=v_employee FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Address row does not belong to current employee.' USING errcode='42501';
      END IF;
      UPDATE public.employee_addresses SET
        address_type=CASE WHEN r ? 'address_type' THEN v_type ELSE address_type END,
        district=CASE WHEN r ? 'district' THEN nullif(r->>'district','') ELSE district END,
        thana=CASE WHEN r ? 'thana' THEN nullif(r->>'thana','') ELSE thana END,
        post_code=CASE WHEN r ? 'post_code' THEN nullif(r->>'post_code','') ELSE post_code END,
        city_village=CASE WHEN r ? 'city_village' THEN nullif(r->>'city_village','') ELSE city_village END,
        road_block_house=CASE WHEN r ? 'road_block_house' THEN nullif(r->>'road_block_house','') ELSE road_block_house END
      WHERE id=v_id AND employee_id=v_employee;
    END IF;
    v_seen := array_append(v_seen,v_id);
    v_count := v_count+1;
  END LOOP;
  SELECT count(*) INTO v_omitted FROM public.employee_addresses a
    WHERE a.employee_id=v_employee AND NOT (a.id=ANY(v_seen));
  IF v_omitted <> 0 THEN
    RAISE EXCEPTION 'Existing addresses cannot be removed by saving the list.' USING errcode='22023';
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'employee.profile.addresses.saved_v1','employee',v_employee::text,
    jsonb_build_object('row_count',v_count,'preserved_ids',true,'tenant_id',p_tenant_id));
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.employee_save_my_addresses_v1(uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_save_my_addresses_v1(uuid,jsonb)
  TO authenticated;

-- Extend the current one-field HR review workflow only to scalar fields that
-- already exist in employees and appear in the approved Employee Profile UI.
ALTER TABLE public.employee_profile_change_requests
  DROP CONSTRAINT IF EXISTS employee_profile_change_requests_field_key_check;
ALTER TABLE public.employee_profile_change_requests
  ADD CONSTRAINT employee_profile_change_requests_field_key_check CHECK (field_key = ANY (ARRAY[
    'full_name','official_email','phone','personal_email','official_phone',
    'address','mailing_address','emergency_contact_name','emergency_contact_phone',
    'emergency_contact_relation','father_name','mother_name','date_of_birth',
    'birthplace','blood_group','gender','religion','nationality','marital_status',
    'nid_number','passport_number','etin_number','tax_circle'
  ]::text[]));

CREATE OR REPLACE FUNCTION public.employee_submit_profile_change_request(
  p_tenant_id uuid,p_field_key text,p_requested_value text,p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_value text := nullif(btrim(coalesce(p_requested_value,'')),'');
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_current text;
  v_date date;
  v_id uuid;
BEGIN
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record is required.' USING errcode='42501';
  END IF;
  IF p_field_key IS NULL OR p_field_key NOT IN (
    'full_name','official_email','phone','personal_email','official_phone',
    'address','mailing_address','emergency_contact_name','emergency_contact_phone',
    'emergency_contact_relation','father_name','mother_name','date_of_birth',
    'birthplace','blood_group','gender','religion','nationality','marital_status',
    'nid_number','passport_number','etin_number','tax_circle'
  ) THEN
    RAISE EXCEPTION 'This profile field is not available for an employee change request.' USING errcode='22023';
  END IF;
  IF v_value IS NULL OR length(v_value)>500 THEN
    RAISE EXCEPTION 'Enter a proposed value of 1 to 500 characters.' USING errcode='22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason)>1000 THEN
    RAISE EXCEPTION 'Enter a reason of 1 to 1000 characters.' USING errcode='22023';
  END IF;
  IF p_field_key IN ('official_email','personal_email')
     AND v_value !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING errcode='22023';
  END IF;
  IF p_field_key IN ('phone','official_phone','emergency_contact_phone')
     AND length(regexp_replace(v_value,'[^0-9]','','g')) NOT BETWEEN 7 AND 15 THEN
    RAISE EXCEPTION 'Enter a valid phone number.' USING errcode='22023';
  END IF;
  IF p_field_key='gender' AND v_value NOT IN ('Male','Female','Other') THEN
    RAISE EXCEPTION 'Choose a valid gender.' USING errcode='22023';
  END IF;
  IF p_field_key='date_of_birth' THEN
    IF v_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Enter a valid date of birth.' USING errcode='22023';
    END IF;
    BEGIN v_date := v_value::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Enter a valid date of birth.' USING errcode='22023';
    END;
    IF v_date < DATE '1900-01-01' OR v_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'Date of birth must be between 1900 and today.' USING errcode='22023';
    END IF;
    v_value := v_date::text;
  END IF;

  SELECT CASE p_field_key
    WHEN 'full_name' THEN e.full_name
    WHEN 'official_email' THEN e.official_email
    WHEN 'phone' THEN e.phone
    WHEN 'personal_email' THEN e.personal_email
    WHEN 'official_phone' THEN e.official_phone
    WHEN 'address' THEN e.address
    WHEN 'mailing_address' THEN e.mailing_address
    WHEN 'emergency_contact_name' THEN e.emergency_contact_name
    WHEN 'emergency_contact_phone' THEN e.emergency_contact_phone
    WHEN 'emergency_contact_relation' THEN e.emergency_contact_relation
    WHEN 'father_name' THEN e.father_name
    WHEN 'mother_name' THEN e.mother_name
    WHEN 'date_of_birth' THEN e.date_of_birth::text
    WHEN 'birthplace' THEN e.birthplace
    WHEN 'blood_group' THEN e.blood_group
    WHEN 'gender' THEN e.gender
    WHEN 'religion' THEN e.religion
    WHEN 'nationality' THEN e.nationality
    WHEN 'marital_status' THEN e.marital_status
    WHEN 'nid_number' THEN e.nid_number
    WHEN 'passport_number' THEN e.passport_number
    WHEN 'etin_number' THEN e.etin_number
    WHEN 'tax_circle' THEN e.tax_circle
  END INTO v_current
  FROM public.employees e WHERE e.id=v_employee AND e.tenant_id=p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linked employee record not found.' USING errcode='P0002'; END IF;
  IF v_current IS NOT DISTINCT FROM v_value THEN
    RAISE EXCEPTION 'The proposed value matches the current value.' USING errcode='22023';
  END IF;

  INSERT INTO public.employee_profile_change_requests(
    tenant_id,employee_id,requested_by,field_key,requested_value,reason
  ) VALUES(p_tenant_id,v_employee,auth.uid(),p_field_key,v_value,v_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A pending request already exists for this profile field.' USING errcode='23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_profile_change_request(
  p_tenant_id uuid,p_id uuid,p_decision text,p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  r public.employee_profile_change_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'self_service.manage') THEN
    RAISE EXCEPTION 'Active-tenant self-service management permission required.' USING errcode='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode='22023';
  END IF;
  IF length(coalesce(v_note,''))>1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer.' USING errcode='22023';
  END IF;
  SELECT * INTO r FROM public.employee_profile_change_requests
  WHERE id=p_id AND tenant_id=p_tenant_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending profile change request not found.' USING errcode='P0002'; END IF;
  -- Four-eyes approval: even a reviewer with self_service.manage must not
  -- approve or reject a request that they submitted themselves.
  IF r.requested_by IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Reviewers cannot decide their own profile change requests.' USING errcode='42501';
  END IF;
  IF p_decision='approved' AND r.field_key NOT IN (
    'full_name','official_email','phone','personal_email','official_phone',
    'address','mailing_address','emergency_contact_name','emergency_contact_phone',
    'emergency_contact_relation','father_name','mother_name','date_of_birth',
    'birthplace','blood_group','gender','religion','nationality','marital_status',
    'nid_number','passport_number','etin_number','tax_circle'
  ) THEN
    RAISE EXCEPTION 'This profile field is not supported by the employee schema.' USING errcode='22023';
  END IF;
  IF p_decision='approved' THEN
    UPDATE public.employees e SET
      full_name=CASE WHEN r.field_key='full_name' THEN r.requested_value ELSE e.full_name END,
      official_email=CASE WHEN r.field_key='official_email' THEN r.requested_value ELSE e.official_email END,
      phone=CASE WHEN r.field_key='phone' THEN r.requested_value ELSE e.phone END,
      personal_email=CASE WHEN r.field_key='personal_email' THEN r.requested_value ELSE e.personal_email END,
      official_phone=CASE WHEN r.field_key='official_phone' THEN r.requested_value ELSE e.official_phone END,
      address=CASE WHEN r.field_key='address' THEN r.requested_value ELSE e.address END,
      mailing_address=CASE WHEN r.field_key='mailing_address' THEN r.requested_value ELSE e.mailing_address END,
      emergency_contact_name=CASE WHEN r.field_key='emergency_contact_name' THEN r.requested_value ELSE e.emergency_contact_name END,
      emergency_contact_phone=CASE WHEN r.field_key='emergency_contact_phone' THEN r.requested_value ELSE e.emergency_contact_phone END,
      emergency_contact_relation=CASE WHEN r.field_key='emergency_contact_relation' THEN r.requested_value ELSE e.emergency_contact_relation END,
      father_name=CASE WHEN r.field_key='father_name' THEN r.requested_value ELSE e.father_name END,
      mother_name=CASE WHEN r.field_key='mother_name' THEN r.requested_value ELSE e.mother_name END,
      date_of_birth=CASE WHEN r.field_key='date_of_birth' THEN r.requested_value::date ELSE e.date_of_birth END,
      birthplace=CASE WHEN r.field_key='birthplace' THEN r.requested_value ELSE e.birthplace END,
      blood_group=CASE WHEN r.field_key='blood_group' THEN r.requested_value ELSE e.blood_group END,
      gender=CASE WHEN r.field_key='gender' THEN r.requested_value ELSE e.gender END,
      religion=CASE WHEN r.field_key='religion' THEN r.requested_value ELSE e.religion END,
      nationality=CASE WHEN r.field_key='nationality' THEN r.requested_value ELSE e.nationality END,
      marital_status=CASE WHEN r.field_key='marital_status' THEN r.requested_value ELSE e.marital_status END,
      nid_number=CASE WHEN r.field_key='nid_number' THEN r.requested_value ELSE e.nid_number END,
      passport_number=CASE WHEN r.field_key='passport_number' THEN r.requested_value ELSE e.passport_number END,
      etin_number=CASE WHEN r.field_key='etin_number' THEN r.requested_value ELSE e.etin_number END,
      tax_circle=CASE WHEN r.field_key='tax_circle' THEN r.requested_value ELSE e.tax_circle END,
      updated_at=now()
    WHERE e.id=r.employee_id AND e.tenant_id=p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked employee record not found.' USING errcode='P0002'; END IF;
  END IF;
  UPDATE public.employee_profile_change_requests
  SET status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=v_note,updated_at=now()
  WHERE id=r.id AND tenant_id=p_tenant_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile change request was already decided.' USING errcode='P0002'; END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'self_service.profile_change.'||p_decision,
    'employee_profile_change_request',r.id::text,
    jsonb_build_object('employee_id',r.employee_id,'field_key',r.field_key));
  RETURN jsonb_build_object('success',true,'status',p_decision);
END;
$function$;

REVOKE ALL ON FUNCTION public.employee_submit_profile_change_request(uuid,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_review_profile_change_request(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_submit_profile_change_request(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_profile_change_request(uuid,uuid,text,text) TO authenticated;

-- Retire tenantless profile write/read RPCs left by the replacement hosted
-- project. Source clients use only the new tenant-aware contracts below.
DO $retire_legacy$
BEGIN
  IF to_regprocedure('public.employee_get_my_profile()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.employee_get_my_profile() FROM PUBLIC, anon, authenticated, service_role';
  END IF;
  IF to_regprocedure('public.employee_update_my_profile(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.employee_update_my_profile(jsonb) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
  IF to_regprocedure('public.employee_update_my_bank(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.employee_update_my_bank(jsonb) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
  IF to_regprocedure('public.employee_save_my_addresses_v2(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.employee_save_my_addresses_v2(jsonb) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
  IF to_regprocedure('public.employee_save_my_education_v2(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.employee_save_my_education_v2(jsonb) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
  IF to_regprocedure('public.employee_save_my_experience_v2(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.employee_save_my_experience_v2(jsonb) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
  IF to_regprocedure('public.employee_save_my_family_members_v2(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.employee_save_my_family_members_v2(jsonb) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
  IF to_regprocedure('public.employee_replace_my_profile_section(text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.employee_replace_my_profile_section(text,jsonb) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END
$retire_legacy$;

-- Employee-added certificate objects live under their own Auth and tenant
-- folders. The profile save RPC registers the path in employee_documents;
-- direct table writes and object overwrites remain unavailable.
CREATE OR REPLACE FUNCTION private.hris_profile_document_is_unlinked(
  p_tenant_id uuid,p_name text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
BEGIN
  IF v_employee IS NULL THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.employee_documents d
    WHERE d.employee_id=v_employee AND d.file_url=p_name
  ) AND NOT EXISTS (
    SELECT 1 FROM public.employee_training t
    WHERE t.employee_id=v_employee AND t.certificate_url=p_name
  ) AND NOT EXISTS (
    SELECT 1 FROM public.employee_certifications c
    WHERE c.employee_id=v_employee AND c.certificate_document_url=p_name
  );
END;
$function$;
REVOKE ALL ON FUNCTION private.hris_profile_document_is_unlinked(uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.hris_profile_document_is_unlinked(uuid,text) TO authenticated;

DROP POLICY IF EXISTS employee_profile_certificate_insert ON storage.objects;
CREATE POLICY employee_profile_certificate_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='employee-documents'
    AND public.is_live_session()
    AND split_part(name,'/',1)=(SELECT auth.uid())::text
    AND split_part(name,'/',3)='profile-certificates'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/profile-certificates/[0-9a-f-]{36}[.](pdf|png|jpg|jpeg)$'
    AND public.hris_profile_change_active_member(split_part(name,'/',2)::uuid)
    AND public.hris_own_employee_for_tenant(split_part(name,'/',2)::uuid) IS NOT NULL
  );

DROP POLICY IF EXISTS employee_profile_certificate_orphan_delete ON storage.objects;
CREATE POLICY employee_profile_certificate_orphan_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id='employee-documents'
    AND split_part(name,'/',3)='profile-certificates'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/profile-certificates/[0-9a-f-]{36}[.](pdf|png|jpg|jpeg)$'
    AND split_part(name,'/',1)=(SELECT auth.uid())::text
    AND private.hris_profile_document_is_unlinked(split_part(name,'/',2)::uuid,name)
  );

CREATE OR REPLACE FUNCTION public.employee_save_my_education_v1(
  p_tenant_id uuid,p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_id uuid; v_start integer; v_pass integer; v_current boolean;
  v_level text; v_institution text; v_subject text; v_degree text;
  v_result_type text; v_result text; v_duration text; v_achievements text;
BEGIN
  IF v_employee IS NULL THEN RAISE EXCEPTION 'Linked employee record is required.' USING errcode='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile details must be an object.' USING errcode='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(p_payload,'{}'::jsonb)) k
    WHERE k NOT IN ('id','education_level','institution','subject_major','degree_title',
      'result_type','result','currently_studying','starting_year','passing_year','duration','achievements')
  ) THEN RAISE EXCEPTION 'Unsupported education fields.' USING errcode='22023'; END IF;
  v_id := nullif(p_payload->>'id','')::uuid;
  v_level := nullif(btrim(p_payload->>'education_level'),'');
  v_institution := nullif(btrim(p_payload->>'institution'),'');
  v_subject := nullif(btrim(p_payload->>'subject_major'),'');
  v_degree := nullif(btrim(p_payload->>'degree_title'),'');
  v_result_type := nullif(btrim(p_payload->>'result_type'),'');
  v_result := nullif(btrim(p_payload->>'result'),'');
  v_duration := nullif(btrim(p_payload->>'duration'),'');
  v_achievements := nullif(btrim(p_payload->>'achievements'),'');
  IF v_level IS NULL OR v_institution IS NULL OR v_subject IS NULL OR v_degree IS NULL
     OR v_result_type IS NULL OR v_result IS NULL OR v_duration IS NULL
     OR length(v_level)>120 OR length(v_institution)>255 OR length(v_subject)>255
     OR length(v_degree)>255 OR length(v_result_type)>120 OR length(v_result)>120
     OR length(v_duration)>120 OR length(coalesce(v_achievements,''))>1000 THEN
    RAISE EXCEPTION 'Complete the required education fields using the allowed lengths.' USING errcode='22023';
  END IF;
  IF coalesce(p_payload->>'starting_year','') !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Enter a valid starting year.' USING errcode='22023';
  END IF;
  v_start := (p_payload->>'starting_year')::integer;
  IF coalesce(p_payload->>'currently_studying','false') NOT IN ('true','false') THEN
    RAISE EXCEPTION 'Choose whether this education is currently in progress.' USING errcode='22023';
  END IF;
  v_current := coalesce((p_payload->>'currently_studying')::boolean,false);
  IF NOT v_current AND coalesce(p_payload->>'passing_year','') !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Enter a valid passing year.' USING errcode='22023';
  END IF;
  v_pass := CASE WHEN v_current THEN NULL ELSE (p_payload->>'passing_year')::integer END;
  IF v_start NOT BETWEEN 1900 AND 2200 OR (NOT v_current AND (v_pass IS NULL OR v_pass NOT BETWEEN v_start AND 2200)) THEN
    RAISE EXCEPTION 'Passing year must be on or after the starting year.' USING errcode='22023';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.employee_education(
      employee_id,education_level,institution,subject_major,degree_title,result_type,result,
      currently_studying,starting_year,passing_year,duration,achievements
    ) VALUES(v_employee,v_level,v_institution,v_subject,v_degree,v_result_type,v_result,
      v_current,v_start,v_pass,v_duration,v_achievements) RETURNING id INTO v_id;
  ELSE
    UPDATE public.employee_education SET education_level=v_level,institution=v_institution,
      subject_major=v_subject,degree_title=v_degree,result_type=v_result_type,result=v_result,
      currently_studying=v_current,starting_year=v_start,passing_year=v_pass,duration=v_duration,
      achievements=v_achievements
    WHERE id=v_id AND employee_id=v_employee;
    IF NOT FOUND THEN RAISE EXCEPTION 'Education record does not belong to the current employee.' USING errcode='42501'; END IF;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'employee.profile.education.saved_v1','employee',v_employee::text,
    jsonb_build_object('row_id',v_id,'fields',ARRAY['education_level','institution','subject_major','degree_title','result_type','result','currently_studying','starting_year','passing_year','duration','achievements']));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_save_my_experience_v1(
  p_tenant_id uuid,p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_id uuid; v_company text; v_role text; v_type text; v_website text;
  v_start date; v_end date; v_duration text; v_address text; v_description text;
BEGIN
  IF v_employee IS NULL THEN RAISE EXCEPTION 'Linked employee record is required.' USING errcode='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile details must be an object.' USING errcode='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(p_payload,'{}'::jsonb)) k
    WHERE k NOT IN ('id','company','role_title','job_type','company_website','joining_date',
      'departure_date','total_duration','office_address','description')
  ) THEN RAISE EXCEPTION 'Unsupported experience fields.' USING errcode='22023'; END IF;
  v_id := nullif(p_payload->>'id','')::uuid;
  v_company := nullif(btrim(p_payload->>'company'),'');
  v_role := nullif(btrim(p_payload->>'role_title'),'');
  v_type := nullif(btrim(p_payload->>'job_type'),'');
  v_website := nullif(btrim(p_payload->>'company_website'),'');
  v_duration := nullif(btrim(p_payload->>'total_duration'),'');
  v_address := nullif(btrim(p_payload->>'office_address'),'');
  v_description := nullif(btrim(p_payload->>'description'),'');
  IF v_company IS NULL OR v_role IS NULL OR v_type IS NULL OR v_duration IS NULL
     OR v_address IS NULL OR v_description IS NULL
     OR length(v_company)>255 OR length(v_role)>255 OR length(v_type)>120
     OR length(coalesce(v_website,''))>500 OR length(v_duration)>120
     OR length(v_address)>500 OR length(v_description)>2000 THEN
    RAISE EXCEPTION 'Complete the required experience fields using the allowed lengths.' USING errcode='22023';
  END IF;
  IF coalesce(p_payload->>'joining_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR coalesce(p_payload->>'departure_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Enter valid experience dates.' USING errcode='22023';
  END IF;
  BEGIN
    v_start := (p_payload->>'joining_date')::date;
    v_end := (p_payload->>'departure_date')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'Enter valid experience dates.' USING errcode='22023';
  END;
  IF v_end<v_start THEN RAISE EXCEPTION 'Departure date must be on or after the joining date.' USING errcode='22023'; END IF;
  IF v_website IS NOT NULL AND (v_website !~* '^https?://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'Enter a valid company website URL.' USING errcode='22023';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.employee_experience(
      employee_id,company,role_title,department,office_address,joining_date,departure_date,
      currently_working,total_duration,description,job_type,company_website
    ) VALUES(v_employee,v_company,v_role,NULL,v_address,v_start,v_end,false,v_duration,
      v_description,v_type,v_website) RETURNING id INTO v_id;
  ELSE
    UPDATE public.employee_experience SET company=v_company,role_title=v_role,
      office_address=v_address,joining_date=v_start,departure_date=v_end,
      currently_working=false,total_duration=v_duration,description=v_description,
      job_type=v_type,company_website=v_website
    WHERE id=v_id AND employee_id=v_employee;
    IF NOT FOUND THEN RAISE EXCEPTION 'Experience record does not belong to the current employee.' USING errcode='42501'; END IF;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'employee.profile.experience.saved_v1','employee',v_employee::text,
    jsonb_build_object('row_id',v_id,'fields',ARRAY['company','role_title','job_type','company_website','joining_date','departure_date','total_duration','office_address','description']));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_save_my_family_member_v1(
  p_tenant_id uuid,p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_id uuid; v_name text; v_phone text; v_nid text; v_dob date;
  v_relation text; v_present text; v_permanent text; v_nominee boolean;
BEGIN
  IF v_employee IS NULL THEN RAISE EXCEPTION 'Linked employee record is required.' USING errcode='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile details must be an object.' USING errcode='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(p_payload,'{}'::jsonb)) k
    WHERE k NOT IN ('id','name','phone','nid_number','date_of_birth','relationship',
      'present_address','permanent_address','is_nominee')
  ) THEN RAISE EXCEPTION 'Unsupported family member fields.' USING errcode='22023'; END IF;
  v_id := nullif(p_payload->>'id','')::uuid;
  v_name := nullif(btrim(p_payload->>'name'),''); v_phone := nullif(btrim(p_payload->>'phone'),'');
  v_nid := nullif(btrim(p_payload->>'nid_number'),'');
  v_relation := nullif(btrim(p_payload->>'relationship'),'');
  v_present := nullif(btrim(p_payload->>'present_address'),'');
  v_permanent := nullif(btrim(p_payload->>'permanent_address'),'');
  v_nominee := coalesce((p_payload->>'is_nominee')::boolean,false);
  IF v_name IS NULL OR v_phone IS NULL OR v_nid IS NULL OR v_relation IS NULL
     OR v_present IS NULL OR v_permanent IS NULL OR length(v_name)>200
     OR length(v_phone)>32 OR length(regexp_replace(v_phone,'[^0-9]','','g')) NOT BETWEEN 7 AND 15
     OR length(v_nid)>100 OR length(v_relation)>120 OR length(v_present)>500 OR length(v_permanent)>500 THEN
    RAISE EXCEPTION 'Complete the required family details using the allowed lengths.' USING errcode='22023';
  END IF;
  IF coalesce(p_payload->>'date_of_birth','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Enter a valid family member date of birth.' USING errcode='22023';
  END IF;
  BEGIN v_dob := (p_payload->>'date_of_birth')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'Enter a valid family member date of birth.' USING errcode='22023';
  END;
  IF v_dob>CURRENT_DATE THEN RAISE EXCEPTION 'Family member date of birth cannot be in the future.' USING errcode='22023'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.employee_family_members(
      employee_id,name,phone,nid_number,date_of_birth,relationship,present_address,permanent_address,is_nominee
    ) VALUES(v_employee,v_name,v_phone,v_nid,v_dob,v_relation,v_present,v_permanent,v_nominee)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.employee_family_members SET name=v_name,phone=v_phone,nid_number=v_nid,
      date_of_birth=v_dob,relationship=v_relation,present_address=v_present,
      permanent_address=v_permanent,is_nominee=v_nominee
    WHERE id=v_id AND employee_id=v_employee;
    IF NOT FOUND THEN RAISE EXCEPTION 'Family member does not belong to the current employee.' USING errcode='42501'; END IF;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'employee.profile.family_member.saved_v1','employee',v_employee::text,
    jsonb_build_object('row_id',v_id,'fields',ARRAY['name','phone','nid_number','date_of_birth','relationship','present_address','permanent_address','is_nominee']));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_save_my_bank_v1(
  p_tenant_id uuid,p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_bank text; v_account_name text; v_account text; v_branch text; v_routing text;
BEGIN
  IF v_employee IS NULL THEN RAISE EXCEPTION 'Linked employee record is required.' USING errcode='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile details must be an object.' USING errcode='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(p_payload,'{}'::jsonb)) k
    WHERE k NOT IN ('bank_name','account_name','account_number','branch_name','routing_number')
  ) THEN RAISE EXCEPTION 'Unsupported bank detail fields.' USING errcode='22023'; END IF;
  v_bank := nullif(btrim(p_payload->>'bank_name'),'');
  v_account_name := nullif(btrim(p_payload->>'account_name'),'');
  v_account := nullif(btrim(p_payload->>'account_number'),'');
  v_branch := nullif(btrim(p_payload->>'branch_name'),'');
  v_routing := nullif(btrim(p_payload->>'routing_number'),'');
  IF v_bank IS NULL OR v_account_name IS NULL OR v_account IS NULL OR v_branch IS NULL OR v_routing IS NULL
     OR length(v_bank)>200 OR length(v_account_name)>200 OR length(v_account)>64 OR length(v_branch)>200
     OR length(v_routing)>32 OR length(regexp_replace(v_routing,'[^0-9]','','g')) NOT BETWEEN 5 AND 20 THEN
    RAISE EXCEPTION 'Complete the required bank details using the allowed lengths.' USING errcode='22023';
  END IF;
  INSERT INTO public.employee_bank_details(employee_id,tenant_id,bank_name,account_name,account_number,branch_name,routing_number)
  VALUES(v_employee,p_tenant_id,v_bank,v_account_name,v_account,v_branch,v_routing)
  ON CONFLICT(employee_id) DO UPDATE SET tenant_id=excluded.tenant_id,
    bank_name=excluded.bank_name,account_name=excluded.account_name,account_number=excluded.account_number,
    branch_name=excluded.branch_name,
    routing_number=excluded.routing_number,updated_at=now();
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'employee.profile.bank_details.saved_v1','employee',v_employee::text,
    jsonb_build_object('fields',ARRAY['bank_name','account_name','account_number','branch_name','routing_number']));
  RETURN v_employee;
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_save_my_training_v1(
  p_tenant_id uuid,p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_id uuid; v_title text; v_institute text; v_number text; v_year text;
  v_duration text; v_path text; v_old_path text;
BEGIN
  IF v_employee IS NULL THEN RAISE EXCEPTION 'Linked employee record is required.' USING errcode='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile details must be an object.' USING errcode='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(p_payload,'{}'::jsonb)) k
    WHERE k NOT IN ('id','title','institute_name','training_number','year','duration','certificate_url')
  ) THEN RAISE EXCEPTION 'Unsupported training fields.' USING errcode='22023'; END IF;
  v_id := nullif(p_payload->>'id','')::uuid;
  v_title := nullif(btrim(p_payload->>'title'),'');
  v_institute := nullif(btrim(p_payload->>'institute_name'),'');
  v_number := nullif(btrim(p_payload->>'training_number'),'');
  v_year := nullif(btrim(p_payload->>'year'),'');
  v_duration := nullif(btrim(p_payload->>'duration'),'');
  IF v_title IS NULL OR v_institute IS NULL OR v_number IS NULL OR v_year IS NULL OR v_duration IS NULL
     OR length(v_title)>255 OR length(v_institute)>255 OR length(v_number)>120
     OR length(v_year)>12 OR length(v_duration)>120 THEN
    RAISE EXCEPTION 'Complete the required training fields using the allowed lengths.' USING errcode='22023';
  END IF;
  IF v_year !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Enter a valid training year.' USING errcode='22023';
  END IF;
  IF v_year::integer NOT BETWEEN 1900 AND 2200 THEN
    RAISE EXCEPTION 'Enter a valid training year.' USING errcode='22023';
  END IF;
  IF v_id IS NOT NULL THEN
    SELECT certificate_url INTO v_old_path FROM public.employee_training
    WHERE id=v_id AND employee_id=v_employee FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Training record does not belong to the current employee.' USING errcode='42501'; END IF;
  END IF;
  v_path := CASE WHEN p_payload ? 'certificate_url' THEN nullif(p_payload->>'certificate_url','') ELSE v_old_path END;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Attach the training certificate.' USING errcode='22023'; END IF;
  IF p_payload ? 'certificate_url' AND NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='employee-documents' AND o.name=v_path
      AND split_part(o.name,'/',1)=auth.uid()::text
      AND split_part(o.name,'/',2)=p_tenant_id::text
      AND split_part(o.name,'/',3)='profile-certificates'
  ) THEN RAISE EXCEPTION 'Certificate file is not owned by this employee and tenant.' USING errcode='42501'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.employee_training(employee_id,title,institute_name,training_number,year,duration,certificate_url)
    VALUES(v_employee,v_title,v_institute,v_number,v_year,v_duration,v_path) RETURNING id INTO v_id;
  ELSE
    UPDATE public.employee_training SET title=v_title,institute_name=v_institute,
      training_number=v_number,year=v_year,duration=v_duration,certificate_url=v_path
    WHERE id=v_id AND employee_id=v_employee;
  END IF;
  IF p_payload ? 'certificate_url' THEN
    UPDATE public.employee_documents SET name='Training certificate — '||v_title
    WHERE employee_id=v_employee AND file_url=v_path;
    IF NOT FOUND THEN
      INSERT INTO public.employee_documents(id,employee_id,name,document_type,file_url,verification_status)
      VALUES(pg_catalog.gen_random_uuid(),v_employee,'Training certificate — '||v_title,'certificate',v_path,'pending');
    END IF;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'employee.profile.training.saved_v1','employee',v_employee::text,
    jsonb_build_object('row_id',v_id,'certificate_attached',true,'fields',ARRAY['title','institute_name','training_number','year','duration','certificate_url']));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_save_my_certification_v1(
  p_tenant_id uuid,p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
  v_id uuid; v_title text; v_institute text; v_issued_by text;
  v_start date; v_end date; v_path text; v_old_path text;
BEGIN
  IF v_employee IS NULL THEN RAISE EXCEPTION 'Linked employee record is required.' USING errcode='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile details must be an object.' USING errcode='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(p_payload,'{}'::jsonb)) k
    WHERE k NOT IN ('id','title','institute_name','issued_by','issue_date','expiry_date','certificate_document_url')
  ) THEN RAISE EXCEPTION 'Unsupported certification fields.' USING errcode='22023'; END IF;
  v_id := nullif(p_payload->>'id','')::uuid;
  v_title := nullif(btrim(p_payload->>'title'),'');
  v_institute := nullif(btrim(p_payload->>'institute_name'),'');
  v_issued_by := nullif(btrim(p_payload->>'issued_by'),'');
  IF v_title IS NULL OR v_institute IS NULL OR length(v_title)>255 OR length(v_institute)>255
     OR length(coalesce(v_issued_by,''))>255 THEN
    RAISE EXCEPTION 'Complete the required certification fields using the allowed lengths.' USING errcode='22023';
  END IF;
  IF coalesce(p_payload->>'issue_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'expiry_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Enter valid certification dates.' USING errcode='22023';
  END IF;
  BEGIN v_start := (p_payload->>'issue_date')::date; v_end := (p_payload->>'expiry_date')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'Enter valid certification dates.' USING errcode='22023';
  END;
  IF v_end<v_start THEN RAISE EXCEPTION 'Expiry date must be on or after the issue date.' USING errcode='22023'; END IF;
  IF v_id IS NOT NULL THEN
    SELECT certificate_document_url INTO v_old_path FROM public.employee_certifications
    WHERE id=v_id AND employee_id=v_employee FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Certification does not belong to the current employee.' USING errcode='42501'; END IF;
  END IF;
  v_path := CASE WHEN p_payload ? 'certificate_document_url' THEN nullif(p_payload->>'certificate_document_url','') ELSE v_old_path END;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Attach the certification document.' USING errcode='22023'; END IF;
  IF p_payload ? 'certificate_document_url' AND NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='employee-documents' AND o.name=v_path
      AND split_part(o.name,'/',1)=auth.uid()::text
      AND split_part(o.name,'/',2)=p_tenant_id::text
      AND split_part(o.name,'/',3)='profile-certificates'
  ) THEN RAISE EXCEPTION 'Certificate file is not owned by this employee and tenant.' USING errcode='42501'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.employee_certifications(employee_id,title,institute_name,issued_by,issue_date,expiry_date,certificate_document_url)
    VALUES(v_employee,v_title,v_institute,v_issued_by,v_start,v_end,v_path) RETURNING id INTO v_id;
  ELSE
    UPDATE public.employee_certifications SET title=v_title,institute_name=v_institute,
      issued_by=v_issued_by,issue_date=v_start,expiry_date=v_end,certificate_document_url=v_path
    WHERE id=v_id AND employee_id=v_employee;
  END IF;
  IF p_payload ? 'certificate_document_url' THEN
    UPDATE public.employee_documents SET name='Certification — '||v_title,expires_at=v_end
    WHERE employee_id=v_employee AND file_url=v_path;
    IF NOT FOUND THEN
      INSERT INTO public.employee_documents(id,employee_id,name,document_type,file_url,expires_at,verification_status)
      VALUES(pg_catalog.gen_random_uuid(),v_employee,'Certification — '||v_title,'certificate',v_path,v_end,'pending');
    END IF;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'employee.profile.certification.saved_v1','employee',v_employee::text,
    jsonb_build_object('row_id',v_id,'certificate_attached',true,'fields',ARRAY['title','institute_name','issued_by','issue_date','expiry_date','certificate_document_url']));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.employee_save_my_education_v1(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.employee_save_my_experience_v1(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.employee_save_my_family_member_v1(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.employee_save_my_bank_v1(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.employee_save_my_training_v1(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.employee_save_my_certification_v1(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_save_my_education_v1(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_save_my_experience_v1(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_save_my_family_member_v1(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_save_my_bank_v1(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_save_my_training_v1(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_save_my_certification_v1(uuid,jsonb) TO authenticated;


-- Original HRIS profile retained per-record Delete action. Records owned by a
-- different employee, inactive member, or another tenant are never deleted.
-- Certificate and training documents remain outside this endpoint because
-- their linked private document retention requires a separate contract.
CREATE OR REPLACE FUNCTION public.employee_delete_my_profile_record_v1(
  p_tenant_id uuid,p_kind text,p_record_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee uuid := private.hris_profile_own_employee(p_tenant_id);
BEGIN
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record is required.' USING errcode='42501';
  END IF;
  IF p_record_id IS NULL OR p_kind IS NULL
     OR p_kind NOT IN ('education','experience','family') THEN
    RAISE EXCEPTION 'Unsupported profile record.' USING errcode='22023';
  END IF;

  IF p_kind='education' THEN
    DELETE FROM public.employee_education
    WHERE id=p_record_id AND employee_id=v_employee;
  ELSIF p_kind='experience' THEN
    DELETE FROM public.employee_experience
    WHERE id=p_record_id AND employee_id=v_employee;
  ELSE
    DELETE FROM public.employee_family_members
    WHERE id=p_record_id AND employee_id=v_employee;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile record is not owned by this employee.' USING errcode='42501';
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'employee.profile.'||p_kind||'.deleted_v1','employee',v_employee::text,
    jsonb_build_object('row_id',p_record_id));
  RETURN p_record_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.employee_delete_my_profile_record_v1(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_delete_my_profile_record_v1(uuid,text,uuid)
  TO authenticated;

COMMIT;
