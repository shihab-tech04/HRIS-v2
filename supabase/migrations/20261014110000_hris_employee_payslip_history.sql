-- Phase 13 employee self-service: read only released payslips for the linked
-- employee, with same-tenant pay-period labels and no bank or tax identifiers.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_my_payslips(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_payslips jsonb;
BEGIN
  IF NOT public.is_live_session()
      OR NOT EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id=p_tenant_id AND t.is_active IS TRUE
      ) THEN
    RAISE EXCEPTION 'Active tenant session required.' USING errcode='42501';
  END IF;

  v_employee_id:=public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Linked employee required.' USING errcode='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'currency',s.currency,
    'basic_salary',s.basic_salary,
    'house_rent_allowance',s.house_rent_allowance,
    'medical_allowance',s.medical_allowance,
    'transport_allowance',s.transport_allowance,
    'special_allowance',s.special_allowance,
    'overtime_pay',s.overtime_pay,
    'bonus',s.bonus,
    'gross_earnings',s.gross_earnings,
    'tax_deduction',s.tax_deduction,
    'provident_fund_deduction',s.provident_fund_deduction,
    'leave_without_pay_deduction',s.leave_without_pay_deduction,
    'other_deductions',s.other_deductions,
    'total_deductions',s.total_deductions,
    'net_salary',s.net_salary,
    'released_at',s.released_at,
    'period',jsonb_build_object(
      'id',p.id,
      'name',p.name,
      'start_date',p.start_date,
      'end_date',p.end_date,
      'pay_date',p.pay_date
    )
  ) ORDER BY COALESCE(p.pay_date,p.end_date) DESC,p.end_date DESC,s.id DESC),'[]'::jsonb)
  INTO v_payslips
  FROM public.payslips s
  JOIN public.pay_periods p
    ON p.tenant_id=s.tenant_id AND p.id=s.pay_period_id
  WHERE s.tenant_id=p_tenant_id
    AND s.employee_id=v_employee_id
    AND s.status='released';

  RETURN jsonb_build_object('tenant_id',p_tenant_id,'payslips',v_payslips);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_payslips(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_payslips(uuid) TO authenticated,service_role;

COMMIT;
