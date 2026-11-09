-- HRIS Release 1: promote the existing hosted role/access RPCs into source,
-- and make user role changes update the tenant membership authorization reads.
-- No schema or identity rows are changed by this migration itself.

CREATE OR REPLACE FUNCTION public.admin_save_role(p_role_id text, p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth'
AS $function$
DECLARE
  v_id text := lower(regexp_replace(
    coalesce(nullif(btrim(p_role_id),''), nullif(btrim(p_payload->>'id'),''), ''),
    '[^a-z0-9_]+', '_', 'g'));
  v_name text := nullif(btrim(coalesce(p_payload->>'name','')), '');
  v_description text := nullif(btrim(coalesce(p_payload->>'description','')), '');
  v_active boolean := coalesce((p_payload->>'active')::boolean,true);
  v_permission_ids text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_payload->'permission_ids','[]'::jsonb))), '{}');
  v_missing integer;
BEGIN
  IF NOT public.platform_hris_is_super_admin()
    OR NOT public.has_permission('roles.manage') THEN
    RAISE EXCEPTION 'Role management permission required.' USING errcode='42501';
  END IF;
  IF v_id !~ '^[a-z0-9][a-z0-9_]{1,63}$'
    OR v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 80
    OR length(coalesce(v_description,''))>240 THEN
    RAISE EXCEPTION 'Provide a valid role ID, a 2-80 character name, and a description of at most 240 characters.'
      USING errcode='22000';
  END IF;
  IF cardinality(v_permission_ids)>500
    OR cardinality(v_permission_ids)<>(
      SELECT count(DISTINCT requested.permission_id)::integer
      FROM unnest(v_permission_ids) AS requested(permission_id)
    ) THEN
    RAISE EXCEPTION 'Role permissions contain duplicates or exceed the 500 permission limit.'
      USING errcode='22000';
  END IF;
  IF v_id IN ('12345','nadiaaa') OR v_name ILIKE 'nadia%' THEN
    RAISE EXCEPTION 'Protected unrelated role cannot be changed.' USING errcode='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roles WHERE id=v_id AND is_system=true) THEN
    RAISE EXCEPTION 'Protected system role cannot be modified.' USING errcode='42501';
  END IF;
  IF v_active IS FALSE AND EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.role=v_id AND tm.status='active'
  ) THEN
    RAISE EXCEPTION 'Role cannot be deactivated while active accounts are assigned. Reassign those accounts first.'
      USING errcode='23514';
  END IF;

  SELECT count(*) INTO v_missing
  FROM unnest(v_permission_ids) requested(permission_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions p WHERE p.id=requested.permission_id
  );
  IF v_missing>0 THEN
    RAISE EXCEPTION 'Role contains unknown permission.' USING errcode='23503';
  END IF;

  INSERT INTO public.roles(id,name,description,active,is_system)
  VALUES(v_id,v_name,v_description,v_active,false)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    description=excluded.description,
    active=excluded.active;

  DELETE FROM public.role_permissions WHERE role_id=v_id;
  INSERT INTO public.role_permissions(role_id,permission_id)
  SELECT v_id,permission_id FROM unnest(v_permission_ids) permission_id;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'admin.role.saved','role',v_id,
    jsonb_build_object('name',v_name,'permissions',to_jsonb(v_permission_ids),'active',v_active));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_save_role(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_role(text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_update_user_access(
  p_user_id uuid,
  p_role_id text,
  p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth'
AS $function$
DECLARE
  v_tenant_id uuid := public.synesis_tenant_id();
  v_missing integer;
  v_previous_role text;
  v_previous_membership_status text;
  v_previous_active boolean;
  v_other_tenant_memberships boolean;
  v_membership_status text;
BEGIN
  IF p_user_id IS NULL OR nullif(btrim(p_role_id),'') IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'User, role, and account status are required.' USING errcode='22023';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'A single active organization context is required.' USING errcode='42501';
  END IF;
  IF NOT public.has_tenant_permission(v_tenant_id,'admin_users.manage') THEN
    RAISE EXCEPTION 'Administrator management permission required.' USING errcode='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id=p_user_id AND is_super_admin=true
  ) THEN
    RAISE EXCEPTION 'Protected Super Administrator cannot be modified.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id=p_user_id AND a.is_super_admin=false
      AND (
        EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.user_id=a.user_id AND e.tenant_id=v_tenant_id
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.user_id=a.user_id AND tm.tenant_id=v_tenant_id
            AND tm.status='active'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Administrator account is outside the current tenant.' USING errcode='42501';
  END IF;
  IF p_user_id=auth.uid() AND p_active=false THEN
    RAISE EXCEPTION 'You cannot deactivate your own administrative account.' USING errcode='42501';
  END IF;
  IF p_active=false
    AND NOT public.platform_hris_is_super_admin()
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.user_id=p_user_id AND tm.tenant_id<>v_tenant_id AND tm.status='active'
    ) THEN
    RAISE EXCEPTION 'Only a Platform Super Admin can deactivate an account used by another active organization.' USING errcode='42501';
  END IF;
  IF p_role_id IN ('12345','nadiaaa') THEN
    RAISE EXCEPTION 'Protected unrelated role cannot be assigned.' USING errcode='42501';
  END IF;
  IF NOT public.platform_hris_is_super_admin()
    AND p_role_id <> 'hr_admin'
    AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.role=p_role_id AND tm.tenant_id=v_tenant_id AND tm.status='active'
    ) THEN
    RAISE EXCEPTION 'Selected custom role is not configured for this tenant.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.roles
    WHERE id=p_role_id AND active=true AND is_system=false
  ) THEN
    RAISE EXCEPTION 'Selected role is unavailable.' USING errcode='23503';
  END IF;

  IF NOT public.platform_hris_is_super_admin() THEN
    SELECT count(*) INTO v_missing
    FROM public.role_permissions requested
    WHERE requested.role_id=p_role_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_memberships actor_membership
        JOIN public.roles actor_role
          ON actor_role.id=actor_membership.role AND actor_role.active=true
        JOIN public.role_permissions actor_permission
          ON actor_permission.role_id=actor_role.id
          AND actor_permission.permission_id=requested.permission_id
        WHERE actor_membership.user_id=auth.uid()
          AND actor_membership.tenant_id=v_tenant_id
          AND actor_membership.status='active'
      );
    IF v_missing>0 THEN
      RAISE EXCEPTION 'Delegation denied: selected role exceeds your permissions.' USING errcode='42501';
    END IF;
  END IF;

  SELECT tm.role,tm.status INTO v_previous_role,v_previous_membership_status
  FROM public.tenant_memberships tm
  WHERE tm.tenant_id=v_tenant_id AND tm.user_id=p_user_id
  FOR UPDATE;
  SELECT a.active INTO v_previous_active
  FROM public.admin_users a WHERE a.user_id=p_user_id FOR UPDATE;
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id=p_user_id AND tm.tenant_id<>v_tenant_id
  ) INTO v_other_tenant_memberships;

  UPDATE public.admin_users SET active=p_active
  WHERE user_id=p_user_id AND is_super_admin=false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Administrator not found.' USING errcode='P0002';
  END IF;

  v_membership_status := CASE WHEN p_active THEN 'active' ELSE 'inactive' END;
  INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
  VALUES(v_tenant_id,p_user_id,p_role_id,v_membership_status)
  ON CONFLICT (tenant_id,user_id) DO UPDATE SET
    role=excluded.role,
    status=excluded.status;

  -- user_roles is a one-row legacy compatibility table. Keep it aligned only
  -- when that identity has no other organization memberships; scoped access is
  -- always resolved from tenant_memberships.role.
  IF NOT v_other_tenant_memberships THEN
    INSERT INTO public.user_roles(user_id,role_id)
    VALUES(p_user_id,p_role_id)
    ON CONFLICT(user_id) DO UPDATE SET role_id=excluded.role_id;
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'admin.user.access.updated','admin_user',p_user_id::text,
    jsonb_build_object(
      'tenant_id',v_tenant_id,
      'previous_role_id',v_previous_role,
      'previous_membership_status',v_previous_membership_status,
      'previous_active',v_previous_active,
      'role_id',p_role_id,
      'active',p_active,
      'membership_status',v_membership_status
    ));

  RETURN jsonb_build_object(
    'success',true,'user_id',p_user_id,'tenant_id',v_tenant_id,
    'role_id',p_role_id,'active',p_active,'membership_status',v_membership_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_user_access(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_access(uuid,text,boolean) TO authenticated,service_role;

DROP POLICY IF EXISTS tenant_memberships_admin_directory_read ON public.tenant_memberships;
CREATE POLICY tenant_memberships_admin_directory_read
  ON public.tenant_memberships
  FOR SELECT TO authenticated
  USING (
    public.has_tenant_permission(tenant_id,'admin_users.view')
    AND public.has_tenant_permission(tenant_id,'employees.view')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id=tenant_memberships.user_id
        AND e.tenant_id=tenant_memberships.tenant_id
    )
  );
