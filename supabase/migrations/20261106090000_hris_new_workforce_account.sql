-- HRIS SaaS: enable administrator-created first employee/user in an empty organization.
-- Additive RPC. Retains existing employee-linking RPC, approved layout, roles and data.
-- Server-side service-role use only. Atomic employee, membership, role and audit writes.
CREATE FUNCTION public.admin_finalize_new_workforce_user(
  p_actor_id uuid, p_user_id uuid, p_tenant_id uuid,
  p_email text, p_display_name text, p_role_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth'
AS $hris$
DECLARE
  v_super boolean := false;
  v_name text := nullif(btrim(p_display_name),'');
  v_email text := lower(btrim(p_email));
  v_employee_id uuid;
  v_number text;
  v_not_grantable integer;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'service_role'
    OR current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'Privileged server call required.' USING ERRCODE='42501';
  END IF;
  IF p_actor_id IS NULL OR p_user_id IS NULL OR p_tenant_id IS NULL
    OR v_name IS NULL OR length(v_name)>200
    OR v_email IS NULL OR length(v_email)>320
    OR v_email NOT LIKE '%@%.%' OR nullif(btrim(p_role_id),'') IS NULL
  THEN
    RAISE EXCEPTION 'Complete new employee details required.' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id=p_user_id
      AND lower(u.email)=v_email AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'New login identity does not match.' USING ERRCODE='23503';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id=p_user_id)
     OR EXISTS (SELECT 1 FROM public.tenant_memberships WHERE user_id=p_user_id)
     OR EXISTS (SELECT 1 FROM public.employees WHERE user_id=p_user_id)
  THEN
    RAISE EXCEPTION 'Login identity already linked.' USING ERRCODE='23505';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active=TRUE
  ) THEN
    RAISE EXCEPTION 'Selected organization is unavailable.' USING ERRCODE='42501';
  END IF;

  SELECT a.is_super_admin INTO v_super
  FROM public.admin_users a
  JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id=p_actor_id AND a.active=TRUE
    AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL
    AND (u.banned_until IS NULL OR u.banned_until<=now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active creator is required.' USING ERRCODE='42501';
  END IF;
  IF v_super IS NOT TRUE AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.role_permissions rp ON rp.role_id=m.role
    JOIN public.roles r ON r.id=m.role AND r.active=TRUE
    WHERE m.tenant_id=p_tenant_id AND m.user_id=p_actor_id
      AND m.status='active' AND rp.permission_id='admin_users.manage'
  ) THEN
    RAISE EXCEPTION 'Administrator permission is required for this organization.' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id=p_role_id AND r.active=TRUE AND r.is_system=FALSE
      AND (r.id IN ('employee','hr_admin')
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships m
          WHERE m.tenant_id=p_tenant_id AND m.role=r.id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.employees e ON e.user_id=ur.user_id
          WHERE e.tenant_id=p_tenant_id AND ur.role_id=r.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Selected role is not available in this organization.' USING ERRCODE='42501';
  END IF;
  IF v_super IS NOT TRUE THEN
    SELECT count(*) INTO v_not_grantable
    FROM public.role_permissions requested
    WHERE requested.role_id=p_role_id
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships mine
        JOIN public.role_permissions granted ON granted.role_id=mine.role
          AND granted.permission_id=requested.permission_id
        WHERE mine.user_id=p_actor_id AND mine.tenant_id=p_tenant_id
          AND mine.status='active'
      );
    IF v_not_grantable>0 THEN
      RAISE EXCEPTION 'Cannot delegate permissions the creator does not hold.' USING ERRCODE='42501';
    END IF;
  END IF;

  -- Generated from immutable Auth UUID, not supplied by the browser.
  -- Existing tenant+employee_number uniqueness prevents duplicate records.
  v_number := 'EMP-' || upper(substr(replace(p_user_id::text,'-',''),1,16));

  INSERT INTO public.admin_users(user_id,display_name,active,is_super_admin)
    VALUES(p_user_id,v_name,TRUE,FALSE);

  INSERT INTO public.user_roles(user_id,role_id)
    VALUES(p_user_id,p_role_id);

  INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
    VALUES(p_tenant_id,p_user_id,p_role_id,'active');

  INSERT INTO public.employees(
    tenant_id,employee_number,user_id,full_name,official_email,
    joining_date,employment_type,employment_status
  ) VALUES (
    p_tenant_id,v_number,p_user_id,v_name,v_email,
    current_date,'full_time','active'
  ) RETURNING id INTO v_employee_id;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(p_actor_id,'admin.user.provisioned','system_user',p_user_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,
      'employee_id',v_employee_id,'role_id',p_role_id,
      'account_created_by','admin'));

  RETURN jsonb_build_object(
    'success',TRUE,'user_id',p_user_id,'tenant_id',p_tenant_id,
    'employee_id',v_employee_id,'role_id',p_role_id
  );
END;
$hris$;

REVOKE ALL ON FUNCTION public.admin_finalize_new_workforce_user(uuid,uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_new_workforce_user(uuid,uuid,uuid,text,text,text)
  TO service_role;
