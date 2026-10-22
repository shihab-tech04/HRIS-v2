-- Fresh replacement HRIS staging project only. Do not copy historical Auth identities.
-- Attach the one already-approved, confirmed and active Super Admin to its built-in system role.
-- Fail closed if the live project contains any ambiguous ownership or conflicting role binding.
DO $guard$
DECLARE
  v_user_id uuid;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.admin_users a
  JOIN auth.users u ON u.id=a.user_id
  WHERE a.is_super_admin IS TRUE AND a.active IS TRUE
    AND u.email_confirmed_at IS NOT NULL AND a.display_name='shihabshajib01';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one confirmed designated Super Admin, got %', v_count
      USING ERRCODE='42501';
  END IF;

  IF (SELECT count(*) FROM public.admin_users WHERE is_super_admin IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'Only the designated sole Super Admin may exist' USING ERRCODE='42501';
  END IF;

  SELECT a.user_id INTO STRICT v_user_id
  FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
  WHERE a.is_super_admin IS TRUE AND a.active IS TRUE
    AND u.email_confirmed_at IS NOT NULL AND a.display_name='shihabshajib01';

  IF NOT EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id='hris_system_admin'
      AND r.active IS TRUE AND r.is_system IS TRUE
  ) THEN RAISE EXCEPTION 'Approved system role absent or inactive' USING ERRCODE='42501'; END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role_id='hris_system_admin' AND ur.user_id<>v_user_id)
     OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=v_user_id AND ur.role_id<>'hris_system_admin')
  THEN RAISE EXCEPTION 'Conflicting system-role assignment; no changes permitted' USING ERRCODE='42501'; END IF;

  INSERT INTO public.user_roles(user_id,role_id) VALUES(v_user_id,'hris_system_admin')
    ON CONFLICT (user_id) DO NOTHING;

  IF (SELECT count(*) FROM public.user_roles WHERE role_id='hris_system_admin') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_user_id AND role_id='hris_system_admin')
  THEN RAISE EXCEPTION 'Sole system-role verification failed' USING ERRCODE='42501'; END IF;
END $guard$;
