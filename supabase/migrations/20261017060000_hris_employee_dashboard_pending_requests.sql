-- Return only the authenticated employee's open requests for the dashboard.
-- Request descriptions, amounts, reasons, notes, and evidence stay in their
-- existing detail/history workflows and are not duplicated into this summary.
BEGIN;

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

COMMIT;
