-- Forward fix for candidate activation on schemas where employees.id has no default.
-- The previous policy migration is retained unchanged; this replaces its RPC and
-- explicitly generates the employee primary key inside the transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_activate_candidate_employee(
  p_tenant_id uuid,
  p_application_id uuid,
  p_employee_number text,
  p_joining_date date,
  p_details_verified boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.job_applications%ROWTYPE;
  v_handoff public.onboarding_handoffs%ROWTYPE;
  v_candidate_user_id uuid;
  v_candidate_active boolean := false;
  v_employee_id uuid;
  v_employee_role_count integer := 0;
  v_employee_role_id text;
  v_existing_role text;
  v_existing_membership_status text;
  v_tenant_timezone text;
  v_tenant_today date;
  v_employee_number text := btrim(COALESCE(p_employee_number,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'A current HRIS session is required.' USING errcode='42501';
  END IF;
  IF p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'employees.manage') THEN
    RAISE EXCEPTION 'Employee-management access for this organization is required.' USING errcode='42501';
  END IF;
  IF v_employee_number = '' OR char_length(v_employee_number)>32 THEN
    RAISE EXCEPTION 'Enter an employee number of up to 32 characters.' USING errcode='22023';
  END IF;
  IF p_joining_date IS NULL THEN
    RAISE EXCEPTION 'Confirm the employee joining date.' USING errcode='22023';
  END IF;
  IF p_details_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirm that the submitted details were verified before activation.' USING errcode='22023';
  END IF;

  SELECT t.timezone, (now() AT TIME ZONE t.timezone)::date
    INTO v_tenant_timezone, v_tenant_today
  FROM public.tenants t
  WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT FOUND OR v_tenant_timezone IS NULL OR v_tenant_timezone = '' THEN
    RAISE EXCEPTION 'The organization time zone is not configured.' USING errcode='55000';
  END IF;
  IF p_joining_date > v_tenant_today THEN
    RAISE EXCEPTION 'The confirmed joining date has not arrived; activation is available on or after that date.' USING errcode='55000';
  END IF;

  SELECT a.* INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=a.tenant_id
  WHERE a.id=p_application_id AND a.tenant_id=p_tenant_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate application was not found in this organization.' USING errcode='P0002';
  END IF;

  v_candidate_user_id := v_application.candidate_user_id;
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.candidate_profiles cp ON cp.user_id=u.id
    WHERE u.id=v_candidate_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND u.last_sign_in_at IS NOT NULL
      AND cp.tenant_id=p_tenant_id
      AND cp.profile_status='active'
  ) INTO v_candidate_active;
  IF NOT v_candidate_active OR v_candidate_user_id IS NULL THEN
    RAISE EXCEPTION 'The candidate Auth identity is not active in this organization.' USING errcode='42501';
  END IF;

  SELECT h.* INTO v_handoff
  FROM public.onboarding_handoffs h
  WHERE h.application_id=p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate preboarding handoff was not found.' USING errcode='P0002';
  END IF;

  -- A committed response may be lost in transit. Return the same activation
  -- on retry, but only when the original employee and membership still agree.
  IF v_handoff.employee_id IS NOT NULL THEN
    SELECT e.id INTO v_employee_id
    FROM public.employees e
    JOIN public.tenant_memberships m
      ON m.tenant_id=e.tenant_id AND m.user_id=e.user_id AND m.status='active'
    JOIN public.roles r ON r.id=m.role AND r.active IS TRUE AND lower(btrim(r.name))='employee'
    WHERE e.id=v_handoff.employee_id AND e.tenant_id=p_tenant_id
      AND e.user_id=v_candidate_user_id
      AND e.employee_number=v_employee_number
      AND e.joining_date=p_joining_date;
    IF v_employee_id IS NULL OR v_handoff.verified_at IS NULL
       OR v_handoff.verified_by IS NULL OR v_handoff.status <> 'completed'
       OR v_application.stage <> 'hired' THEN
      RAISE EXCEPTION 'The completed handoff does not match its employee record.' USING errcode='23514';
    END IF;
    RETURN jsonb_build_object('success',true,'employee_id',v_employee_id,'idempotent',true);
  END IF;

  IF v_application.stage <> 'offer_accepted'
     OR NOT EXISTS (SELECT 1 FROM public.job_offers o
       WHERE o.application_id=p_application_id AND o.status='accepted') THEN
    RAISE EXCEPTION 'An accepted offer is required before employee activation.' USING errcode='42501';
  END IF;
  IF v_handoff.candidate_submitted_at IS NULL
     OR COALESCE(cardinality(v_handoff.candidate_completed_steps),0)<>4
     OR NOT COALESCE(v_handoff.candidate_completed_steps @> ARRAY[
       'step_identity','step_emergency','step_payroll','step_policies'
     ]::text[],false)
     OR v_handoff.status NOT IN ('submitted_for_verification','in_progress') THEN
    RAISE EXCEPTION 'The completed four-section preboarding packet must be submitted before activation.' USING errcode='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees e
      WHERE e.tenant_id=p_tenant_id AND e.user_id=v_candidate_user_id) THEN
    RAISE EXCEPTION 'This Auth identity is already linked to an employee in this organization.' USING errcode='23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees e
      WHERE e.tenant_id=p_tenant_id AND e.employee_number=v_employee_number) THEN
    RAISE EXCEPTION 'That employee number is already assigned in this organization.' USING errcode='23505';
  END IF;

  SELECT count(*)::integer, min(r.id)
    INTO v_employee_role_count, v_employee_role_id
  FROM public.roles r
  WHERE r.active IS TRUE AND lower(btrim(r.name))='employee';
  IF v_employee_role_count <> 1 OR v_employee_role_id IS NULL THEN
    RAISE EXCEPTION 'The active Employee role is not configured for this organization.' USING errcode='55000';
  END IF;
  SELECT r.id INTO v_employee_role_id
  FROM public.roles r
  WHERE r.id=v_employee_role_id AND r.active IS TRUE
    AND lower(btrim(r.name))='employee'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The active Employee role changed during activation.' USING errcode='55000';
  END IF;

  SELECT m.role, m.status INTO v_existing_role, v_existing_membership_status
  FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=v_candidate_user_id
  FOR UPDATE;
  IF FOUND AND (v_existing_role <> v_employee_role_id OR v_existing_membership_status <> 'active') THEN
    RAISE EXCEPTION 'The candidate already has a different organization membership; it was not changed.' USING errcode='23514';
  END IF;

  INSERT INTO public.employees (
    id,tenant_id,user_id,employee_number,full_name,official_email,joining_date,employment_status
  ) VALUES (
    gen_random_uuid(),p_tenant_id,v_candidate_user_id,v_employee_number,
    v_application.full_name,v_application.email,p_joining_date,'active'
  ) RETURNING id INTO v_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee record creation did not complete.' USING errcode='23514';
  END IF;

  IF v_existing_role IS NULL THEN
    INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
    VALUES (p_tenant_id,v_candidate_user_id,v_employee_role_id,'active')
    ON CONFLICT (tenant_id,user_id) DO NOTHING;
    SELECT m.role, m.status INTO v_existing_role, v_existing_membership_status
    FROM public.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.user_id=v_candidate_user_id
    FOR UPDATE;
    IF v_existing_role <> v_employee_role_id OR v_existing_membership_status <> 'active' THEN
      RAISE EXCEPTION 'The candidate organization membership changed during activation.' USING errcode='23514';
    END IF;
  END IF;

  UPDATE public.onboarding_handoffs h SET
    status='completed',employee_id=v_employee_id,verified_at=now(),verified_by=auth.uid(),updated_at=now()
  WHERE h.id=v_handoff.id;
  UPDATE public.job_applications a SET
    stage='hired',status_note='Employee activation completed.',updated_at=now()
  WHERE a.id=p_application_id AND a.tenant_id=p_tenant_id AND a.stage='offer_accepted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate application changed during activation.' USING errcode='40001';
  END IF;
  INSERT INTO public.candidate_application_stage_history (
    id,application_id,stage,note,actor_type,actor_user_id,created_at
  ) VALUES (
    gen_random_uuid(),p_application_id,'hired','Employee activation completed.','recruitment',auth.uid(),now()
  );
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (
    auth.uid(),'candidate.employee.activated','employee',v_employee_id::text,
    jsonb_build_object(
      'tenant_id',p_tenant_id,
      'application_id',p_application_id,
      'candidate_user_id',v_candidate_user_id,
      'employee_number',v_employee_number,
      'joining_date',p_joining_date
    )
  );

  RETURN jsonb_build_object('success',true,'employee_id',v_employee_id,'idempotent',false);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_activate_candidate_employee(uuid,uuid,text,date,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_activate_candidate_employee(uuid,uuid,text,date,boolean)
  TO authenticated,service_role;
COMMENT ON FUNCTION public.hris_activate_candidate_employee(uuid,uuid,text,date,boolean) IS
  'Tenant-authorized, HR-verified candidate activation using the existing Auth identity and active Employee role mapping.';


COMMIT;
