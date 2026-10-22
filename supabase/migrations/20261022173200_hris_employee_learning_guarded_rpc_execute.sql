-- Scoped Supabase staging fix: restore only pre-existing, tenant-guarded authenticated business RPCs.
-- No tables, identities, historical role assignments, RLS policy or Edge function changes.
DO $verify$
DECLARE v_signature text; v_guard text; v_body text;
BEGIN
  FOR v_signature,v_guard IN
    SELECT * FROM (VALUES
      ('public.hris_employee_submit_attendance_correction(uuid,jsonb)','public.hris_own_employee_for_tenant('),
      ('public.hris_employee_submit_leave_request(uuid,jsonb)','public.hris_own_employee_for_tenant('),
      ('public.hris_resolve_learning_completion(uuid,uuid,text,text)','public.has_tenant_permission('),
      ('public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean)','public.has_tenant_permission(')
    ) AS t(signature,required_guard)
  LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'Required signature absent: %',v_signature USING ERRCODE='42883';
    END IF;
    SELECT pg_get_functiondef(to_regprocedure(v_signature)) INTO v_body;
    IF position('public.is_live_session()' IN v_body)=0
      OR position(v_guard IN v_body)=0
    THEN RAISE EXCEPTION 'Missing session or tenant safety guard: %',v_signature USING ERRCODE='42501';
    END IF;
  END LOOP;
END $verify$;
REVOKE ALL ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_attendance_correction(uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_employee_submit_leave_request(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_employee_submit_leave_request(uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_resolve_learning_completion(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_resolve_learning_completion(uuid,uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean) TO authenticated, service_role;
