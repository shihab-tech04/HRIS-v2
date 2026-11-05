-- HRIS user creation: scope SQL finalization to the employee's tenant.
-- This migration is additive/replaces only two related RPC definitions.
-- It preserves existing Auth users, employees, roles, grants and role assignments.
-- A newly created user receives both the global compatibility role and
-- the tenant membership that LiveApp requires to open the correct workspace.

CREATE OR REPLACE FUNCTION public.admin_get_my_provisioning_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_roles jsonb;
  v_employees jsonb;
BEGIN
  IF NOT public.has_permission('admin_users.manage') THEN
    RAISE EXCEPTION 'User management permission required.' USING errcode='42501';
  END IF;

  v_tenant_id := public.synesis_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'A single active organization context is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name),'[]'::jsonb)
    INTO v_roles
    FROM (
      SELECT r.id,r.name,r.description,
             coalesce(array_agg(rp.permission_id ORDER BY rp.permission_id)
               FILTER (WHERE rp.permission_id IS NOT NULL),'{}') AS permission_ids
      FROM public.roles r
      LEFT JOIN public.role_permissions rp ON rp.role_id=r.id
      WHERE r.active IS TRUE
        AND r.is_system IS FALSE
        -- Until tenant-owned custom-role creation is migrated, an unscoped
        -- historical role must not be offered in another organization.
        AND (
          r.id IN ('employee','hr_admin')
          OR EXISTS (
            SELECT 1 FROM public.tenant_memberships m
            WHERE m.tenant_id=v_tenant_id AND m.role=r.id
          )
          OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.employees e ON e.user_id=ur.user_id
            WHERE e.tenant_id=v_tenant_id AND ur.role_id=r.id
          )
        )
        AND (
          public.platform_hris_is_super_admin()
          OR NOT EXISTS (
            SELECT 1 FROM public.role_permissions requested
            WHERE requested.role_id=r.id
              AND NOT EXISTS (
                SELECT 1 FROM public.tenant_memberships mine
                JOIN public.role_permissions granted
                  ON granted.role_id=mine.role
                 AND granted.permission_id=requested.permission_id
                WHERE mine.tenant_id=v_tenant_id
                  AND mine.user_id=auth.uid()
                  AND mine.status='active'
              )
          )
        )
      GROUP BY r.id
    ) x;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',e.id,
      'employee_number',e.employee_number,
      'full_name',e.full_name,
      'official_email',e.official_email
    ) ORDER BY e.full_name),'[]'::jsonb)
    INTO v_employees
  FROM public.employees e
  WHERE e.tenant_id=v_tenant_id
    AND e.employment_status NOT IN ('resigned','terminated')
    AND e.user_id IS NULL;

  RETURN jsonb_build_object(
    'can_manage',true,
    'is_super_admin',public.platform_hris_is_super_admin(),
    'assignable_roles',coalesce(v_roles,'[]'::jsonb),
    'available_employees',coalesce(v_employees,'[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_finalize_system_user(
  p_actor_id uuid,
  p_user_id uuid,
  p_email text,
  p_employee_id uuid,
  p_role_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth'
AS $function$
DECLARE
  v_actor_super boolean := false;
  v_tenant_id uuid;
  v_display_name text;
  v_ungrantable integer;
BEGIN
  -- This RPC is called only by the server-side service role AFTER the
  -- sign-in session has been verified by the Edge Function.
  IF current_setting('role',true) IS DISTINCT FROM 'service_role'
    OR current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'Privileged server authorization required.' USING errcode='42501';
  END IF;
  IF p_actor_id IS NULL OR p_user_id IS NULL OR p_employee_id IS NULL
     OR p_role_id IS NULL OR btrim(p_email)=''
  THEN
    RAISE EXCEPTION 'Complete provisioning parameters required.' USING errcode='22023';
  END IF;

  SELECT a.is_super_admin INTO v_actor_super
  FROM public.admin_users a
  JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id=p_actor_id
    AND a.active IS TRUE
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until<=now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active administrator is required.' USING errcode='42501';
  END IF;

  SELECT e.tenant_id,e.full_name
    INTO v_tenant_id,v_display_name
  FROM public.employees e
  JOIN public.tenants t ON t.id=e.tenant_id AND t.is_active IS TRUE
  WHERE e.id=p_employee_id
    AND e.user_id IS NULL
    AND e.employment_status NOT IN ('resigned','terminated')
  FOR UPDATE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee is unavailable or linked to another account.' USING errcode='23505';
  END IF;

  IF v_actor_super IS NOT TRUE AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships m
    JOIN public.role_permissions granted
      ON granted.role_id=m.role
     AND granted.permission_id='admin_users.manage'
    WHERE m.tenant_id=v_tenant_id
      AND m.user_id=p_actor_id
      AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'User management permission is required in this organization.' USING errcode='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id=p_user_id
      AND lower(u.email)=lower(btrim(p_email))
      AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Provisioned login identity does not match the requested email.' USING errcode='23503';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id=p_user_id)
     OR EXISTS (SELECT 1 FROM public.tenant_memberships WHERE user_id=p_user_id)
  THEN
    RAISE EXCEPTION 'Authentication identity is already registered.' USING errcode='23505';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id=p_role_id AND r.active IS TRUE AND r.is_system IS FALSE
      AND (
        r.id IN ('employee','hr_admin')
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships m
          WHERE m.tenant_id=v_tenant_id AND m.role=r.id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.employees e ON e.user_id=ur.user_id
          WHERE e.tenant_id=v_tenant_id AND ur.role_id=r.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Role is not assignable within this organization.' USING errcode='42501';
  END IF;

  IF v_actor_super IS NOT TRUE THEN
    SELECT count(*) INTO v_ungrantable
    FROM public.role_permissions requested
    WHERE requested.role_id=p_role_id
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships mine
        JOIN public.role_permissions granted
          ON granted.role_id=mine.role
         AND granted.permission_id=requested.permission_id
        WHERE mine.tenant_id=v_tenant_id
          AND mine.user_id=p_actor_id
          AND mine.status='active'
      );
    IF v_ungrantable>0 THEN
      RAISE EXCEPTION 'Delegation denied: role exceeds administrator permissions.' USING errcode='42501';
    END IF;
  END IF;

  -- All following writes are in a single PostgreSQL transaction.
  INSERT INTO public.admin_users(user_id,display_name,active,is_super_admin)
  VALUES(p_user_id,v_display_name,true,false);

  INSERT INTO public.user_roles(user_id,role_id)
  VALUES(p_user_id,p_role_id);

  INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  VALUES(v_tenant_id,p_user_id,p_role_id,'active');

  UPDATE public.employees
     SET user_id=p_user_id,updated_at=now()
   WHERE id=p_employee_id AND tenant_id=v_tenant_id AND user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee account linkage could not be confirmed.' USING errcode='23505';
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (
    p_actor_id,
    'admin.user.provisioned',
    'system_user',
    p_user_id::text,
    jsonb_build_object(
      'tenant_id',v_tenant_id,
      'email',lower(btrim(p_email)),
      'employee_id',p_employee_id,
      'role_id',p_role_id
    )
  );

  RETURN jsonb_build_object(
    'success',true,
    'user_id',p_user_id,
    'employee_id',p_employee_id,
    'tenant_id',v_tenant_id,
    'role_id',p_role_id,
    'display_name',v_display_name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_finalize_system_user(uuid,uuid,text,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_system_user(uuid,uuid,text,uuid,text)
  TO service_role;
