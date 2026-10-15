-- Recruiters issue candidate offers using the employer-entered terms. The
-- candidate portal reads the offer through its existing owner-scoped context.
BEGIN;

-- Writes to offer rows go through the tenant-scoped RPC below.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.job_offers FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hris_issue_candidate_offer(
  p_tenant_id uuid,
  p_application_id uuid,
  p_salary_amount numeric,
  p_salary_currency text,
  p_pay_period text,
  p_proposed_joining_date date,
  p_response_deadline date,
  p_terms text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.job_applications%ROWTYPE;
  v_job_title text;
  v_salary_currency text := upper(btrim(COALESCE(p_salary_currency, '')));
  v_terms text := NULLIF(btrim(COALESCE(p_terms, '')), '');
  v_offer_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session() THEN
    RAISE EXCEPTION 'A current recruiter session is required.' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE
    ) OR NOT public.has_tenant_permission(p_tenant_id, 'recruitment.manage') THEN
    RAISE EXCEPTION 'Recruitment management access for this organization is required.' USING errcode = '42501';
  END IF;
  IF p_salary_amount IS NULL OR p_salary_amount <= 0 THEN
    RAISE EXCEPTION 'Enter the authorized offer amount.' USING errcode = '22023';
  END IF;
  IF v_salary_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Enter a three-letter offer currency code.' USING errcode = '22023';
  END IF;
  IF p_pay_period IS NULL OR p_pay_period NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Choose a supported pay period.' USING errcode = '22023';
  END IF;
  IF p_proposed_joining_date IS NULL THEN
    RAISE EXCEPTION 'Enter the proposed joining date.' USING errcode = '22023';
  END IF;
  IF p_response_deadline IS NULL OR p_response_deadline < CURRENT_DATE THEN
    RAISE EXCEPTION 'Enter a response deadline that has not passed.' USING errcode = '22023';
  END IF;
  IF v_terms IS NULL OR length(v_terms) > 10000 THEN
    RAISE EXCEPTION 'Enter the offer terms (up to 10,000 characters).' USING errcode = '22023';
  END IF;

  -- Lock the tenant-matched application so concurrent clicks cannot issue two
  -- open offers for the same candidate.
  SELECT a.*
  INTO v_application
  FROM public.job_applications a
  JOIN public.jobs j ON j.id = a.job_id AND j.tenant_id = a.tenant_id
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application was not found in this organization.' USING errcode = 'P0002';
  END IF;
  SELECT j.title INTO v_job_title
  FROM public.jobs j
  WHERE j.id = v_application.job_id AND j.tenant_id = p_tenant_id;
  IF v_application.stage IN ('withdrawn', 'rejected', 'offer_accepted', 'hired') THEN
    RAISE EXCEPTION 'An offer cannot be issued for a closed application.' USING errcode = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.job_offers o
    WHERE o.application_id = p_application_id AND o.status = 'issued'
  ) THEN
    RAISE EXCEPTION 'An open offer already exists for this application.' USING errcode = '23505';
  END IF;

  INSERT INTO public.job_offers (
    id, application_id, offered_title, salary_amount, salary_currency,
    proposed_joining_date, terms, status, issued_by, issued_at,
    response_deadline, pay_period
  ) VALUES (
    gen_random_uuid(), p_application_id, v_job_title, p_salary_amount,
    v_salary_currency, p_proposed_joining_date, v_terms, 'issued', auth.uid(),
    now(), p_response_deadline, p_pay_period
  ) RETURNING id INTO v_offer_id;

  UPDATE public.job_applications a
  SET stage = 'offer_extended', status_note = 'Offer issued to candidate.', updated_at = now()
  WHERE a.id = p_application_id AND a.tenant_id = p_tenant_id;

  INSERT INTO public.candidate_application_stage_history (
    id, application_id, stage, note, actor_type, actor_user_id
  ) VALUES (
    gen_random_uuid(), p_application_id, 'offer_extended',
    'An employment offer was issued.', 'recruitment', auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id, 'stage', 'offer_extended');
END
$function$;

REVOKE ALL ON FUNCTION public.hris_issue_candidate_offer(uuid,uuid,numeric,text,text,date,date,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_issue_candidate_offer(uuid,uuid,numeric,text,text,date,date,text)
  TO authenticated, service_role;

COMMIT;
