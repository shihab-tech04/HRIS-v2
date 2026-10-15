-- Final candidate-to-employee activation in Main HRIS. The candidate's Auth
-- user id remains the employee identity; the candidate never creates roles.
BEGIN;

ALTER TABLE public.onboarding_handoffs
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

-- Keep HR-assigned identifiers and the unified Auth identity unique within a
-- tenant. These indexes intentionally fail closed if legacy duplicates exist.
CREATE UNIQUE INDEX IF NOT EXISTS hris_employees_tenant_employee_number_uq
  ON public.employees (tenant_id, employee_number);
CREATE UNIQUE INDEX IF NOT EXISTS hris_employees_tenant_auth_user_uq
  ON public.employees (tenant_id, user_id) WHERE user_id IS NOT NULL;

-- Candidate submission is the verification boundary. The existing candidate
-- RPC only writes the four required sections; this trigger gives the handoff
-- the documented explicit state without widening that RPC's write surface.
CREATE OR REPLACE FUNCTION public.hris_mark_preboarding_submitted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.candidate_submitted_at IS NOT NULL
     AND OLD.candidate_submitted_at IS NULL
     AND NEW.status <> 'completed' THEN
    NEW.status := 'submitted_for_verification';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.hris_mark_preboarding_submitted() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hris_mark_preboarding_submitted ON public.onboarding_handoffs;
CREATE TRIGGER hris_mark_preboarding_submitted
  BEFORE UPDATE OF candidate_submitted_at ON public.onboarding_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.hris_mark_preboarding_submitted();

-- HR administrators can open the submitted queue from the employee workspace.
-- Recruitment managers retain the already-approved queue access.
CREATE OR REPLACE FUNCTION public.hris_get_candidate_preboarding_queue(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
      OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
      OR NOT (public.has_tenant_permission(p_tenant_id,'recruitment.manage')
        OR public.has_tenant_permission(p_tenant_id,'employees.manage')) THEN
    RAISE EXCEPTION 'Authorized recruitment or employee-management access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'handoff_id',h.id,'application_id',a.id,'candidate_name',a.full_name,
    'candidate_email',a.email,'job_title',j.title,'status',h.status,
    'candidate_personal_data',h.candidate_personal_data,
    'candidate_completed_steps',h.candidate_completed_steps,
    'candidate_submitted_at',h.candidate_submitted_at,
    'proposed_joining_date',(SELECT o.proposed_joining_date FROM public.job_offers o
      WHERE o.application_id=a.id AND o.status='accepted'
      ORDER BY o.responded_at DESC NULLS LAST,o.id LIMIT 1)
  ) ORDER BY h.candidate_submitted_at,h.id),'[]'::jsonb)
  INTO v_rows
  FROM public.onboarding_handoffs h
  JOIN public.job_applications a ON a.id=h.application_id AND a.tenant_id=p_tenant_id
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=p_tenant_id
  WHERE h.candidate_submitted_at IS NOT NULL
    AND h.employee_id IS NULL
    AND h.status IN ('submitted_for_verification','in_progress');
  RETURN v_rows;
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_activate_candidate_employee(
  p_tenant_id uuid,
  p_application_id uuid,
  p_employee_number text,
  p_joining_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_application public.job_applications%ROWTYPE;
  v_handoff public.onboarding_handoffs%ROWTYPE;
  v_candidate_user_id uuid;
  v_employee_id uuid;
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

  SELECT a.* INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=a.tenant_id
  WHERE a.id=p_application_id AND a.tenant_id=p_tenant_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate application was not found in this organization.' USING errcode='P0002';
  END IF;

  SELECT cp.user_id INTO v_candidate_user_id
  FROM public.candidate_profiles cp
  WHERE cp.user_id=v_application.candidate_user_id
    AND cp.tenant_id=p_tenant_id AND cp.profile_status='active'
  FOR UPDATE;
  IF NOT FOUND OR v_candidate_user_id IS DISTINCT FROM v_application.candidate_user_id THEN
    RAISE EXCEPTION 'The candidate identity is not active in this organization.' USING errcode='42501';
  END IF;

  SELECT h.* INTO v_handoff
  FROM public.onboarding_handoffs h
  WHERE h.application_id=p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate preboarding handoff was not found.' USING errcode='P0002';
  END IF;

  -- A lost response can safely be retried; it returns the same employee row.
  IF v_handoff.employee_id IS NOT NULL THEN
    SELECT e.id INTO v_employee_id FROM public.employees e
    WHERE e.id=v_handoff.employee_id AND e.tenant_id=p_tenant_id
      AND e.user_id=v_candidate_user_id;
    IF v_employee_id IS NULL OR v_handoff.verified_at IS NULL THEN
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
     OR cardinality(v_handoff.candidate_completed_steps)<>4
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

  INSERT INTO public.employees (
    tenant_id,user_id,employee_number,full_name,official_email,joining_date,employment_status
  ) VALUES (
    p_tenant_id,v_candidate_user_id,v_employee_number,
    v_application.full_name,v_application.email,p_joining_date,'active'
  ) RETURNING id INTO v_employee_id;

  UPDATE public.onboarding_handoffs h SET
    status='completed',employee_id=v_employee_id,verified_at=now(),verified_by=auth.uid(),updated_at=now()
  WHERE h.id=v_handoff.id;
  UPDATE public.job_applications a SET
    stage='hired',status_note='Employee activation completed.',updated_at=now()
  WHERE a.id=p_application_id AND a.tenant_id=p_tenant_id;
  INSERT INTO public.candidate_application_stage_history (
    id,application_id,stage,note,actor_type,actor_user_id,created_at
  ) VALUES (
    gen_random_uuid(),p_application_id,'hired','Employee activation completed.','recruitment',auth.uid(),now()
  );

  RETURN jsonb_build_object('success',true,'employee_id',v_employee_id,'idempotent',false);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_candidate_preboarding_queue(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_activate_candidate_employee(uuid,uuid,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_candidate_preboarding_queue(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_activate_candidate_employee(uuid,uuid,text,date) TO authenticated,service_role;

COMMIT;
