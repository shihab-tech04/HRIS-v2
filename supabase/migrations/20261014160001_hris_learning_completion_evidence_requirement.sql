-- Phase 12: let authorized learning managers set a program-level evidence
-- requirement and enforce it whenever an employee submits for verification.
BEGIN;

ALTER TABLE public.learning_programs
  ADD COLUMN IF NOT EXISTS completion_evidence_required boolean NOT NULL DEFAULT false;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.hris_enforce_learning_completion_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_required boolean;
BEGIN
  IF NEW.status='pending_verification' AND OLD.status IN ('enrolled','returned_for_correction') THEN
    SELECT p.completion_evidence_required INTO v_required
    FROM public.learning_programs p
    WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.program_id;
    IF coalesce(v_required,false) AND NEW.completion_evidence_path IS NULL THEN
      RAISE EXCEPTION 'Supporting evidence is required for this learning program.' USING errcode='22023';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.hris_enforce_learning_completion_evidence() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS learning_completion_requires_program_evidence ON public.learning_enrollments;
CREATE TRIGGER learning_completion_requires_program_evidence
  BEFORE UPDATE OF status ON public.learning_enrollments
  FOR EACH ROW EXECUTE FUNCTION private.hris_enforce_learning_completion_evidence();

CREATE OR REPLACE FUNCTION public.hris_get_learning_admin_catalog(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_programs jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT coalesce(jsonb_agg(program_row.value ORDER BY program_row.title,program_row.id),'[]'::jsonb)
    INTO v_programs
  FROM (
    SELECT p.id,p.title,jsonb_build_object(
      'id',p.id,'title',p.title,'description',p.description,'category',p.category,
      'provider',p.provider,'delivery_mode',p.delivery_mode,'duration_hours',p.duration_hours,
      'self_enrollment',p.self_enrollment,'target_skills',p.target_skills,'active',p.active,
      'completion_evidence_required',p.completion_evidence_required,
      'enrollment_count',(SELECT count(*)::integer FROM public.learning_enrollments e
        WHERE e.tenant_id=p.tenant_id AND e.program_id=p.id AND e.status IN ('requested','enrolled')),
      'sessions',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',s.id,'trainer_name',s.trainer_name,'start_at',s.start_at,'end_at',s.end_at,
        'location',s.location,'meeting_url',s.meeting_url,'capacity',s.capacity,
        'enrollment_deadline',s.enrollment_deadline,'status',s.status,
        'enrolled_count',(SELECT count(*)::integer FROM public.learning_enrollments e
          WHERE e.tenant_id=s.tenant_id AND e.session_id=s.id AND e.status='enrolled')
      ) ORDER BY s.start_at NULLS LAST,s.created_at,s.id) FROM public.learning_sessions s
        WHERE s.tenant_id=p.tenant_id AND s.program_id=p.id),'[]'::jsonb)
    ) AS value
    FROM public.learning_programs p WHERE p.tenant_id=p_tenant_id
  ) program_row;
  RETURN coalesce(v_programs,'[]'::jsonb);
END
$function$;

-- Keep the established save contract for existing consumers. This overload
-- adds one manager-controlled field and delegates the original validation and
-- write path to the existing permission-checked RPC in the same transaction.
CREATE OR REPLACE FUNCTION public.hris_save_learning_program(
  p_tenant_id uuid,p_program_id uuid,p_title text,p_description text,p_category text,
  p_provider text,p_delivery_mode text,p_duration_hours numeric,p_self_enrollment boolean,
  p_target_skills text[],p_active boolean,p_completion_evidence_required boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_saved jsonb;
  v_program_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_completion_evidence_required IS NULL THEN
    RAISE EXCEPTION 'Choose whether completion evidence is required.' USING errcode='22023';
  END IF;
  v_saved := public.hris_save_learning_program(
    p_tenant_id,p_program_id,p_title,p_description,p_category,p_provider,p_delivery_mode,
    p_duration_hours,p_self_enrollment,p_target_skills,p_active
  );
  v_program_id := (v_saved->>'id')::uuid;
  UPDATE public.learning_programs p
  SET completion_evidence_required=p_completion_evidence_required,updated_at=now()
  WHERE p.tenant_id=p_tenant_id AND p.id=v_program_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Learning program not found in this organization.' USING errcode='P0002';
  END IF;
  RETURN v_saved || jsonb_build_object('completion_evidence_required',p_completion_evidence_required);
END
$function$;
COMMENT ON FUNCTION public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean)
  IS 'Tenant learning.manage-only program save with optional completion evidence requirement; preserves the existing save contract.';

CREATE OR REPLACE FUNCTION public.hris_get_my_learning_context(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
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
    SELECT p.title,jsonb_build_object(
      'id',p.id,'title',p.title,'description',p.description,'category',p.category,
      'provider',p.provider,'delivery_mode',p.delivery_mode,'duration_hours',p.duration_hours,
      'self_enrollment',p.self_enrollment,'target_skills',p.target_skills,
      'completion_evidence_required',p.completion_evidence_required,
      'sessions',coalesce((
        SELECT jsonb_agg(session_row.value ORDER BY session_row.start_at NULLS LAST)
        FROM (
          SELECT s.start_at,jsonb_build_object(
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
    'id',s.id,'skill_name',s.skill_name,'proficiency',s.proficiency,'verified',s.verified
  ) ORDER BY s.skill_name,s.id),'[]'::jsonb)
    INTO v_skills
  FROM public.employee_skills s
  JOIN public.employees e ON e.id=s.employee_id AND e.tenant_id=p_tenant_id
  WHERE s.employee_id=v_employee_id;

  RETURN jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'programs',coalesce(v_programs,'[]'::jsonb),'enrollments',coalesce(v_enrollments,'[]'::jsonb),
    'skills',coalesce(v_skills,'[]'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_my_learning_completion_data(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_enrollments jsonb;
  v_notifications jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'status',e.status,'completion_evidence_required',p.completion_evidence_required,
    'completion_submitted_at',e.completion_submitted_at,
    'completion_evidence_name',e.completion_evidence_name,
    'completion_verified_at',e.completion_verified_at,
    'completion_verified_by',e.completion_verified_by,
    'completion_verified_by_name',reviewer.full_name,
    'completion_return_reason',e.completion_return_reason,
    'completion_history',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'event_type',ce.event_type,'reason',ce.reason,'evidence_name',ce.evidence_name,
        'created_at',ce.created_at
      ) ORDER BY ce.created_at,ce.id)
      FROM public.learning_completion_events ce
      WHERE ce.tenant_id=e.tenant_id AND ce.enrollment_id=e.id
    ),'[]'::jsonb)
  ) ORDER BY e.created_at DESC,e.id),'[]'::jsonb)
    INTO v_enrollments
  FROM public.learning_enrollments e
  JOIN public.learning_programs p ON p.tenant_id=e.tenant_id AND p.id=e.program_id
  LEFT JOIN public.employees reviewer
    ON reviewer.tenant_id=e.tenant_id AND reviewer.user_id=e.completion_verified_by
  WHERE e.tenant_id=p_tenant_id AND e.employee_id=v_employee_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'kind',n.kind,'enrollment_id',n.enrollment_id,
    'program_title',p.title,'created_at',n.created_at
  ) ORDER BY n.created_at DESC,n.id DESC),'[]'::jsonb)
    INTO v_notifications
  FROM public.learning_completion_notifications n
  JOIN public.learning_enrollments e ON e.tenant_id=n.tenant_id AND e.id=n.enrollment_id
  JOIN public.learning_programs p ON p.tenant_id=e.tenant_id AND p.id=e.program_id
  WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id;

  RETURN jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'enrollments',coalesce(v_enrollments,'[]'::jsonb),
    'notifications',coalesce(v_notifications,'[]'::jsonb));
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_learning_admin_catalog(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_learning_admin_catalog(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean,boolean) TO authenticated,service_role;

COMMIT;
