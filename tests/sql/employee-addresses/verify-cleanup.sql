SELECT public.check_employee_addresses(
  to_regprocedure('public.employee_get_my_addresses_v2()') IS NULL,
  'The temporary public SECURITY DEFINER address getter is removed after direct RLS reads are deployed'
);
