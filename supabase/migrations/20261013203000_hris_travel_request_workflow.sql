-- Tenant-scoped employee travel requests and manager decisions.
-- Validate on the disposable local Supabase stack before any hosted rollout.
BEGIN;

ALTER TABLE public.travel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_status_history ENABLE ROW LEVEL SECURITY;

-- All travel writes go through functions that resolve the employee or manager
-- against the requested active tenant. Preserve RLS-filtered reads for Auth;
-- deny anonymous access and direct Data API mutations.
REVOKE ALL ON public.travel_requests, public.travel_status_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.travel_requests, public.travel_status_history TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_my_travel_context(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_employee_id uuid;
  v_context jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode='42501';
  END IF;
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active organization not found.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode='42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'employee_id',v_employee_id,
    'requests',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,'destination',r.destination,'from_date',r.from_date,'to_date',r.to_date,
        'purpose',r.purpose,'estimated_cost',r.estimated_cost,'estimated_currency',r.estimated_currency,
        'status',r.status,'submitted_at',r.submitted_at,'reviewed_at',r.reviewed_at,
        'review_note',r.review_note,'created_at',r.created_at,
        'history',COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'previous_status',h.previous_status,'new_status',h.new_status,
            'note',h.note,'created_at',h.created_at
          ) ORDER BY h.created_at DESC,h.id DESC)
          FROM public.travel_status_history h
          WHERE h.tenant_id=r.tenant_id AND h.travel_request_id=r.id
        ),'[]'::jsonb)
      ) ORDER BY r.created_at DESC,r.id)
      FROM public.travel_requests r
      WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
    ),'[]'::jsonb)
  ) INTO v_context;
  RETURN v_context;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_save_my_travel_request(
  p_tenant_id uuid,
  p_id uuid,
  p_destination text,
  p_from_date date,
  p_to_date date,
  p_purpose text,
  p_estimated_cost numeric,
  p_estimated_currency text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_employee_id uuid;
  v_request_id uuid;
  v_status text;
  v_destination text := NULLIF(pg_catalog.btrim(p_destination),'');
  v_purpose text := NULLIF(pg_catalog.btrim(p_purpose),'');
  v_currency text := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_estimated_currency)),'');
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode='42501';
  END IF;
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active organization not found.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode='42501';
  END IF;
  IF (p_from_date IS NOT NULL AND p_to_date IS NOT NULL AND p_to_date < p_from_date)
     OR pg_catalog.char_length(COALESCE(v_destination,'')) > 300
     OR pg_catalog.char_length(COALESCE(v_purpose,'')) > 2000
     OR (p_estimated_cost IS NOT NULL AND p_estimated_cost <= 0)
     OR (v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'Check the travel dates, destination, purpose, and optional cost.' USING errcode='22023';
  END IF;
  IF (p_estimated_cost IS NULL) <> (v_currency IS NULL) THEN
    RAISE EXCEPTION 'Enter both an estimated cost and its currency, or leave both blank.' USING errcode='22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.travel_requests(
      tenant_id,employee_id,destination,from_date,to_date,purpose,
      estimated_cost,estimated_currency,status
    ) VALUES (
      p_tenant_id,v_employee_id,v_destination,p_from_date,p_to_date,v_purpose,
      p_estimated_cost,v_currency,'draft'
    ) RETURNING id INTO v_request_id;
  ELSE
    SELECT r.status INTO v_status
    FROM public.travel_requests r
    WHERE r.id=p_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Travel request not found.' USING errcode='P0002';
    END IF;
    IF v_status NOT IN ('draft','rejected') THEN
      RAISE EXCEPTION 'Only draft or rejected travel requests can be edited.' USING errcode='42501';
    END IF;
    UPDATE public.travel_requests r
    SET destination=v_destination,from_date=p_from_date,to_date=p_to_date,purpose=v_purpose,
        estimated_cost=p_estimated_cost,estimated_currency=v_currency,status='draft',
        submitted_at=NULL,updated_at=pg_catalog.now()
    WHERE r.id=p_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
    RETURNING r.id INTO v_request_id;
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'travel.saved','travel_request',v_request_id::text,
    pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id));
  RETURN v_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_submit_my_travel_request(p_tenant_id uuid,p_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_employee_id uuid;
  v_status text;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode='42501';
  END IF;
  SELECT r.status INTO v_status
  FROM public.travel_requests r
  WHERE r.id=p_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Travel request not found.' USING errcode='P0002';
  END IF;
  IF v_status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'Only draft or rejected travel requests can be submitted.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.travel_requests r
    WHERE r.id=p_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id
      AND NULLIF(pg_catalog.btrim(r.destination),'') IS NOT NULL
      AND r.from_date IS NOT NULL AND r.to_date IS NOT NULL AND r.to_date >= r.from_date
      AND NULLIF(pg_catalog.btrim(r.purpose),'') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Add a destination, valid travel dates, and a purpose before submitting.' USING errcode='22023';
  END IF;

  UPDATE public.travel_requests r
  SET status='submitted',submitted_at=pg_catalog.now(),updated_at=pg_catalog.now()
  WHERE r.id=p_id AND r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id;
  INSERT INTO public.travel_status_history(
    tenant_id,travel_request_id,actor_user_id,previous_status,new_status,note
  ) VALUES (p_tenant_id,p_id,auth.uid(),v_status,'submitted',NULL);
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'travel.submitted','travel_request',p_id::text,
    pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'previous_status',v_status));
  RETURN p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_travel_requests(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE v_requests jsonb;
BEGIN
  IF NOT public.is_live_session() OR p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT (public.has_tenant_permission(p_tenant_id,'travel.view')
             OR public.has_tenant_permission(p_tenant_id,'travel.manage')) THEN
    RAISE EXCEPTION 'Travel access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',r.id,'employee_id',r.employee_id,'employee_name',e.full_name,
    'employee_number',e.employee_number,'destination',r.destination,
    'from_date',r.from_date,'to_date',r.to_date,'purpose',r.purpose,
    'estimated_cost',r.estimated_cost,'estimated_currency',r.estimated_currency,
    'status',r.status,'submitted_at',r.submitted_at,'review_note',r.review_note
  ) ORDER BY r.submitted_at,r.id),'[]'::jsonb)
  INTO v_requests
  FROM public.travel_requests r
  JOIN public.employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant_id AND r.status='submitted';
  RETURN v_requests;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_resolve_travel_request(
  p_tenant_id uuid,p_id uuid,p_decision text,p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE v_request public.travel_requests%ROWTYPE;
BEGIN
  IF NOT public.is_live_session() OR p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'travel.manage') THEN
    RAISE EXCEPTION 'Travel management permission for this organization is required.' USING errcode='42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Choose an approved or rejected decision.' USING errcode='22023';
  END IF;
  SELECT r.* INTO v_request
  FROM public.travel_requests r
  WHERE r.id=p_id AND r.tenant_id=p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'submitted' THEN
    RAISE EXCEPTION 'This travel request is no longer pending.' USING errcode='P0002';
  END IF;
  UPDATE public.travel_requests r
  SET status=p_decision,reviewed_by=auth.uid(),reviewed_at=pg_catalog.now(),
      review_note=NULLIF(pg_catalog.btrim(p_note),'') ,updated_at=pg_catalog.now()
  WHERE r.id=p_id AND r.tenant_id=p_tenant_id;
  INSERT INTO public.travel_status_history(
    tenant_id,travel_request_id,actor_user_id,previous_status,new_status,note
  ) VALUES (p_tenant_id,p_id,auth.uid(),'submitted',p_decision,NULLIF(pg_catalog.btrim(p_note),''));
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'travel.'||p_decision,'travel_request',p_id::text,
    pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_request.employee_id));
  RETURN pg_catalog.jsonb_build_object('id',p_id,'status',p_decision);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_travel_context(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_save_my_travel_request(uuid,uuid,text,date,date,text,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_submit_my_travel_request(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_get_tenant_travel_requests(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_resolve_travel_request(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_travel_context(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_save_my_travel_request(uuid,uuid,text,date,date,text,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_submit_my_travel_request(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_travel_requests(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_resolve_travel_request(uuid,uuid,text,text) TO authenticated,service_role;

COMMIT;
