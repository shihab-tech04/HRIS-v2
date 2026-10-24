-- Employee service-request submission and own-history reads.
-- The manager decision lifecycle remains unchanged until its role and transition rules are approved.
BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.service_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_my_service_requests(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_requests jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active sign-in is required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'This organization is not active.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'request_type',r.request_type,'reason',r.reason,'status',r.status,
    'submitted_at',r.submitted_at,'resolved_at',r.resolved_at,'resolution_note',r.resolution_note
  ) ORDER BY r.submitted_at DESC),'[]'::jsonb)
  INTO v_requests
  FROM public.service_requests r
  WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'employee_id',v_employee_id,'requests',coalesce(v_requests,'[]'::jsonb)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_service_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_service_requests(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hris_submit_my_service_request(
  p_tenant_id uuid,p_request_type text,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_request public.service_requests%ROWTYPE;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active sign-in is required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'This organization is not active.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF p_request_type IS NULL OR p_request_type NOT IN (
    'employment_certificate','noc_letter','salary_certificate','other',
    'work_from_home','movement','shift_change','shift_swap'
  ) THEN
    RAISE EXCEPTION 'Choose a supported request type.' USING errcode='22023';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for this request.' USING errcode='22023';
  END IF;

  INSERT INTO public.service_requests(
    tenant_id,employee_id,request_type,reason,request_data,status,submitted_by,submitted_at
  ) VALUES (
    p_tenant_id,v_employee_id,p_request_type,btrim(p_reason),'{}'::jsonb,'pending',auth.uid(),now()
  ) RETURNING * INTO v_request;

  RETURN jsonb_build_object(
    'id',v_request.id,'tenant_id',v_request.tenant_id,'employee_id',v_request.employee_id,
    'request_type',v_request.request_type,'reason',v_request.reason,'status',v_request.status,
    'submitted_at',v_request.submitted_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.hris_submit_my_service_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_submit_my_service_request(uuid,text,text) TO authenticated, service_role;

COMMIT;
