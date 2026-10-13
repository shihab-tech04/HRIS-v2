-- Candidate profile RPCs must follow the authenticated user's unique active
-- profile tenant, just like candidate_get_recruitment_context(). Keep their
-- existing ACLs and editable-field contract.
CREATE OR REPLACE FUNCTION public.get_my_candidate_profile()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
  SELECT to_jsonb(cp)
  FROM public.candidate_profiles cp
  WHERE cp.user_id=(SELECT auth.uid())
    AND cp.profile_status='active';
$function$;

CREATE OR REPLACE FUNCTION public.candidate_update_profile(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_tenant uuid;
  v_updated integer;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active candidate session required.' USING errcode='42501';
  END IF;

  SELECT cp.tenant_id
  INTO v_tenant
  FROM public.candidate_profiles cp
  WHERE cp.user_id=auth.uid()
    AND cp.profile_status='active'
  FOR UPDATE;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Active candidate session required.' USING errcode='42501';
  END IF;

  UPDATE public.candidate_profiles
  SET
    full_name=nullif(btrim(coalesce(p_payload->>'full_name','')),''),
    phone=nullif(btrim(coalesce(p_payload->>'phone','')),''),
    current_location=nullif(btrim(coalesce(p_payload->>'current_location','')),''),
    years_experience=nullif(p_payload->>'years_experience','')::numeric,
    headline=nullif(btrim(coalesce(p_payload->>'headline','')),''),
    bio=nullif(btrim(coalesce(p_payload->>'bio','')),''),
    skills=coalesce(array(SELECT jsonb_array_elements_text(coalesce(p_payload->'skills','[]'::jsonb))),skills),
    profile_data=coalesce(p_payload->'profile_data',profile_data),
    onboarding_completed=coalesce((p_payload->>'onboarding_completed')::boolean,onboarding_completed)
  WHERE user_id=auth.uid()
    AND tenant_id=v_tenant
    AND profile_status='active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Active candidate session required.' USING errcode='42501';
  END IF;

  RETURN (
    SELECT to_jsonb(cp)
    FROM public.candidate_profiles cp
    WHERE cp.user_id=auth.uid()
      AND cp.tenant_id=v_tenant
      AND cp.profile_status='active'
  );
END;
$function$;
