-- Phase 1 parity: restore the existing HRIS Change Photo workflow without
-- altering the approved employee-profile fields, scalar correction workflow, or tenant model.
-- The avatar bucket already exists with authenticated owner-scoped RLS.
BEGIN;

CREATE OR REPLACE FUNCTION public.employee_get_my_avatar_v1(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_path text;
BEGIN
  -- Reuse the already-approved live-session, selected-tenant and employee-link guard.
  v_employee_id := private.hris_profile_own_employee(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee in this organization is required.' USING errcode='42501';
  END IF;
  SELECT e.avatar_url INTO v_path
  FROM public.employees e
  WHERE e.id=v_employee_id AND e.tenant_id=p_tenant_id;
  RETURN nullif(btrim(v_path),'');
END
$function$;

CREATE OR REPLACE FUNCTION public.employee_set_my_avatar_v1(
  p_tenant_id uuid,
  p_storage_path text,
  p_expected_path text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_previous_path text;
  v_leaf text;
  v_authenticated_user_id text := auth.uid()::text;
BEGIN
  v_employee_id := private.hris_profile_own_employee(p_tenant_id);
  IF v_employee_id IS NULL OR v_authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'An active employee in this organization is required.' USING errcode='42501';
  END IF;

  -- The client uploads an immutable file under its own user / selected tenant.
  -- An arbitrary URL, a different tenant, or a different user's Storage path is forbidden.
  v_leaf := split_part(coalesce(p_storage_path,''),'/',3);
  IF p_tenant_id IS NULL OR p_storage_path IS NULL OR length(p_storage_path)>180
    OR array_length(string_to_array(p_storage_path,'/'),1) IS DISTINCT FROM 3
    OR split_part(p_storage_path,'/',1) IS DISTINCT FROM v_authenticated_user_id
    OR split_part(p_storage_path,'/',2) IS DISTINCT FROM p_tenant_id::text
    OR v_leaf !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg)$'
  THEN
    RAISE EXCEPTION 'Photo must belong to your account and organization.' USING errcode='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='employee-avatars'
      AND o.name=p_storage_path
      AND o.owner_id=v_authenticated_user_id
      AND coalesce(o.metadata->>'mimetype','') IN ('image/png','image/jpeg')
      AND coalesce(nullif(o.metadata->>'size','')::bigint,0) BETWEEN 1 AND 2097152
  ) THEN
    RAISE EXCEPTION 'Upload a JPEG or PNG photo of no more than 2 MB first.' USING errcode='22023';
  END IF;

  SELECT nullif(btrim(e.avatar_url),'') INTO v_previous_path
  FROM public.employees e
  WHERE e.id=v_employee_id AND e.tenant_id=p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee profile not found in this organization.' USING errcode='P0002';
  END IF;
  IF v_previous_path IS DISTINCT FROM nullif(btrim(p_expected_path),'') THEN
    RAISE EXCEPTION 'Your photo changed. Refresh before replacing it.' USING errcode='40001';
  END IF;

  UPDATE public.employees e SET avatar_url=p_storage_path,updated_at=clock_timestamp()
  WHERE e.id=v_employee_id AND e.tenant_id=p_tenant_id;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'employee.avatar.updated','employee',v_employee_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'bucket','employee-avatars'));

  RETURN p_storage_path;
END
$function$;

REVOKE ALL ON FUNCTION public.employee_get_my_avatar_v1(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.employee_set_my_avatar_v1(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.employee_get_my_avatar_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_set_my_avatar_v1(uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.employee_set_my_avatar_v1(uuid,text,text)
  IS 'Sets only the signed-in active employee avatar for the selected tenant after private Storage ownership, content-type, file-size, and optimistic concurrency checks.';
COMMIT;
