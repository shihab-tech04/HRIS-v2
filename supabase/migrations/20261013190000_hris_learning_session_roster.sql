-- Phase 12 manager roster read for a scheduled learning session.
-- Attendance and completion remain separate until their approval policy is confirmed.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.hris_get_learning_session_roster(
  p_tenant_id uuid,
  p_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_session public.learning_sessions%ROWTYPE;
  v_program_title text;
  v_learners jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
      OR NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;

  SELECT s.* INTO v_session
  FROM public.learning_sessions s
  WHERE s.tenant_id=p_tenant_id AND s.id=p_session_id AND s.status='scheduled';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scheduled learning session not found.' USING errcode='P0002';
  END IF;
  SELECT p.title INTO v_program_title
  FROM public.learning_programs p
  WHERE p.tenant_id=p_tenant_id AND p.id=v_session.program_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'enrollment_id',e.id,
    'employee_number',em.employee_number,
    'employee_name',em.full_name,
    'enrolled_at',e.created_at,
    'mandatory',e.mandatory,
    'due_date',e.due_date
  ) ORDER BY em.full_name,e.id),'[]'::jsonb)
    INTO v_learners
  FROM public.learning_enrollments e
  JOIN public.employees em ON em.tenant_id=e.tenant_id AND em.id=e.employee_id
  WHERE e.tenant_id=p_tenant_id AND e.session_id=p_session_id AND e.status='enrolled';

  RETURN jsonb_build_object(
    'session',jsonb_build_object(
      'id',v_session.id,
      'program_title',v_program_title,
      'trainer_name',v_session.trainer_name,
      'start_at',v_session.start_at,
      'end_at',v_session.end_at,
      'location',v_session.location,
      'capacity',v_session.capacity,
      'enrollment_deadline',v_session.enrollment_deadline,
      'status',v_session.status
    ),
    'learners',v_learners
  );
END
$function$;

REVOKE ALL ON FUNCTION private.hris_get_learning_session_roster(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.hris_get_learning_session_roster(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_learning_session_roster(
  p_tenant_id uuid,
  p_session_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT private.hris_get_learning_session_roster(p_tenant_id,p_session_id)
$function$;

REVOKE ALL ON FUNCTION public.hris_get_learning_session_roster(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_learning_session_roster(uuid,uuid) TO authenticated;

COMMIT;
