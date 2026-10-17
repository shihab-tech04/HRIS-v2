-- E02 profile requests must match the existing employees contract. The prior
-- allowlist referenced profile columns absent from public.employees.
BEGIN;

ALTER TABLE public.employee_profile_change_requests
  DROP CONSTRAINT IF EXISTS employee_profile_change_requests_field_key_check;
ALTER TABLE public.employee_profile_change_requests
  ADD CONSTRAINT employee_profile_change_requests_field_key_check CHECK (field_key IN (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation'
  ));

CREATE OR REPLACE FUNCTION public.hris_profile_change_active_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      JOIN public.tenant_memberships m
        ON m.tenant_id = t.id
       AND m.user_id = auth.uid()
       AND lower(m.status) = 'active'
      JOIN public.roles r ON r.id = m.role AND r.active IS TRUE
      WHERE t.id = p_tenant_id AND t.is_active IS TRUE
    )
$function$;
REVOKE ALL ON FUNCTION public.hris_profile_change_active_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_profile_change_active_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS employee_profile_change_read_own_or_authorized_review
  ON public.employee_profile_change_requests;
CREATE POLICY employee_profile_change_read_own_or_authorized_review
  ON public.employee_profile_change_requests
  FOR SELECT TO authenticated
  USING (
    public.hris_profile_change_active_member(tenant_id)
    AND (
      employee_id = public.hris_own_employee_for_tenant(tenant_id)
      OR public.has_tenant_permission(tenant_id, 'self_service.manage')
    )
  );

DROP FUNCTION IF EXISTS public.employee_submit_profile_change_request(text, text, text);
DROP FUNCTION IF EXISTS public.employee_get_my_profile_change_requests();
DROP FUNCTION IF EXISTS public.admin_list_profile_change_requests();
DROP FUNCTION IF EXISTS public.admin_review_profile_change_request(uuid, text, text);

CREATE OR REPLACE FUNCTION public.employee_submit_profile_change_request(
  p_tenant_id uuid,
  p_field_key text,
  p_requested_value text,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE
  v_employee uuid := public.hris_own_employee_for_tenant(p_tenant_id);
  v_value text := nullif(btrim(coalesce(p_requested_value, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current text;
  v_id uuid;
BEGIN
  IF NOT public.hris_profile_change_active_member(p_tenant_id) OR v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee membership is required.' USING errcode = '42501';
  END IF;
  IF p_field_key IS NULL OR p_field_key NOT IN (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation'
  ) THEN
    RAISE EXCEPTION 'This profile field is not available for an employee change request.' USING errcode = '22023';
  END IF;
  IF v_value IS NULL OR length(v_value) > 500 THEN
    RAISE EXCEPTION 'Enter a proposed value of 1 to 500 characters.' USING errcode = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Enter a reason of 1 to 1000 characters.' USING errcode = '22023';
  END IF;
  IF p_field_key IN ('official_email', 'personal_email')
     AND v_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING errcode = '22023';
  END IF;

  SELECT CASE p_field_key
    WHEN 'full_name' THEN e.full_name
    WHEN 'official_email' THEN e.official_email
    WHEN 'personal_email' THEN e.personal_email
    WHEN 'official_phone' THEN e.official_phone
    WHEN 'address' THEN e.address
    WHEN 'mailing_address' THEN e.mailing_address
    WHEN 'emergency_contact_name' THEN e.emergency_contact_name
    WHEN 'emergency_contact_phone' THEN e.emergency_contact_phone
    WHEN 'emergency_contact_relation' THEN e.emergency_contact_relation
  END INTO v_current
  FROM public.employees e
  WHERE e.id = v_employee AND e.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked employee record not found.' USING errcode = 'P0002';
  END IF;
  IF v_current IS NOT DISTINCT FROM v_value THEN
    RAISE EXCEPTION 'The proposed value matches the current value.' USING errcode = '22023';
  END IF;

  INSERT INTO public.employee_profile_change_requests(
    tenant_id, employee_id, requested_by, field_key, requested_value, reason
  ) VALUES (p_tenant_id, v_employee, auth.uid(), p_field_key, v_value, v_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A pending request already exists for this profile field.' USING errcode = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_get_my_profile_change_requests(p_tenant_id uuid)
RETURNS TABLE (
  id uuid, field_key text, reason text, status text,
  submitted_at timestamptz, reviewed_at timestamptz, review_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE v_employee uuid := public.hris_own_employee_for_tenant(p_tenant_id);
BEGIN
  IF NOT public.hris_profile_change_active_member(p_tenant_id) OR v_employee IS NULL THEN
    RAISE EXCEPTION 'Active employee membership is required.' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT r.id, r.field_key, r.reason, r.status, r.submitted_at, r.reviewed_at, r.review_note
    FROM public.employee_profile_change_requests r
    WHERE r.employee_id = v_employee AND r.tenant_id = p_tenant_id
    ORDER BY r.submitted_at DESC LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_profile_change_requests(p_tenant_id uuid)
RETURNS TABLE (
  id uuid, employee_id uuid, employee_number text, full_name text,
  field_key text, requested_value text, reason text, submitted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'self_service.manage') THEN
    RAISE EXCEPTION 'Active-tenant self-service management permission required.' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT r.id, r.employee_id, e.employee_number, e.full_name,
      r.field_key, r.requested_value, r.reason, r.submitted_at
    FROM public.employee_profile_change_requests r
    JOIN public.employees e ON e.id = r.employee_id AND e.tenant_id = r.tenant_id
    WHERE r.tenant_id = p_tenant_id AND r.status = 'pending'
    ORDER BY r.submitted_at ASC LIMIT 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_profile_change_request(
  p_tenant_id uuid,
  p_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $function$
DECLARE
  r public.employee_profile_change_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id, 'self_service.manage') THEN
    RAISE EXCEPTION 'Active-tenant self-service management permission required.' USING errcode = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode = '22023';
  END IF;
  IF length(coalesce(v_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer.' USING errcode = '22023';
  END IF;

  SELECT * INTO r
  FROM public.employee_profile_change_requests
  WHERE id = p_id AND tenant_id = p_tenant_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending profile change request not found.' USING errcode = 'P0002';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.employees e SET
      full_name = CASE WHEN r.field_key = 'full_name' THEN r.requested_value ELSE e.full_name END,
      official_email = CASE WHEN r.field_key = 'official_email' THEN r.requested_value ELSE e.official_email END,
      personal_email = CASE WHEN r.field_key = 'personal_email' THEN r.requested_value ELSE e.personal_email END,
      official_phone = CASE WHEN r.field_key = 'official_phone' THEN r.requested_value ELSE e.official_phone END,
      address = CASE WHEN r.field_key = 'address' THEN r.requested_value ELSE e.address END,
      mailing_address = CASE WHEN r.field_key = 'mailing_address' THEN r.requested_value ELSE e.mailing_address END,
      emergency_contact_name = CASE WHEN r.field_key = 'emergency_contact_name' THEN r.requested_value ELSE e.emergency_contact_name END,
      emergency_contact_phone = CASE WHEN r.field_key = 'emergency_contact_phone' THEN r.requested_value ELSE e.emergency_contact_phone END,
      emergency_contact_relation = CASE WHEN r.field_key = 'emergency_contact_relation' THEN r.requested_value ELSE e.emergency_contact_relation END,
      updated_at = now()
    WHERE e.id = r.employee_id AND e.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked employee record not found.' USING errcode = 'P0002';
    END IF;
  END IF;

  UPDATE public.employee_profile_change_requests
  SET status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = v_note, updated_at = now()
  WHERE id = r.id AND tenant_id = p_tenant_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile change request was already decided.' USING errcode = 'P0002';
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'self_service.profile_change.' || p_decision,
    'employee_profile_change_request', r.id::text,
    jsonb_build_object('employee_id', r.employee_id, 'field_key', r.field_key)
  );
  RETURN jsonb_build_object('success', true, 'status', p_decision);
END;
$function$;

REVOKE ALL ON FUNCTION public.employee_submit_profile_change_request(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_get_my_profile_change_requests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_profile_change_requests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_profile_change_request(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_submit_profile_change_request(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_get_my_profile_change_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profile_change_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_profile_change_request(uuid, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
