-- Return only the authenticated employee's addresses. The address table is
-- readable directly by HR permissions, so employee self-service uses this
-- narrowly scoped RPC rather than broadening table SELECT access.
CREATE OR REPLACE FUNCTION public.employee_get_my_addresses_v2()
RETURNS TABLE (
  id uuid,
  address_type text,
  district text,
  thana text,
  post_code text,
  city_village text,
  road_block_house text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_employee uuid := public.employee_for_auth_user();
BEGIN
  IF NOT public.is_live_session() OR v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee session required.' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT a.id, a.address_type, a.district, a.thana, a.post_code,
           a.city_village, a.road_block_house
    FROM public.employee_addresses AS a
    WHERE a.employee_id = v_employee
    ORDER BY CASE a.address_type
      WHEN 'Present' THEN 1
      WHEN 'Permanent' THEN 2
      ELSE 3
    END, a.created_at, a.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.employee_get_my_addresses_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_get_my_addresses_v2() FROM anon;
GRANT EXECUTE ON FUNCTION public.employee_get_my_addresses_v2() TO authenticated;
