-- Phase 12 manager-maintained learning programs and scheduled sessions.
-- Writes stay behind active tenant learning.manage RPCs; employee enrollment
-- and the existing catalogue continue to use their existing contracts.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_learning_admin_catalog(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_programs jsonb;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(program_row.value ORDER BY program_row.title,program_row.id),'[]'::jsonb)
    INTO v_programs
  FROM (
    SELECT p.id,p.title,jsonb_build_object(
      'id',p.id,'title',p.title,'description',p.description,'category',p.category,
      'provider',p.provider,'delivery_mode',p.delivery_mode,'duration_hours',p.duration_hours,
      'self_enrollment',p.self_enrollment,'target_skills',p.target_skills,'active',p.active,
      'enrollment_count',(SELECT count(*)::integer FROM public.learning_enrollments e
        WHERE e.tenant_id=p.tenant_id AND e.program_id=p.id AND e.status IN ('requested','enrolled')),
      'sessions',COALESCE((SELECT jsonb_agg(jsonb_build_object(
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
  RETURN COALESCE(v_programs,'[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.hris_save_learning_program(
  p_tenant_id uuid,p_program_id uuid,p_title text,p_description text,p_category text,
  p_provider text,p_delivery_mode text,p_duration_hours numeric,p_self_enrollment boolean,
  p_target_skills text[],p_active boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_program public.learning_programs%ROWTYPE; v_skills text[];
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
      OR length(COALESCE(p_description,''))>4000
      OR COALESCE(length(btrim(p_category)),0)>120 OR COALESCE(length(btrim(p_provider)),0)>160
      OR p_delivery_mode IS NULL OR p_delivery_mode NOT IN ('online','in_person','hybrid')
      OR (p_duration_hours IS NOT NULL AND (p_duration_hours<=0 OR p_duration_hours>10000))
      OR p_self_enrollment IS NULL OR p_active IS NULL OR p_target_skills IS NULL
      OR cardinality(p_target_skills)>20
      OR EXISTS (SELECT 1 FROM unnest(p_target_skills) skill
        WHERE skill IS NULL OR length(btrim(skill)) NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'Check the program title, delivery mode, duration and skill entries.' USING errcode='22023';
  END IF;
  SELECT COALESCE(array_agg(skill ORDER BY first_seen),'{}'::text[]) INTO v_skills
  FROM (SELECT btrim(value) AS skill,min(ordinality) AS first_seen
    FROM unnest(p_target_skills) WITH ORDINALITY AS skills(value,ordinality)
    GROUP BY btrim(value)) normalized;

  IF p_program_id IS NULL THEN
    INSERT INTO public.learning_programs(
      tenant_id,title,description,category,provider,delivery_mode,duration_hours,
      self_enrollment,target_skills,active,created_by
    ) VALUES (
      p_tenant_id,btrim(p_title),NULLIF(btrim(COALESCE(p_description,'')),''),
      NULLIF(btrim(COALESCE(p_category,'')),''),NULLIF(btrim(COALESCE(p_provider,'')),''),
      p_delivery_mode,p_duration_hours,p_self_enrollment,v_skills,p_active,auth.uid()
    ) RETURNING * INTO v_program;
  ELSE
    UPDATE public.learning_programs p SET
      title=btrim(p_title),description=NULLIF(btrim(COALESCE(p_description,'')),''),
      category=NULLIF(btrim(COALESCE(p_category,'')),''),provider=NULLIF(btrim(COALESCE(p_provider,'')),''),
      delivery_mode=p_delivery_mode,duration_hours=p_duration_hours,self_enrollment=p_self_enrollment,
      target_skills=v_skills,active=p_active,updated_at=now()
    WHERE p.tenant_id=p_tenant_id AND p.id=p_program_id
    RETURNING p.* INTO v_program;
    IF NOT FOUND THEN RAISE EXCEPTION 'Learning program not found in this organization.' USING errcode='P0002'; END IF;
  END IF;
  RETURN jsonb_build_object(
    'id',v_program.id,'tenant_id',v_program.tenant_id,'title',v_program.title,
    'active',v_program.active,'self_enrollment',v_program.self_enrollment
  );
END $function$;

CREATE OR REPLACE FUNCTION public.hris_save_learning_session(
  p_tenant_id uuid,p_program_id uuid,p_session_id uuid,p_trainer_name text,
  p_start_at timestamptz,p_end_at timestamptz,p_location text,p_meeting_url text,
  p_capacity integer,p_enrollment_deadline timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_session public.learning_sessions%ROWTYPE; v_enrolled_count integer;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'learning.manage') THEN
    RAISE EXCEPTION 'Learning management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_program_id IS NULL OR length(COALESCE(p_trainer_name,''))>200
      OR length(COALESCE(p_location,''))>300 OR length(COALESCE(p_meeting_url,''))>1000
      OR (NULLIF(btrim(COALESCE(p_meeting_url,'')),'') IS NOT NULL
        AND btrim(p_meeting_url)!~* '^https?://')
      OR (p_capacity IS NOT NULL AND p_capacity<1)
      OR (p_start_at IS NOT NULL AND p_end_at IS NOT NULL AND p_end_at<=p_start_at) THEN
    RAISE EXCEPTION 'Check the session details, time range, capacity and meeting link.' USING errcode='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_programs p
      WHERE p.tenant_id=p_tenant_id AND p.id=p_program_id AND p.active IS TRUE) THEN
    RAISE EXCEPTION 'Choose an active learning program before scheduling a session.' USING errcode='22023';
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.learning_sessions(
      tenant_id,program_id,trainer_name,start_at,end_at,location,meeting_url,
      capacity,enrollment_deadline,status,created_by
    ) VALUES (
      p_tenant_id,p_program_id,NULLIF(btrim(COALESCE(p_trainer_name,'')),''),p_start_at,p_end_at,
      NULLIF(btrim(COALESCE(p_location,'')),''),NULLIF(btrim(COALESCE(p_meeting_url,'')),''),
      p_capacity,p_enrollment_deadline,'scheduled',auth.uid()
    ) RETURNING * INTO v_session;
  ELSE
    SELECT s.* INTO v_session FROM public.learning_sessions s
    WHERE s.tenant_id=p_tenant_id AND s.program_id=p_program_id
      AND s.id=p_session_id AND s.status='scheduled' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Scheduled session not found in this organization.' USING errcode='P0002'; END IF;
    SELECT count(*)::integer INTO v_enrolled_count FROM public.learning_enrollments e
    WHERE e.tenant_id=p_tenant_id AND e.session_id=p_session_id AND e.status='enrolled';
    IF p_capacity IS NOT NULL AND p_capacity<v_enrolled_count THEN
      RAISE EXCEPTION 'Capacity cannot be lower than the current enrolled count.' USING errcode='22023';
    END IF;
    UPDATE public.learning_sessions s SET
      trainer_name=NULLIF(btrim(COALESCE(p_trainer_name,'')),''),start_at=p_start_at,end_at=p_end_at,
      location=NULLIF(btrim(COALESCE(p_location,'')),''),meeting_url=NULLIF(btrim(COALESCE(p_meeting_url,'')),''),
      capacity=p_capacity,enrollment_deadline=p_enrollment_deadline,updated_at=now()
    WHERE s.tenant_id=p_tenant_id AND s.id=p_session_id
    RETURNING s.* INTO v_session;
  END IF;
  RETURN jsonb_build_object(
    'id',v_session.id,'tenant_id',v_session.tenant_id,'program_id',v_session.program_id,
    'status',v_session.status,'capacity',v_session.capacity
  );
END $function$;

REVOKE ALL ON FUNCTION public.hris_get_learning_admin_catalog(uuid),
  public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean),
  public.hris_save_learning_session(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_learning_admin_catalog(uuid),
  public.hris_save_learning_program(uuid,uuid,text,text,text,text,text,numeric,boolean,text[],boolean),
  public.hris_save_learning_session(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,timestamptz)
  TO authenticated,service_role;

COMMIT;
