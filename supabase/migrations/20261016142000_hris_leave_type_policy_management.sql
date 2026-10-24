-- Tenant-scoped leave type configuration using the existing leave.manage
-- permission and leave_types fields. Existing employee balance rows remain
-- authoritative; annual_entitlement is used only when a balance is first made.
CREATE OR REPLACE FUNCTION public.hris_save_leave_type(
  p_tenant_id uuid,
  p_leave_type_id uuid,
  p_payload jsonb,
  p_expected jsonb DEFAULT NULL::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_current public.leave_types%rowtype;
  v_before jsonb;
  v_name text;
  v_code text;
  v_gender text;
  v_notice integer;
  v_entitlement numeric;
  v_requires_proof boolean;
  v_active boolean;
  v_created boolean := false;
  v_id uuid := p_leave_type_id;
  v_action text;
BEGIN
  IF NOT public.is_live_session()
     OR NOT public.has_tenant_permission(p_tenant_id, 'leave.manage') THEN
    RAISE EXCEPTION 'Active tenant leave management permission required.' USING errcode='42501';
  END IF;
  IF p_tenant_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'A tenant and leave type details are required.' USING errcode='22023';
  END IF;

  v_name := btrim(coalesce(p_payload->>'name',''));
  v_code := btrim(coalesce(p_payload->>'code',''));
  v_gender := nullif(btrim(coalesce(p_payload->>'applicable_gender','')),'');
  IF v_name='' OR length(v_name)>160 THEN
    RAISE EXCEPTION 'Leave type name is required and must be at most 160 characters.' USING errcode='22023';
  END IF;
  IF v_code='' OR length(v_code)>64 THEN
    RAISE EXCEPTION 'Leave type code is required and must be at most 64 characters.' USING errcode='22023';
  END IF;
  IF v_gender IS NOT NULL AND length(v_gender)>80 THEN
    RAISE EXCEPTION 'Gender applicability must be at most 80 characters.' USING errcode='22023';
  END IF;
  IF jsonb_typeof(p_payload->'annual_entitlement') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_payload->'requires_document_proof') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Entitlement, evidence, and active settings are required.' USING errcode='22023';
  END IF;
  v_entitlement := (p_payload->>'annual_entitlement')::numeric;
  IF v_entitlement<0 THEN
    RAISE EXCEPTION 'Annual entitlement cannot be negative.' USING errcode='22023';
  END IF;
  IF p_payload ? 'min_days_notice' AND jsonb_typeof(p_payload->'min_days_notice') NOT IN ('number','null') THEN
    RAISE EXCEPTION 'Minimum advance notice must be a whole number of days.' USING errcode='22023';
  END IF;
  v_notice := nullif(p_payload->>'min_days_notice','')::integer;
  IF v_notice<0 THEN
    RAISE EXCEPTION 'Minimum advance notice cannot be negative.' USING errcode='22023';
  END IF;
  v_requires_proof := (p_payload->>'requires_document_proof')::boolean;
  v_active := (p_payload->>'active')::boolean;

  -- Serialize same-tenant writes so case-insensitive duplicate codes cannot
  -- race each other, without adding a constraint that could reject legacy data.
  PERFORM pg_advisory_xact_lock(hashtextextended('leave-type:'||p_tenant_id::text,0));
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'A leave type identifier is required for safe retry.' USING errcode='22023';
  END IF;

  IF p_expected IS NULL THEN
    SELECT * INTO v_current FROM public.leave_types
      WHERE id=v_id AND tenant_id=p_tenant_id FOR UPDATE;
    IF FOUND THEN
      -- A retried create with the same client-generated id and values is safe.
      IF v_current.name=v_name AND v_current.code=v_code
         AND v_current.applicable_gender IS NOT DISTINCT FROM v_gender
         AND v_current.min_days_notice IS NOT DISTINCT FROM v_notice
         AND v_current.annual_entitlement=v_entitlement
         AND v_current.requires_document_proof=v_requires_proof
         AND v_current.active=v_active THEN
        RETURN to_jsonb(v_current);
      END IF;
      RAISE EXCEPTION 'This leave type identifier already exists.' USING errcode='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM public.leave_types lt WHERE lt.tenant_id=p_tenant_id AND lower(lt.code)=lower(v_code)) THEN
      RAISE EXCEPTION 'A leave type with this code already exists in this organization.' USING errcode='23505';
    END IF;
    INSERT INTO public.leave_types(
      id,tenant_id,name,code,applicable_gender,min_days_notice,
      requires_document_proof,annual_entitlement,active
    ) VALUES (
      v_id,p_tenant_id,v_name,v_code,v_gender,v_notice,
      v_requires_proof,v_entitlement,v_active
    ) RETURNING * INTO v_current;
    v_created := true;
    v_action := 'leave.type.created';
  ELSE
    SELECT * INTO v_current FROM public.leave_types
      WHERE id=v_id AND tenant_id=p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Leave type not found in the active organization.' USING errcode='P0002';
    END IF;
    v_before := to_jsonb(v_current);
    IF p_expected->>'name' IS DISTINCT FROM v_current.name
       OR p_expected->>'code' IS DISTINCT FROM v_current.code
       OR p_expected->>'applicable_gender' IS DISTINCT FROM v_current.applicable_gender
       OR nullif(p_expected->>'min_days_notice','')::integer IS DISTINCT FROM v_current.min_days_notice
       OR nullif(p_expected->>'annual_entitlement','')::numeric IS DISTINCT FROM v_current.annual_entitlement
       OR nullif(p_expected->>'requires_document_proof','')::boolean IS DISTINCT FROM v_current.requires_document_proof
       OR nullif(p_expected->>'active','')::boolean IS DISTINCT FROM v_current.active THEN
      RAISE EXCEPTION 'This leave type changed since it was opened. Refresh and review the latest values.' USING errcode='40001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.leave_types lt
      WHERE lt.tenant_id=p_tenant_id AND lt.id<>v_id AND lower(lt.code)=lower(v_code)) THEN
      RAISE EXCEPTION 'A leave type with this code already exists in this organization.' USING errcode='23505';
    END IF;
    UPDATE public.leave_types SET
      name=v_name,code=v_code,applicable_gender=v_gender,min_days_notice=v_notice,
      requires_document_proof=v_requires_proof,annual_entitlement=v_entitlement,active=v_active
    WHERE id=v_id AND tenant_id=p_tenant_id
    RETURNING * INTO v_current;
    v_action := 'leave.type.updated';
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),v_action,'leave_type',v_current.id::text,
    jsonb_build_object(
      'tenant_id',p_tenant_id,
      'created',v_created,
      'before',v_before,
      'name',v_current.name,'code',v_current.code,
      'applicable_gender',v_current.applicable_gender,
      'min_days_notice',v_current.min_days_notice,
      'requires_document_proof',v_current.requires_document_proof,
      'annual_entitlement',v_current.annual_entitlement,'active',v_current.active
    ));
  RETURN to_jsonb(v_current);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_save_leave_type(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hris_save_leave_type(uuid,uuid,jsonb,jsonb) TO authenticated, service_role;

-- The RPC is the only authenticated write path. The source table remains
-- tenant-readable under its existing RLS policies.
REVOKE INSERT, UPDATE, DELETE ON public.leave_types FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.leave_types TO authenticated;
