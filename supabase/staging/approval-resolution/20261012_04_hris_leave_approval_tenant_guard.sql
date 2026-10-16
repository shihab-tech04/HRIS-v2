-- Final-programme local migration; DO NOT run on production before isolated Auth/RLS certification.
-- Corrects existing admin_resolve_leave_request: employee-only calculation cannot be
-- called by an authorized administrator without an employee identity, and the old
-- pending request lookup did not constrain tenant_id.
-- Same approved policy as public.employee_calculate_leave_days, applied to the
-- REQUEST OWNER (not the approver); no new rates, entitlement or business rules.
CREATE OR REPLACE FUNCTION public.admin_resolve_leave_request(
  p_id uuid, p_decision text, p_note text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
DECLARE
  v_tenant uuid;
  r public.leave_requests%rowtype;
  v_off integer[] := '{}'::integer[];
  v_year integer;
  v_yfrom date;
  v_yto date;
  v_ydays numeric;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active leave management permission required.' USING errcode='42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode='22000';
  END IF;
  SELECT * INTO r FROM public.leave_requests
  WHERE id=p_id AND status='pending' FOR UPDATE;
  IF NOT FOUND OR NOT public.has_tenant_permission(r.tenant_id, 'leave.manage') THEN
    RAISE EXCEPTION 'Pending leave request not found in authorized organization.' USING errcode='P0002';
  END IF;
  v_tenant := r.tenant_id;

  SELECT COALESCE(s.weekly_off_days,'{}'::integer[]) INTO v_off
  FROM public.employees e
  LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.active=true
  WHERE e.id=r.employee_id AND e.tenant_id=v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave employee not found in authorized organization.' USING errcode='P0002';
  END IF;

  FOR v_year IN SELECT generate_series(
    extract(year FROM r.from_date)::integer,extract(year FROM r.to_date)::integer
  ) LOOP
    v_yfrom := greatest(r.from_date,make_date(v_year,1,1));
    v_yto := least(r.to_date,make_date(v_year,12,31));
    IF r.from_date=r.to_date AND r.day_portion IN('first_half','second_half') THEN
      IF extract(dow FROM v_yfrom)::integer=ANY(v_off) OR EXISTS(
        SELECT 1 FROM public.holidays h WHERE h.tenant_id=v_tenant AND h.active=true
          AND v_yfrom BETWEEN h.start_date AND h.end_date
      ) THEN v_ydays:=0; ELSE v_ydays:=0.5; END IF;
    ELSE
      SELECT count(*)::numeric INTO v_ydays FROM generate_series(
        v_yfrom,v_yto,interval '1 day'
      ) g(d) WHERE NOT(extract(dow FROM g.d)::integer=ANY(v_off))
      AND NOT EXISTS(
        SELECT 1 FROM public.holidays h WHERE h.tenant_id=v_tenant AND h.active=true
          AND g.d::date BETWEEN h.start_date AND h.end_date
      );
    END IF;
    IF v_ydays <= 0 THEN CONTINUE; END IF;
    UPDATE public.employee_leave_balances SET
      pending_days=greatest(0,pending_days-v_ydays),
      used_days=used_days+CASE WHEN p_decision='approved' THEN v_ydays ELSE 0 END,
      updated_at=now()
    WHERE employee_id=r.employee_id AND tenant_id=v_tenant
      AND leave_type_id=r.leave_type_id AND balance_year=v_year;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Leave balance ledger missing for year %.',v_year USING errcode='P0002';
    END IF;
  END LOOP;

  UPDATE public.leave_requests SET
    status=p_decision,resolved_by=auth.uid(),resolved_at=now(),
    resolution_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now()
  WHERE id=p_id AND tenant_id=v_tenant AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending leave request changed.' USING errcode='P0002'; END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'leave.request.'||p_decision,'leave_request',p_id::text,
    jsonb_build_object('note',p_note,'requested_days',r.requested_days,'day_portion',r.day_portion));
  RETURN jsonb_build_object('success',true,'decision',p_decision);
END;
$function$;
-- Preserve existing function execute grants; only replacement of the function body.
