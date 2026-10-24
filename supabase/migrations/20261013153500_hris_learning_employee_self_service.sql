-- Tenant-scoped employee learning catalogue, enrollment, approval requests,
-- history, and cancellation. Validate against the disposable Auth stack first.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_can_read_learning_catalog(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
  SELECT p_tenant_id IS NOT NULL
    AND public.is_live_session()
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id=p_tenant_id AND t.is_active IS TRUE
    )
    AND (
      public.hris_own_employee_for_tenant(p_tenant_id) IS NOT NULL
      OR public.has_tenant_permission(p_tenant_id,'learning.view')
      OR public.has_tenant_permission(p_tenant_id,'learning.manage')
    )
$function$;

REVOKE ALL ON FUNCTION public.hris_can_read_learning_catalog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_can_read_learning_catalog(uuid) TO authenticated, service_role;

ALTER TABLE public.learning_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hris_learning_programs_read ON public.learning_programs;
CREATE POLICY hris_learning_programs_read ON public.learning_programs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.hris_can_read_learning_catalog(tenant_id));
DROP POLICY IF EXISTS hris_learning_programs_tenant_guard ON public.learning_programs;
CREATE POLICY hris_learning_programs_tenant_guard ON public.learning_programs
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.hris_can_read_learning_catalog(tenant_id));

DROP POLICY IF EXISTS hris_learning_sessions_read ON public.learning_sessions;
CREATE POLICY hris_learning_sessions_read ON public.learning_sessions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.hris_can_read_learning_catalog(tenant_id));
DROP POLICY IF EXISTS hris_learning_sessions_tenant_guard ON public.learning_sessions;
CREATE POLICY hris_learning_sessions_tenant_guard ON public.learning_sessions
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.hris_can_read_learning_catalog(tenant_id));

DROP POLICY IF EXISTS hris_learning_enrollments_read ON public.learning_enrollments;
CREATE POLICY hris_learning_enrollments_read ON public.learning_enrollments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    employee_id=public.hris_own_employee_for_tenant(tenant_id)
    OR public.has_tenant_permission(tenant_id,'learning.manage')
  );
DROP POLICY IF EXISTS hris_learning_enrollments_tenant_guard ON public.learning_enrollments;
CREATE POLICY hris_learning_enrollments_tenant_guard ON public.learning_enrollments
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_live_session()
    AND (
      employee_id=public.hris_own_employee_for_tenant(tenant_id)
      OR public.has_tenant_permission(tenant_id,'learning.manage')
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.learning_programs, public.learning_sessions, public.learning_enrollments
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learning_programs, public.learning_sessions, public.learning_enrollments
  TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_my_learning_context(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_programs jsonb;
  v_enrollments jsonb;
  v_skills jsonb;
BEGIN
  IF NOT public.hris_can_read_learning_catalog(p_tenant_id) THEN
    RAISE EXCEPTION 'Learning access for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);

  SELECT coalesce(jsonb_agg(program_row.value ORDER BY program_row.title),'[]'::jsonb)
    INTO v_programs
  FROM (
    SELECT p.title, jsonb_build_object(
      'id',p.id,'title',p.title,'description',p.description,'category',p.category,
      'provider',p.provider,'delivery_mode',p.delivery_mode,'duration_hours',p.duration_hours,
      'self_enrollment',p.self_enrollment,'target_skills',p.target_skills,
      'sessions',coalesce((
        SELECT jsonb_agg(session_row.value ORDER BY session_row.start_at NULLS LAST)
        FROM (
          SELECT s.start_at, jsonb_build_object(
            'id',s.id,'trainer_name',s.trainer_name,'start_at',s.start_at,'end_at',s.end_at,
            'location',s.location,'meeting_url',s.meeting_url,'capacity',s.capacity,
            'enrollment_deadline',s.enrollment_deadline,'status',s.status,
            'enrolled_count',seat_count.enrolled_count,
            'available_seats',CASE WHEN s.capacity IS NULL THEN NULL
              ELSE greatest(s.capacity-seat_count.enrolled_count,0) END
          ) AS value
          FROM public.learning_sessions s
          CROSS JOIN LATERAL (
            SELECT count(*)::integer AS enrolled_count
            FROM public.learning_enrollments e
            WHERE e.tenant_id=s.tenant_id AND e.session_id=s.id AND e.status='enrolled'
          ) seat_count
          WHERE s.tenant_id=p.tenant_id AND s.program_id=p.id AND s.status='scheduled'
        ) session_row
      ),'[]'::jsonb)
    ) AS value
    FROM public.learning_programs p
    WHERE p.tenant_id=p_tenant_id AND p.active IS TRUE
  ) program_row;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'program_id',e.program_id,'program_title',p.title,
    'session_id',e.session_id,'session_start_at',s.start_at,'session_location',s.location,
    'source',e.source,'status',e.status,'mandatory',e.mandatory,'due_date',e.due_date,
    'recommendation_reason',e.recommendation_reason,'skill_gap',e.skill_gap,
    'requested_at',e.requested_at,'resolved_at',e.resolved_at,
    'resolution_note',e.resolution_note,'completed_at',e.completed_at,
    'certificate_url',e.certificate_url,'created_at',e.created_at
  ) ORDER BY e.created_at DESC),'[]'::jsonb)
    INTO v_enrollments
  FROM public.learning_enrollments e
  JOIN public.learning_programs p ON p.id=e.program_id AND p.tenant_id=e.tenant_id
  LEFT JOIN public.learning_sessions s ON s.id=e.session_id AND s.tenant_id=e.tenant_id
  WHERE e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'skill_name',s.skill_name,'proficiency',s.proficiency,'verified',s.verified
  ) ORDER BY s.skill_name),'[]'::jsonb)
    INTO v_skills
  FROM public.employee_skills s
  JOIN public.employees e ON e.id=s.employee_id AND e.tenant_id=p_tenant_id
  WHERE s.employee_id=v_employee_id;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'programs',coalesce(v_programs,'[]'::jsonb),
    'enrollments',coalesce(v_enrollments,'[]'::jsonb),
    'skills',coalesce(v_skills,'[]'::jsonb)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_employee_enroll_learning(
  p_tenant_id uuid,p_program_id uuid,p_session_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_program public.learning_programs%ROWTYPE;
  v_session public.learning_sessions%ROWTYPE;
  v_enrolled_count integer;
  v_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active sign-in is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  SELECT p.* INTO v_program FROM public.learning_programs p
  JOIN public.tenants t ON t.id=p.tenant_id AND t.is_active IS TRUE
  WHERE p.id=p_program_id AND p.tenant_id=p_tenant_id AND p.active IS TRUE;
  IF NOT FOUND OR v_program.self_enrollment IS NOT TRUE THEN
    RAISE EXCEPTION 'This learning program does not allow direct enrollment.' USING errcode='42501';
  END IF;
  IF p_session_id IS NOT NULL THEN
    SELECT s.* INTO v_session FROM public.learning_sessions s
    WHERE s.id=p_session_id AND s.tenant_id=p_tenant_id
      AND s.program_id=p_program_id AND s.status='scheduled'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Choose a scheduled session for this program.' USING errcode='22023';
    END IF;
    SELECT count(*)::integer INTO v_enrolled_count FROM public.learning_enrollments e
    WHERE e.tenant_id=p_tenant_id AND e.session_id=p_session_id AND e.status='enrolled';
    IF v_session.capacity IS NOT NULL AND v_enrolled_count >= v_session.capacity THEN
      RAISE EXCEPTION 'This learning session is full.' USING errcode='22023';
    END IF;
  END IF;
  INSERT INTO public.learning_enrollments(
    tenant_id,employee_id,program_id,session_id,source,status,mandatory,created_by
  ) VALUES (
    p_tenant_id,v_employee_id,p_program_id,p_session_id,'self_enrollment','enrolled',false,auth.uid()
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'status','enrolled');
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_employee_request_learning(
  p_tenant_id uuid,p_program_id uuid,p_session_id uuid DEFAULT NULL,p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_program public.learning_programs%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active sign-in is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  SELECT p.* INTO v_program FROM public.learning_programs p
  JOIN public.tenants t ON t.id=p.tenant_id AND t.is_active IS TRUE
  WHERE p.id=p_program_id AND p.tenant_id=p_tenant_id AND p.active IS TRUE;
  IF NOT FOUND OR v_program.self_enrollment IS NOT FALSE THEN
    RAISE EXCEPTION 'This learning program is not available for an approval request.' USING errcode='42501';
  END IF;
  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.learning_sessions s
    WHERE s.id=p_session_id AND s.tenant_id=p_tenant_id
      AND s.program_id=p_program_id AND s.status='scheduled'
  ) THEN
    RAISE EXCEPTION 'Choose a scheduled session for this program.' USING errcode='22023';
  END IF;
  INSERT INTO public.learning_enrollments(
    tenant_id,employee_id,program_id,session_id,source,status,mandatory,
    recommendation_reason,requested_at,created_by
  ) VALUES (
    p_tenant_id,v_employee_id,p_program_id,p_session_id,'employee_request','requested',false,
    nullif(left(btrim(coalesce(p_reason,'')),1000),''),now(),auth.uid()
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'status','requested');
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_employee_cancel_learning(p_tenant_id uuid,p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active sign-in is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  UPDATE public.learning_enrollments e
  SET status='cancelled',resolved_at=now(),updated_at=now()
  WHERE e.id=p_id AND e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id
    AND e.mandatory IS FALSE AND e.status IN ('requested','enrolled')
  RETURNING e.id INTO v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This learning enrollment cannot be cancelled.' USING errcode='42501';
  END IF;
  RETURN jsonb_build_object('id',v_id,'status','cancelled');
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_learning_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_employee_enroll_learning(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_employee_request_learning(uuid,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_employee_cancel_learning(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_learning_context(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_employee_enroll_learning(uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_employee_request_learning(uuid,uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_employee_cancel_learning(uuid,uuid) TO authenticated, service_role;

COMMIT;
