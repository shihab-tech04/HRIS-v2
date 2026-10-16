-- Preserve the exact yearly leave-balance allocation created at submission.
-- Existing requests without a snapshot keep the legacy resolution calculation.
BEGIN;

CREATE TABLE IF NOT EXISTS private.hris_leave_balance_allocations (
  tenant_id uuid NOT NULL,
  leave_request_id uuid NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  leave_type_id uuid NOT NULL,
  balance_year integer NOT NULL,
  chargeable_days numeric NOT NULL CHECK (chargeable_days > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (leave_request_id, balance_year)
);
REVOKE ALL ON TABLE private.hris_leave_balance_allocations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hris_employee_submit_leave_request(
  p_tenant_id uuid, p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' AS $function$
DECLARE
  v_employee uuid;
  v_timezone text;
  v_today date;
  v_type uuid := nullif(p_payload->>'leave_type_id','')::uuid;
  v_from date := nullif(p_payload->>'from_date','')::date;
  v_to date := nullif(p_payload->>'to_date','')::date;
  v_portion text := coalesce(nullif(p_payload->>'day_portion',''),'full');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_attachment text := nullif(btrim(coalesce(p_payload->>'attachment_url','')),'');
  v_days numeric := 0;
  v_year integer;
  v_year_from date;
  v_year_to date;
  v_year_days numeric;
  v_available numeric;
  v_gender text;
  v_weekly_off integer[] := '{}'::integer[];
  v_leave public.leave_types%rowtype;
  v_request_id uuid;
  v_allocation jsonb := '[]'::jsonb;
  v_split record;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;
  SELECT t.timezone INTO v_timezone FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Active employee organization required.' USING errcode='42501';
  END IF;
  v_employee := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Linked employee record required.' USING errcode='42501';
  END IF;
  IF v_type IS NULL OR v_from IS NULL OR v_to IS NULL OR v_reason IS NULL THEN
    RAISE EXCEPTION 'Leave type, date range and reason are required.' USING errcode='22000';
  END IF;
  IF v_to < v_from OR v_portion NOT IN ('full','first_half','second_half')
     OR (v_portion <> 'full' AND v_from <> v_to) THEN
    RAISE EXCEPTION 'Valid leave dates and day portion are required.' USING errcode='22000';
  END IF;

  -- Freeze the calendar and applicable shift inputs for this short submission
  -- transaction so the charged ledger and saved allocation cannot diverge.
  LOCK TABLE public.holidays IN SHARE MODE;
  PERFORM 1 FROM public.employees e
  WHERE e.id=v_employee AND e.tenant_id=p_tenant_id FOR SHARE;
  PERFORM 1 FROM public.shifts s
  WHERE s.id=(SELECT e.shift_id FROM public.employees e
    WHERE e.id=v_employee AND e.tenant_id=p_tenant_id) AND s.active IS TRUE
  FOR SHARE;

  SELECT t.timezone,e.gender,coalesce(s.weekly_off_days,'{}'::integer[])
    INTO v_timezone,v_gender,v_weekly_off
  FROM public.tenants t
  JOIN public.employees e ON e.id=v_employee AND e.tenant_id=t.id
  LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.active IS TRUE
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  v_today := (now() AT TIME ZONE v_timezone)::date;

  SELECT * INTO v_leave FROM public.leave_types lt
  WHERE lt.id=v_type AND lt.tenant_id=p_tenant_id AND lt.active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leave type is not available.' USING errcode='23503'; END IF;
  IF v_leave.applicable_gender IS NOT NULL
     AND upper(v_leave.applicable_gender) <> upper(coalesce(v_gender,'')) THEN
    RAISE EXCEPTION 'This leave type is not available to this employee.' USING errcode='42501';
  END IF;
  IF v_leave.min_days_notice IS NOT NULL
     AND v_from < v_today + v_leave.min_days_notice THEN
    RAISE EXCEPTION 'This leave type requires % day(s) advance notice.',
      v_leave.min_days_notice USING errcode='22000';
  END IF;
  IF v_leave.requires_document_proof IS TRUE AND v_attachment IS NULL THEN
    RAISE EXCEPTION 'Supporting evidence is required for this leave type.' USING errcode='22000';
  END IF;
  IF v_attachment IS NOT NULL AND (
      split_part(v_attachment,'/',1) <> auth.uid()::text
      OR split_part(v_attachment,'/',2) <> p_tenant_id::text
      OR NOT EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id='leave-evidence' AND o.name=v_attachment
          AND o.owner_id=auth.uid()::text
      )
  ) THEN
    RAISE EXCEPTION 'Leave evidence path is not valid for this employee and organization.' USING errcode='42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_employee::text)::bigint);
  IF EXISTS (
    SELECT 1 FROM public.leave_requests r
    WHERE r.tenant_id=p_tenant_id AND r.employee_id=v_employee
      AND r.status IN ('pending','approved')
      AND daterange(r.from_date,r.to_date,'[]') && daterange(v_from,v_to,'[]')
      AND NOT (
        r.from_date=r.to_date AND v_from=v_to AND r.from_date=v_from
        AND r.day_portion IN ('first_half','second_half')
        AND v_portion IN ('first_half','second_half')
        AND r.day_portion<>v_portion
      )
  ) THEN
    RAISE EXCEPTION 'Overlapping leave request already exists.' USING errcode='23505';
  END IF;

  IF v_portion <> 'full' THEN
    IF extract(dow FROM v_from)::integer=ANY(v_weekly_off)
       OR EXISTS (SELECT 1 FROM public.holidays h
         WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
           AND v_from BETWEEN h.start_date AND h.end_date) THEN
      v_days := 0;
    ELSE
      v_days := 0.5;
    END IF;
  ELSE
    SELECT count(*)::numeric INTO v_days
    FROM generate_series(v_from,v_to,interval '1 day') g(d)
    WHERE NOT (extract(dow FROM g.d)::integer=ANY(v_weekly_off))
      AND NOT EXISTS (SELECT 1 FROM public.holidays h
        WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
          AND g.d::date BETWEEN h.start_date AND h.end_date);
  END IF;
  IF v_days<=0 THEN
    RAISE EXCEPTION 'The selected date range contains no chargeable leave day.' USING errcode='22000';
  END IF;

  FOR v_year IN SELECT generate_series(extract(year FROM v_from)::integer,extract(year FROM v_to)::integer)
  LOOP
    v_year_from := greatest(v_from,make_date(v_year,1,1));
    v_year_to := least(v_to,make_date(v_year,12,31));
    IF v_from=v_to AND v_portion<>'full' THEN
      IF extract(dow FROM v_year_from)::integer=ANY(v_weekly_off)
         OR EXISTS (SELECT 1 FROM public.holidays h
           WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
             AND v_year_from BETWEEN h.start_date AND h.end_date) THEN
        v_year_days := 0;
      ELSE
        v_year_days := 0.5;
      END IF;
    ELSE
      SELECT count(*)::numeric INTO v_year_days
      FROM generate_series(v_year_from,v_year_to,interval '1 day') g(d)
      WHERE NOT (extract(dow FROM g.d)::integer=ANY(v_weekly_off))
        AND NOT EXISTS (SELECT 1 FROM public.holidays h
          WHERE h.tenant_id=p_tenant_id AND h.active IS TRUE
            AND g.d::date BETWEEN h.start_date AND h.end_date);
    END IF;
    IF v_year_days<=0 THEN CONTINUE; END IF;

    v_allocation := v_allocation || jsonb_build_array(jsonb_build_object(
      'balance_year',v_year,'chargeable_days',v_year_days));
    INSERT INTO public.employee_leave_balances(
      tenant_id,employee_id,leave_type_id,balance_year,allocated_days
    ) VALUES (p_tenant_id,v_employee,v_type,v_year,coalesce(v_leave.annual_entitlement,0))
    ON CONFLICT DO NOTHING;
    SELECT opening_days+allocated_days+adjusted_days-used_days-pending_days
      INTO v_available
    FROM public.employee_leave_balances b
    WHERE b.tenant_id=p_tenant_id AND b.employee_id=v_employee
      AND b.leave_type_id=v_type AND b.balance_year=v_year
    FOR UPDATE;
    IF NOT FOUND OR coalesce(v_available,0)<v_year_days THEN
      RAISE EXCEPTION 'Insufficient leave balance for %. Available: %, requested: %.',
        v_year,coalesce(v_available,0),v_year_days USING errcode='22000';
    END IF;
  END LOOP;

  INSERT INTO public.leave_requests(
    tenant_id,employee_id,leave_type_id,from_date,to_date,requested_days,
    day_portion,reason,attachment_url,submitted_by
  ) VALUES (
    p_tenant_id,v_employee,v_type,v_from,v_to,v_days,v_portion,v_reason,
    v_attachment,auth.uid()
  ) RETURNING id INTO v_request_id;

  INSERT INTO private.hris_leave_balance_allocations(
    tenant_id,leave_request_id,employee_id,leave_type_id,balance_year,chargeable_days
  )
  SELECT p_tenant_id,v_request_id,v_employee,v_type,x.balance_year,x.chargeable_days
  FROM jsonb_to_recordset(v_allocation) AS x(balance_year integer,chargeable_days numeric);

  FOR v_split IN SELECT balance_year,chargeable_days
    FROM private.hris_leave_balance_allocations a
    WHERE a.tenant_id=p_tenant_id AND a.leave_request_id=v_request_id
      AND a.employee_id=v_employee AND a.leave_type_id=v_type
    ORDER BY balance_year
  LOOP
    UPDATE public.employee_leave_balances b
    SET pending_days=b.pending_days+v_split.chargeable_days,updated_at=now()
    WHERE b.tenant_id=p_tenant_id AND b.employee_id=v_employee
      AND b.leave_type_id=v_type AND b.balance_year=v_split.balance_year;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Leave balance ledger missing for year %.',v_split.balance_year USING errcode='P0002';
    END IF;
  END LOOP;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'leave.request.submitted','leave_request',v_request_id::text,
    jsonb_build_object('requested_days',v_days,'day_portion',v_portion,
      'from_date',v_from,'to_date',v_to,'tenant_id',p_tenant_id,
      'balance_allocations',v_allocation));
  RETURN v_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_leave_request(
  p_id uuid, p_decision text, p_note text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' AS $function$
DECLARE
  v_tenant uuid;
  r public.leave_requests%rowtype;
  v_off integer[] := '{}'::integer[];
  v_year integer;
  v_yfrom date;
  v_yto date;
  v_ydays numeric;
  v_split record;
  v_snapshot_count integer := 0;
  v_snapshot_days numeric := 0;
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

  SELECT count(*)::integer,coalesce(sum(a.chargeable_days),0)
    INTO v_snapshot_count,v_snapshot_days
  FROM private.hris_leave_balance_allocations a
  WHERE a.tenant_id=v_tenant AND a.leave_request_id=r.id
    AND a.employee_id=r.employee_id AND a.leave_type_id=r.leave_type_id;

  IF v_snapshot_count > 0 THEN
    IF abs(v_snapshot_days-r.requested_days) > 0.000001 THEN
      RAISE EXCEPTION 'Stored leave balance allocation does not match the request.' USING errcode='23514';
    END IF;
    FOR v_split IN SELECT a.balance_year,a.chargeable_days
      FROM private.hris_leave_balance_allocations a
      WHERE a.tenant_id=v_tenant AND a.leave_request_id=r.id
        AND a.employee_id=r.employee_id AND a.leave_type_id=r.leave_type_id
      ORDER BY a.balance_year
    LOOP
      UPDATE public.employee_leave_balances b SET
        pending_days=greatest(0,b.pending_days-v_split.chargeable_days),
        used_days=b.used_days+CASE WHEN p_decision='approved' THEN v_split.chargeable_days ELSE 0 END,
        updated_at=now()
      WHERE b.employee_id=r.employee_id AND b.tenant_id=v_tenant
        AND b.leave_type_id=r.leave_type_id AND b.balance_year=v_split.balance_year;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave balance ledger missing for year %.',v_split.balance_year USING errcode='P0002';
      END IF;
    END LOOP;
  ELSE
    -- Older requests have no submission-time split; retain their existing
    -- resolution behavior without attempting to backfill historical inputs.
    SELECT COALESCE(s.weekly_off_days,'{}'::integer[]) INTO v_off
    FROM public.employees e
    LEFT JOIN public.shifts s ON s.id=e.shift_id AND s.active=true
    WHERE e.id=r.employee_id AND e.tenant_id=v_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Leave employee not found in authorized organization.' USING errcode='P0002';
    END IF;
    FOR v_year IN SELECT generate_series(
      extract(year FROM r.from_date)::integer, extract(year FROM r.to_date)::integer
    ) LOOP
      v_yfrom := greatest(r.from_date, make_date(v_year,1,1));
      v_yto := least(r.to_date, make_date(v_year,12,31));
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
  END IF;

  UPDATE public.leave_requests SET
    status=p_decision,resolved_by=auth.uid(),resolved_at=now(),
    resolution_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now()
  WHERE id=p_id AND tenant_id=v_tenant AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending leave request changed.' USING errcode='P0002'; END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'leave.request.'||p_decision,'leave_request',p_id::text,
    jsonb_build_object('note',p_note,'requested_days',r.requested_days,'day_portion',r.day_portion,
      'balance_allocation_snapshot',v_snapshot_count > 0));
  RETURN jsonb_build_object('success',true,'decision',p_decision);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_employee_submit_leave_request(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_leave_request(uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_resolve_leave_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_leave_request(uuid,text,text) TO authenticated, service_role;

COMMIT;
