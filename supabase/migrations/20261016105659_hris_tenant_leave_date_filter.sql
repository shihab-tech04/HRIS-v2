-- Honor the existing optional date window for leave requests as well as
-- holidays. Requests are included when their range overlaps the requested
-- window; NULL bounds preserve the existing unbounded manager queue contract.
CREATE OR REPLACE FUNCTION public.hris_get_tenant_leave_data(
  p_tenant_id uuid, p_start date DEFAULT NULL, p_end date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth' AS $function$
BEGIN
  IF NOT (
    public.has_tenant_permission(p_tenant_id, 'leave.view')
    OR public.has_tenant_permission(p_tenant_id, 'leave.manage')
  ) THEN
    RAISE EXCEPTION 'Tenant leave permission required.' USING errcode='42501';
  END IF;

  RETURN jsonb_build_object(
    'leave_types',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name)
      FROM (SELECT * FROM public.leave_types WHERE tenant_id=p_tenant_id) x
    ),'[]'::jsonb),
    'holidays',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.start_date,x.name)
      FROM (SELECT * FROM public.holidays WHERE tenant_id=p_tenant_id
        AND (p_start IS NULL OR end_date>=p_start)
        AND (p_end IS NULL OR start_date<=p_end)) x
    ),'[]'::jsonb),
    'requests',coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.submitted_at DESC)
      FROM (
        SELECT r.*,e.employee_number,e.full_name,lt.name leave_type_name,lt.code leave_type_code
        FROM public.leave_requests r
        JOIN public.employees e ON e.id=r.employee_id AND e.tenant_id=p_tenant_id
        JOIN public.leave_types lt ON lt.id=r.leave_type_id AND lt.tenant_id=p_tenant_id
        WHERE r.tenant_id=p_tenant_id
          AND (p_start IS NULL OR r.to_date>=p_start)
          AND (p_end IS NULL OR r.from_date<=p_end)
      ) x
    ),'[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_tenant_leave_data(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_leave_data(uuid,date,date) TO authenticated, service_role;
