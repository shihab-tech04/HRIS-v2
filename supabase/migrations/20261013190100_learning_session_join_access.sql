-- Provide an online meeting link only to an employee who is actively enrolled
-- in that scheduled session. This is an access read only; it does not confirm
-- attendance or learning completion.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_my_learning_join_links(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_object_agg(e.id::text,s.meeting_url),'{}'::jsonb)
  FROM public.learning_enrollments e
  JOIN public.learning_sessions s
    ON s.tenant_id=e.tenant_id AND s.id=e.session_id
  WHERE public.is_live_session()
    AND p_tenant_id IS NOT NULL
    AND public.hris_can_read_learning_catalog(p_tenant_id)
    AND e.tenant_id=p_tenant_id
    AND e.employee_id=public.hris_own_employee_for_tenant(p_tenant_id)
    AND e.status='enrolled'
    AND s.status='scheduled'
    AND s.meeting_url ~* '^https?://';
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_learning_join_links(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_learning_join_links(uuid) TO authenticated;

COMMIT;
