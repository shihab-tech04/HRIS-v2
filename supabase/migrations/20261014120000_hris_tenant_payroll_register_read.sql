-- Phase 13 payroll-view journey: read-only, tenant-authorized register using
-- persisted amounts and a response whitelist that omits bank/tax identifiers.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_tenant_payroll_register(
  p_tenant_id uuid,
  p_pay_period_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_periods jsonb;
  v_payslips jsonb;
  v_total_count integer;
  v_search text;
BEGIN
  IF NOT public.is_live_session()
      OR NOT EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id=p_tenant_id AND t.is_active IS TRUE
      )
      OR NOT (
        public.has_tenant_permission(p_tenant_id,'payroll.view')
        OR public.has_tenant_permission(p_tenant_id,'payroll.manage')
      ) THEN
    RAISE EXCEPTION 'Active payroll membership required.' USING errcode='42501';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('draft','released','void') THEN
    RAISE EXCEPTION 'Unsupported payslip status.' USING errcode='22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
      OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Invalid payroll register page.' USING errcode='22023';
  END IF;
  v_search:=NULLIF(btrim(p_search),'');
  IF length(v_search)>100 THEN
    RAISE EXCEPTION 'Search text is too long.' USING errcode='22023';
  END IF;

  IF p_pay_period_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pay_periods p
    WHERE p.id=p_pay_period_id AND p.tenant_id=p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Pay period was not found in this tenant.' USING errcode='22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'start_date',p.start_date,'end_date',p.end_date,
    'pay_date',p.pay_date,'status',p.status,'currency',p.currency
  ) ORDER BY COALESCE(p.pay_date,p.end_date) DESC,p.end_date DESC,p.id DESC),'[]'::jsonb)
  INTO v_periods
  FROM public.pay_periods p
  WHERE p.tenant_id=p_tenant_id;

  SELECT count(*)::integer INTO v_total_count
  FROM public.payslips s
  JOIN public.pay_periods p ON p.tenant_id=s.tenant_id AND p.id=s.pay_period_id
  JOIN public.employees e ON e.tenant_id=s.tenant_id AND e.id=s.employee_id
  WHERE s.tenant_id=p_tenant_id
    AND (p_pay_period_id IS NULL OR s.pay_period_id=p_pay_period_id)
    AND (p_status IS NULL OR s.status=p_status)
    AND (v_search IS NULL OR e.full_name ILIKE '%'||v_search||'%' OR e.employee_number ILIKE '%'||v_search||'%');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',r.id,'pay_period_id',r.pay_period_id,'period_name',r.period_name,
    'period_start_date',r.period_start_date,'pay_date',r.pay_date,
    'employee_id',r.employee_id,'employee_name',r.employee_name,
    'employee_number',r.employee_number,'currency',r.currency,'status',r.status,
    'gross_earnings',r.gross_earnings,'total_deductions',r.total_deductions,
    'net_salary',r.net_salary,'released_at',r.released_at
  ) ORDER BY COALESCE(r.pay_date,r.period_end_date) DESC,r.period_end_date DESC,
    r.employee_name,r.id),'[]'::jsonb)
  INTO v_payslips
  FROM (
    SELECT s.id,s.pay_period_id,p.name AS period_name,p.start_date AS period_start_date,
      p.end_date AS period_end_date,p.pay_date,e.id AS employee_id,e.full_name AS employee_name,
      e.employee_number,s.currency,s.status,s.gross_earnings,s.total_deductions,
      s.net_salary,s.released_at
    FROM public.payslips s
    JOIN public.pay_periods p ON p.tenant_id=s.tenant_id AND p.id=s.pay_period_id
    JOIN public.employees e ON e.tenant_id=s.tenant_id AND e.id=s.employee_id
    WHERE s.tenant_id=p_tenant_id
      AND (p_pay_period_id IS NULL OR s.pay_period_id=p_pay_period_id)
      AND (p_status IS NULL OR s.status=p_status)
      AND (v_search IS NULL OR e.full_name ILIKE '%'||v_search||'%' OR e.employee_number ILIKE '%'||v_search||'%')
    ORDER BY COALESCE(p.pay_date,p.end_date) DESC,p.end_date DESC,e.full_name,s.id
    LIMIT p_limit OFFSET p_offset
  ) r;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'periods',v_periods,'payslips',v_payslips,
    'total_count',v_total_count,'limit',p_limit,'offset',p_offset
  );
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_payroll_register(uuid,uuid,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_payroll_register(uuid,uuid,text,text,integer,integer) TO authenticated,service_role;

COMMIT;
