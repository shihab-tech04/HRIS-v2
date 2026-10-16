CREATE OR REPLACE FUNCTION public.employee_get_my_payslips()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_employee uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;

  v_employee := public.employee_for_auth_user();
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'pay_period_name',p.name,'pay_date',p.pay_date,'currency',s.currency,
      'basic_salary',s.basic_salary,'house_rent_allowance',s.house_rent_allowance,
      'medical_allowance',s.medical_allowance,'transport_allowance',s.transport_allowance,
      'special_allowance',s.special_allowance,'overtime_pay',s.overtime_pay,'bonus',s.bonus,
      'tax_deduction',s.tax_deduction,'provident_fund_deduction',s.provident_fund_deduction,
      'leave_without_pay_deduction',s.leave_without_pay_deduction,'other_deductions',s.other_deductions,
      'gross_earnings',s.gross_earnings,'total_deductions',s.total_deductions,'net_salary',s.net_salary,
      'status',s.status,'released_at',s.released_at
    ) ORDER BY p.start_date DESC)
    FROM public.payslips s
    JOIN public.pay_periods p ON p.id=s.pay_period_id
    WHERE s.employee_id=v_employee AND s.status='released'
  ),'[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.employee_get_my_payslips() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employee_get_my_payslips() TO authenticated;
