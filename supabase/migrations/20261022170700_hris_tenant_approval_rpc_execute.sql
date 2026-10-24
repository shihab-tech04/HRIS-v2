-- Non-production HRIS 360 functional API repair.
-- Only grant the two approved, tenant-scoped decision RPCs; do not replicate legacy broad table grants.
-- Verified against identical original/new definitions, 22 October 2026.
DO $guard$
DECLARE
  v_name text;
  v_oid oid;
  v_def text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['admin_resolve_attendance_correction','admin_resolve_leave_request']
  LOOP
    v_oid := to_regprocedure(format('public.%I(uuid,text,text)',v_name));
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Required HRIS approval RPC % missing or changed signature', v_name USING ERRCODE='42883';
    END IF;
    SELECT pg_get_functiondef(v_oid) INTO v_def;
    IF position('public.is_live_session()' IN v_def) = 0
       OR position('public.has_tenant_permission(' IN v_def) = 0
       OR position('INSERT INTO public.admin_audit_logs' IN v_def) = 0
    THEN
      RAISE EXCEPTION 'Unsafe or unreviewed guard change in %; do not grant RPC access',v_name USING ERRCODE='42501';
    END IF;
  END LOOP;
END;
$guard$;
REVOKE ALL ON FUNCTION public.admin_resolve_attendance_correction(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_leave_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_attendance_correction(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_leave_request(uuid,text,text) TO authenticated, service_role;
