-- Phase 05: edit only the contact fields already present on employees.
-- Sensitive contact data is fetched only through the manager-scoped RPC; the
-- existing privacy-limited directory response remains unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_employee_contact_details(
  p_tenant_id uuid,
  p_employee_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_employee_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id=p_tenant_id AND t.is_active IS TRUE
    )
    OR NOT public.has_tenant_permission(p_tenant_id, 'employees.manage') THEN
    RAISE EXCEPTION 'Active employee-management membership required.' USING errcode='42501';
  END IF;

  SELECT jsonb_build_object(
    'employee_id',e.id,
    'official_email',e.official_email,
    'personal_email',e.personal_email,
    'phone',e.phone,
    'official_phone',e.official_phone,
    'address',e.address,
    'mailing_address',e.mailing_address,
    'emergency_contact_name',e.emergency_contact_name,
    'emergency_contact_phone',e.emergency_contact_phone,
    'emergency_contact_relation',e.emergency_contact_relation
  ) INTO v_payload
  FROM public.employees e
  WHERE e.id=p_employee_id AND e.tenant_id=p_tenant_id;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Employee contact record is unavailable in this organization.' USING errcode='42501';
  END IF;

  RETURN v_payload;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_update_tenant_employee_contact_details(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_contact_details jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_before public.employees%ROWTYPE;
  v_official_email text;
  v_personal_email text;
  v_phone text;
  v_official_phone text;
  v_address text;
  v_mailing_address text;
  v_emergency_contact_name text;
  v_emergency_contact_phone text;
  v_emergency_contact_relation text;
  v_changed_fields text[] := ARRAY[]::text[];
  v_payload jsonb;
  v_allowed_keys text[] := ARRAY[
    'official_email','personal_email','phone','official_phone','address',
    'mailing_address','emergency_contact_name','emergency_contact_phone',
    'emergency_contact_relation'
  ];
BEGIN
  IF p_tenant_id IS NULL OR p_employee_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id=p_tenant_id AND t.is_active IS TRUE
    )
    OR NOT public.has_tenant_permission(p_tenant_id, 'employees.manage') THEN
    RAISE EXCEPTION 'Active employee-management membership required.' USING errcode='42501';
  END IF;

  SELECT e.* INTO v_before
  FROM public.employees e
  WHERE e.id=p_employee_id AND e.tenant_id=p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee contact record is unavailable in this organization.' USING errcode='42501';
  END IF;

  IF p_contact_details IS NULL OR jsonb_typeof(p_contact_details) <> 'object'
    OR NOT (p_contact_details ?& v_allowed_keys)
    OR EXISTS (
      SELECT 1 FROM jsonb_each(
        CASE WHEN jsonb_typeof(p_contact_details)='object' THEN p_contact_details ELSE '{}'::jsonb END
      ) AS item(key,value)
      WHERE NOT (item.key = ANY(v_allowed_keys))
        OR jsonb_typeof(item.value) NOT IN ('string','null')
    ) THEN
    RAISE EXCEPTION 'Provide only the supported employee contact fields.' USING errcode='22023';
  END IF;

  v_official_email := lower(nullif(btrim(p_contact_details->>'official_email'),''));
  v_personal_email := lower(nullif(btrim(p_contact_details->>'personal_email'),''));
  v_phone := nullif(btrim(p_contact_details->>'phone'),'');
  v_official_phone := nullif(btrim(p_contact_details->>'official_phone'),'');
  v_address := nullif(btrim(p_contact_details->>'address'),'');
  v_mailing_address := nullif(btrim(p_contact_details->>'mailing_address'),'');
  v_emergency_contact_name := nullif(btrim(p_contact_details->>'emergency_contact_name'),'');
  v_emergency_contact_phone := nullif(btrim(p_contact_details->>'emergency_contact_phone'),'');
  v_emergency_contact_relation := nullif(btrim(p_contact_details->>'emergency_contact_relation'),'');

  IF v_official_email IS NULL OR length(v_official_email)>320
    OR v_official_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR v_personal_email IS NOT NULL AND (length(v_personal_email)>320
      OR v_personal_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    OR length(v_phone)>80 OR length(v_official_phone)>80
    OR length(v_address)>500 OR length(v_mailing_address)>500
    OR length(v_emergency_contact_name)>160
    OR length(v_emergency_contact_phone)>80
    OR length(v_emergency_contact_relation)>120 THEN
    RAISE EXCEPTION 'Employee contact details are invalid or exceed their allowed length.' USING errcode='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.tenant_id=p_tenant_id AND e.id<>p_employee_id
      AND lower(e.official_email)=v_official_email
  ) THEN
    RAISE EXCEPTION 'That official email is already used in this organization.' USING errcode='23505';
  END IF;

  IF v_before.official_email IS DISTINCT FROM v_official_email THEN v_changed_fields:=array_append(v_changed_fields,'official_email'); END IF;
  IF v_before.personal_email IS DISTINCT FROM v_personal_email THEN v_changed_fields:=array_append(v_changed_fields,'personal_email'); END IF;
  IF v_before.phone IS DISTINCT FROM v_phone THEN v_changed_fields:=array_append(v_changed_fields,'phone'); END IF;
  IF v_before.official_phone IS DISTINCT FROM v_official_phone THEN v_changed_fields:=array_append(v_changed_fields,'official_phone'); END IF;
  IF v_before.address IS DISTINCT FROM v_address THEN v_changed_fields:=array_append(v_changed_fields,'address'); END IF;
  IF v_before.mailing_address IS DISTINCT FROM v_mailing_address THEN v_changed_fields:=array_append(v_changed_fields,'mailing_address'); END IF;
  IF v_before.emergency_contact_name IS DISTINCT FROM v_emergency_contact_name THEN v_changed_fields:=array_append(v_changed_fields,'emergency_contact_name'); END IF;
  IF v_before.emergency_contact_phone IS DISTINCT FROM v_emergency_contact_phone THEN v_changed_fields:=array_append(v_changed_fields,'emergency_contact_phone'); END IF;
  IF v_before.emergency_contact_relation IS DISTINCT FROM v_emergency_contact_relation THEN v_changed_fields:=array_append(v_changed_fields,'emergency_contact_relation'); END IF;

  IF cardinality(v_changed_fields)>0 THEN
    UPDATE public.employees e SET
      official_email=v_official_email,
      personal_email=v_personal_email,
      phone=v_phone,
      official_phone=v_official_phone,
      address=v_address,
      mailing_address=v_mailing_address,
      emergency_contact_name=v_emergency_contact_name,
      emergency_contact_phone=v_emergency_contact_phone,
      emergency_contact_relation=v_emergency_contact_relation,
      updated_at=clock_timestamp()
    WHERE e.id=p_employee_id AND e.tenant_id=p_tenant_id
    RETURNING jsonb_build_object(
      'employee_id',e.id,
      'official_email',e.official_email,
      'personal_email',e.personal_email,
      'phone',e.phone,
      'official_phone',e.official_phone,
      'address',e.address,
      'mailing_address',e.mailing_address,
      'emergency_contact_name',e.emergency_contact_name,
      'emergency_contact_phone',e.emergency_contact_phone,
      'emergency_contact_relation',e.emergency_contact_relation
    ) INTO v_payload;

    INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
    VALUES(auth.uid(),'employee.contact_details_updated','employees',p_employee_id::text,
      jsonb_build_object('tenant_id',p_tenant_id,'changed_fields',to_jsonb(v_changed_fields)));
  ELSE
    v_payload:=jsonb_build_object(
      'employee_id',v_before.id,
      'official_email',v_before.official_email,
      'personal_email',v_before.personal_email,
      'phone',v_before.phone,
      'official_phone',v_before.official_phone,
      'address',v_before.address,
      'mailing_address',v_before.mailing_address,
      'emergency_contact_name',v_before.emergency_contact_name,
      'emergency_contact_phone',v_before.emergency_contact_phone,
      'emergency_contact_relation',v_before.emergency_contact_relation
    );
  END IF;

  RETURN v_payload;
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_employee_contact_details(uuid,uuid) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_employee_contact_details(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb) TO authenticated;

COMMIT;
