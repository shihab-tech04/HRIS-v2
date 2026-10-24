-- Persist an authenticated candidate's withdrawal as a candidate-owned
-- application transition and history event. The active profile determines
-- tenant scope; callers cannot withdraw another candidate's application.
BEGIN;

CREATE OR REPLACE FUNCTION public.candidate_withdraw_application(
  p_application_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_application public.job_applications%ROWTYPE;
  v_reason text := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_history_id uuid;
  v_created_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active candidate session is required.' USING errcode = '42501';
  END IF;

  SELECT cp.tenant_id INTO v_tenant_id
  FROM public.candidate_profiles cp
  WHERE cp.user_id = auth.uid() AND cp.profile_status = 'active'
  FOR SHARE;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'An active candidate session is required.' USING errcode = '42501';
  END IF;

  IF v_reason NOT IN (
    'Accepted another job offer',
    'Location / Commute constraints',
    'Compensation expectations mismatch',
    'Personal / Family circumstances',
    'Other'
  ) THEN
    RAISE EXCEPTION 'Choose a valid reason for withdrawal.' USING errcode = '22023';
  END IF;

  SELECT a.* INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = a.tenant_id
  WHERE a.id = p_application_id
    AND a.tenant_id = v_tenant_id
    AND a.candidate_user_id = auth.uid()
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application is not available for this candidate.' USING errcode = 'P0002';
  END IF;

  -- A retry after a lost response is safe and does not rewrite the original
  -- reason or append a duplicate event.
  IF v_application.stage = 'withdrawn' THEN
    RETURN pg_catalog.jsonb_build_object('success', true, 'changed', false, 'stage', 'withdrawn');
  END IF;

  -- Preserve the current application UI contract: rejection is terminal,
  -- while offer-stage applications still expose the candidate withdrawal action.
  IF v_application.stage = 'rejected' THEN
    RAISE EXCEPTION 'A rejected application cannot be withdrawn.' USING errcode = '22023';
  END IF;

  UPDATE public.job_applications a
  SET stage = 'withdrawn', status_note = v_reason, updated_at = pg_catalog.now()
  WHERE a.id = p_application_id
    AND a.tenant_id = v_tenant_id
    AND a.candidate_user_id = auth.uid();

  INSERT INTO public.candidate_application_stage_history (
    id, application_id, stage, note, actor_type, actor_user_id, created_at
  ) VALUES (
    pg_catalog.gen_random_uuid(), p_application_id, 'withdrawn', v_reason,
    'candidate', auth.uid(), pg_catalog.now()
  ) RETURNING id, created_at INTO v_history_id, v_created_at;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'changed', true,
    'stage', 'withdrawn',
    'history_id', v_history_id,
    'created_at', v_created_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.candidate_withdraw_application(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_withdraw_application(uuid, text)
  TO authenticated;

COMMIT;
