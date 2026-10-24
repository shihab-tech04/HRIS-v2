-- Tenant-scoped HR service-request review and employee-visible status history.
-- The employee submission contract and request types remain unchanged.
BEGIN;

CREATE TABLE public.service_request_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text CHECK (previous_status IS NULL OR previous_status IN (
    'pending','in_progress','completed','approved','rejected','cancelled'
  )),
  new_status text NOT NULL CHECK (new_status IN (
    'pending','in_progress','completed','approved','rejected','cancelled'
  )),
  note text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX service_request_status_history_request_idx
  ON public.service_request_status_history(tenant_id,service_request_id,created_at,id);

ALTER TABLE public.service_request_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_request_status_history FROM PUBLIC,anon,authenticated;

-- HR review is authorized by the active tenant's employees.manage membership.
DROP POLICY IF EXISTS hris_service_requests_membership_read ON public.service_requests;
CREATE POLICY hris_service_requests_membership_read
  ON public.service_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id = public.hris_own_employee_for_tenant(tenant_id)
    OR public.hris_admin_can_read_tenant(tenant_id,'self_service.view')
    OR public.hris_admin_can_read_tenant(tenant_id,'self_service.manage')
    OR public.hris_admin_can_read_tenant(tenant_id,'employees.manage')
  );

DROP POLICY IF EXISTS hris_service_requests_membership_guard ON public.service_requests;
CREATE POLICY hris_service_requests_membership_guard
  ON public.service_requests AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      employee_id = public.hris_own_employee_for_tenant(tenant_id)
      OR public.hris_admin_can_read_tenant(tenant_id,'self_service.view')
      OR public.hris_admin_can_read_tenant(tenant_id,'self_service.manage')
      OR public.hris_admin_can_read_tenant(tenant_id,'employees.manage')
    )
  );

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
    'submitted_at',r.submitted_at,'resolved_at',r.resolved_at,'resolution_note',r.resolution_note,
    'history',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',h.id,'previous_status',h.previous_status,'new_status',h.new_status,
        'note',h.note,'created_at',h.created_at
      ) ORDER BY h.created_at,h.id),'[]'::jsonb)
      FROM public.service_request_status_history h
      WHERE h.tenant_id=r.tenant_id AND h.service_request_id=r.id
    )
  ) ORDER BY r.submitted_at DESC,r.id),'[]'::jsonb)
  INTO v_requests
  FROM public.service_requests r
  WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee_id;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'employee_id',v_employee_id,'requests',coalesce(v_requests,'[]'::jsonb)
  );
END
$function$;

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
    p_tenant_id,v_employee_id,p_request_type,btrim(p_reason),'{}'::jsonb,'pending',auth.uid(),clock_timestamp()
  ) RETURNING * INTO v_request;

  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status
  ) VALUES (p_tenant_id,v_request.id,auth.uid(),NULL,'pending');
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'service_request.submitted','service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id));

  RETURN jsonb_build_object(
    'id',v_request.id,'tenant_id',v_request.tenant_id,'employee_id',v_request.employee_id,
    'request_type',v_request.request_type,'reason',v_request.reason,'status',v_request.status,
    'submitted_at',v_request.submitted_at
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_service_requests(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_requests jsonb;
BEGIN
  IF NOT public.is_live_session()
     OR NOT public.has_tenant_permission(p_tenant_id,'employees.manage') THEN
    RAISE EXCEPTION 'Employee-management permission in this active organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'employee_id',r.employee_id,'employee_name',e.full_name,
    'employee_number',e.employee_number,'request_type',r.request_type,'reason',r.reason,
    'request_data',r.request_data,'status',r.status,'submitted_at',r.submitted_at,
    'resolved_by',r.resolved_by,'resolved_at',r.resolved_at,
    'resolution_note',r.resolution_note,'result_url',r.result_url,
    'history',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',h.id,'previous_status',h.previous_status,'new_status',h.new_status,
        'note',h.note,'created_at',h.created_at
      ) ORDER BY h.created_at,h.id),'[]'::jsonb)
      FROM public.service_request_status_history h
      WHERE h.tenant_id=r.tenant_id AND h.service_request_id=r.id
    )
  ) ORDER BY r.submitted_at DESC,r.id),'[]'::jsonb)
  INTO v_requests
  FROM public.service_requests r
  JOIN public.employees e ON e.tenant_id=r.tenant_id AND e.id=r.employee_id
  WHERE r.tenant_id=p_tenant_id;

  RETURN v_requests;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_resolve_tenant_service_request(
  p_tenant_id uuid,
  p_request_id uuid,
  p_expected_status text,
  p_next_status text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_request public.service_requests%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_changed_at timestamptz;
BEGIN
  IF NOT public.is_live_session()
     OR NOT public.has_tenant_permission(p_tenant_id,'employees.manage') THEN
    RAISE EXCEPTION 'Employee-management permission in this active organization is required.' USING errcode='42501';
  END IF;
  IF p_expected_status IS NULL OR p_next_status IS NULL
     OR p_expected_status NOT IN ('pending','in_progress')
     OR p_next_status NOT IN ('in_progress','completed','rejected') THEN
    RAISE EXCEPTION 'Choose a supported service-request status change.' USING errcode='22023';
  END IF;
  IF p_next_status='completed' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Record the resolution outcome before completing this request.' USING errcode='22023';
  END IF;
  IF p_next_status='rejected' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Enter a reason before rejecting this request.' USING errcode='22023';
  END IF;
  IF NOT (
    (p_expected_status='pending' AND p_next_status IN ('in_progress','rejected'))
    OR (p_expected_status='in_progress' AND p_next_status IN ('completed','rejected'))
  ) THEN
    RAISE EXCEPTION 'This service-request status transition is not allowed.' USING errcode='22023';
  END IF;

  SELECT r.* INTO v_request
  FROM public.service_requests r
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found in this organization.' USING errcode='P0002';
  END IF;
  IF v_request.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'This request changed. Refresh it before making another decision.' USING errcode='40001';
  END IF;

  v_changed_at := clock_timestamp();
  UPDATE public.service_requests r
  SET status=p_next_status,
      resolved_by=CASE WHEN p_next_status IN ('completed','rejected') THEN auth.uid() ELSE NULL END,
      resolved_at=CASE WHEN p_next_status IN ('completed','rejected') THEN v_changed_at ELSE NULL END,
      resolution_note=CASE WHEN p_next_status IN ('completed','rejected') THEN v_note ELSE NULL END,
      updated_at=v_changed_at
  WHERE r.id=p_request_id AND r.tenant_id=p_tenant_id AND r.status=p_expected_status
  RETURNING r.* INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request changed. Refresh it before making another decision.' USING errcode='40001';
  END IF;

  INSERT INTO public.service_request_status_history(
    tenant_id,service_request_id,actor_user_id,previous_status,new_status,note,created_at
  ) VALUES (
    p_tenant_id,v_request.id,auth.uid(),p_expected_status,p_next_status,
    CASE WHEN p_next_status IN ('completed','rejected') THEN v_note ELSE NULL END,v_changed_at
  );
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'service_request.status.'||p_next_status,'service_request',v_request.id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'previous_status',p_expected_status,'new_status',p_next_status));

  RETURN jsonb_build_object(
    'id',v_request.id,'tenant_id',v_request.tenant_id,'employee_id',v_request.employee_id,
    'status',v_request.status,'resolved_by',v_request.resolved_by,
    'resolved_at',v_request.resolved_at,'resolution_note',v_request.resolution_note,
    'updated_at',v_request.updated_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_service_requests(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_submit_my_service_request(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_get_tenant_service_requests(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_resolve_tenant_service_request(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_service_requests(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_submit_my_service_request(uuid,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_service_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_resolve_tenant_service_request(uuid,uuid,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.hris_get_tenant_service_requests(uuid)
  IS 'Lists employee service requests only for a live authenticated active membership with employees.manage in the supplied tenant.';
COMMENT ON FUNCTION public.hris_resolve_tenant_service_request(uuid,uuid,text,text,text)
  IS 'Applies only pending→in_progress, pending/in_progress→rejected, and in_progress→completed service-request transitions, with tenant permission, row lock, expected status, required outcome/rejection reason, status history, and audit record.';

COMMIT;
