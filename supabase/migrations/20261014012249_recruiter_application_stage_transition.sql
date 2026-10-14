-- Record authorized recruitment review/screening decisions as candidate-safe
-- application history events. Closed applications cannot be reopened here.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_update_candidate_application_stage(
  p_tenant_id uuid,
  p_application_id uuid,
  p_stage text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.job_applications%ROWTYPE;
  v_stage text := lower(btrim(COALESCE(p_stage, '')));
  v_history_id uuid;
  v_created_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'A current recruiter session is required.' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE
    ) OR NOT public.has_tenant_permission(p_tenant_id, 'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode = '42501';
  END IF;
  IF v_stage NOT IN ('under_review', 'screening', 'rejected') THEN
    RAISE EXCEPTION 'Choose an available review, screening, or rejection stage.' USING errcode = '22023';
  END IF;

  SELECT a.* INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = a.tenant_id
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application was not found in this organization.' USING errcode = 'P0002';
  END IF;

  -- Make network retries safe without creating duplicate history entries.
  IF v_application.stage = v_stage THEN
    RETURN jsonb_build_object('success', true, 'changed', false, 'stage', v_stage);
  END IF;

  IF v_application.stage IN ('withdrawn', 'rejected', 'offer_extended', 'offer_accepted', 'offer_declined', 'hired') THEN
    RAISE EXCEPTION 'A closed or offered application cannot be moved to another review stage.' USING errcode = '22023';
  END IF;
  IF v_stage = 'under_review' AND v_application.stage NOT IN ('applied', 'submitted') THEN
    RAISE EXCEPTION 'This application cannot move back to review.' USING errcode = '22023';
  END IF;
  IF v_stage = 'screening' AND v_application.stage NOT IN ('applied', 'submitted', 'under_review') THEN
    RAISE EXCEPTION 'This application cannot move back to screening.' USING errcode = '22023';
  END IF;

  UPDATE public.job_applications a
  SET stage = v_stage, updated_at = now()
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id;

  INSERT INTO public.candidate_application_stage_history (
    id, application_id, stage, note, actor_type, actor_user_id, created_at
  ) VALUES (
    gen_random_uuid(), p_application_id, v_stage,
    CASE v_stage
      WHEN 'under_review' THEN 'Application moved to review.'
      WHEN 'screening' THEN 'Application moved to screening.'
      ELSE 'Application was not selected.'
    END,
    'recruiter', auth.uid(), now()
  ) RETURNING id, created_at INTO v_history_id, v_created_at;

  RETURN jsonb_build_object(
    'success', true, 'changed', true, 'stage', v_stage,
    'history_id', v_history_id, 'created_at', v_created_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.hris_update_candidate_application_stage(uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_update_candidate_application_stage(uuid,uuid,text)
  TO authenticated, service_role;

COMMIT;
