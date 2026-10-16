-- Synthetic data and auth helper for the payslip session-guard acceptance test.
-- This fixture runs only in isolated PostgreSQL CI; it does not use production rows.
CREATE TABLE public.payslip_employee_test_map (
  user_id uuid PRIMARY KEY,
  employee_id uuid UNIQUE NOT NULL,
  active boolean NOT NULL DEFAULT true,
  employment_status text NOT NULL DEFAULT 'active'
);

CREATE FUNCTION public.employee_for_auth_user()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT employee_id
  FROM public.payslip_employee_test_map
  WHERE user_id=auth.uid()
    AND active=true
    AND employment_status NOT IN ('resigned','terminated')
  LIMIT 1
$$;

CREATE TABLE public.pay_periods (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  start_date date NOT NULL,
  pay_date date NOT NULL
);

CREATE TABLE public.payslips (
  id uuid PRIMARY KEY,
  pay_period_id uuid NOT NULL REFERENCES public.pay_periods(id),
  employee_id uuid NOT NULL,
  currency text NOT NULL,
  basic_salary numeric NOT NULL,
  house_rent_allowance numeric NOT NULL,
  medical_allowance numeric NOT NULL,
  transport_allowance numeric NOT NULL,
  special_allowance numeric NOT NULL,
  overtime_pay numeric NOT NULL,
  bonus numeric NOT NULL,
  tax_deduction numeric NOT NULL,
  provident_fund_deduction numeric NOT NULL,
  leave_without_pay_deduction numeric NOT NULL,
  other_deductions numeric NOT NULL,
  gross_earnings numeric NOT NULL,
  total_deductions numeric NOT NULL,
  net_salary numeric NOT NULL,
  status text NOT NULL,
  released_at timestamptz
);

INSERT INTO public.payslip_employee_test_map(user_id,employee_id) VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','ffffffff-ffff-4fff-8fff-ffffffffffff');

INSERT INTO public.pay_periods(id,name,start_date,pay_date) VALUES
 ('11111111-1111-4111-8111-111111111111','Synthetic October','2026-10-01','2026-10-31'),
 ('22222222-2222-4222-8222-222222222222','Synthetic November','2026-11-01','2026-11-30');

INSERT INTO public.payslips(
 id,pay_period_id,employee_id,currency,basic_salary,house_rent_allowance,medical_allowance,
 transport_allowance,special_allowance,overtime_pay,bonus,tax_deduction,provident_fund_deduction,
 leave_without_pay_deduction,other_deductions,gross_earnings,total_deductions,net_salary,status,released_at
) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','BDT',100,0,0,0,0,0,0,0,0,0,0,100,0,100,'released',now()),
 ('aaaaaaaa-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','BDT',200,0,0,0,0,0,0,0,0,0,0,200,0,200,'draft',NULL),
 ('bbbbbbbb-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff','BDT',300,0,0,0,0,0,0,0,0,0,0,300,0,300,'released',now());
