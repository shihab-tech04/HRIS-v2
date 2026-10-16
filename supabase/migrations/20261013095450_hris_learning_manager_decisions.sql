-- Tenant-scoped learning request queue and one-time manager decisions.
-- Validate against the disposable Auth stack before considering deployment.
BEGIN;

CREATE INDEX IF NOT EXISTS learning_enrollments_requests_queue_idx
  ON public.learning_enrollments(tenant_id, requested_at, created_at)
  WHERE source='employee_request' AND status='requested';

CREATE OR REPLACE FUNCTION public.hris_get_learning_requests(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_requests jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'employee_id',e.employee_id,
    'employee_number',em.employee_number,
    'employee_name',em.full_name,
    'program_id',p.id,
    'program_title',p.title,
    'session_id',e.session_id,
    'session_start_at',s.start_at,
    'session_end_at',s.end_at,
    'session_location',s.location,
    'requested_at',e.requested_at,
    'request_note',e.recommendation_reason
  ) ORDER BY e.requested_at NULLS LAST,e.created_at,e.id),'[]'::jsonb)
    INTO v_requests
  FROM public.learning_enrollments e
  JOIN public.employees em ON em.id=e.employee_id AND em.tenant_id=e.tenant_id
  JOIN public.learning_programs p ON p.id=e.program_id AND p.tenant_id=e.tenant_id
  LEFT JOIN public.learning_sessions s ON s.id=e.session_id AND s.tenant_id=e.tenant_id
  WHERE e.tenant_id=p_tenant_id
    AND e.source='employee_request'
    AND e.status='requested';

  RETURN v_requests;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_resolve_learning_request(
  p_tenant_id uuid,
  p_id uuid,
  p_decision text,
  p_resolution_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_request public.learning_enrollments%ROWTYPE;
  v_session public.learning_sessions%ROWTYPE;
  v_enrolled_count integer;
  v_note text := nullif(left(btrim(coalesce(p_resolution_note,'')),1000),'');
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_decision NOT IN ('enrolled','rejected') THEN
    RAISE EXCEPTION 'Choose an approval or rejection decision.' USING errcode='22023';
  END IF;

  SELECT e.* INTO v_request
  FROM public.learning_enrollments e
  WHERE e.id=p_id AND e.tenant_id=p_tenant_id
    AND e.source='employee_request' AND e.status='requested'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending learning request not found.' USING errcode='P0002';
  END IF;

  IF p_decision='enrolled' AND v_request.session_id IS NOT NULL THEN
    SELECT s.* INTO v_session
    FROM public.learning_sessions s
    WHERE s.id=v_request.session_id AND s.tenant_id=p_tenant_id
      AND s.program_id=v_request.program_id AND s.status='scheduled'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The requested learning session is no longer scheduled.' USING errcode='22023';
    END IF;

    SELECT count(*)::integer INTO v_enrolled_count
    FROM public.learning_enrollments e
    WHERE e.tenant_id=p_tenant_id AND e.session_id=v_request.session_id
      AND e.status='enrolled';
    IF v_session.capacity IS NOT NULL AND v_enrolled_count >= v_session.capacity THEN
      RAISE EXCEPTION 'This learning session is full. The request remains pending.' USING errcode='22023';
    END IF;
  END IF;

  UPDATE public.learning_enrollments e
  SET status=p_decision,
      resolved_at=now(),
      resolution_note=v_note,
      updated_at=now()
  WHERE e.id=v_request.id AND e.tenant_id=p_tenant_id
  RETURNING e.id,e.status,e.resolved_at INTO v_request.id,v_request.status,v_request.resolved_at;

  RETURN jsonb_build_object(
    'id',v_request.id,'status',v_request.status,'resolved_at',v_request.resolved_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_learning_requests(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_resolve_learning_request(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_learning_requests(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_resolve_learning_request(uuid,uuid,text,text) TO authenticated,service_role;

COMMIT;
