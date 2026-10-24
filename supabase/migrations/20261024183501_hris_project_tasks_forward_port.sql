-- Phase 11 forward-only replay of canonical 20261013100001_hris_project_tasks_and_peer_reviews.sql.
-- Source Git blob: e2c8fac2fce106417cebd60d37c2fbed9382fc93
-- SQL below copied verbatim; no application behavior changes in this PR.
-- Replacement target: xfuxnljfrgvusbrpvxpa ONLY. Original project is immutable.
-- Apply strictly in filename order AFTER Phase 10, only after isolated proof and review.
-- Preserve historical Auth references; no user import or cleanup.
-- Phase 11 vertical workflow: project tasks, assignment overlap, and peer reviews.
-- Employee ids on reviews are the employee performance-history anchor. These
-- peer scores are not annual appraisal scores and carry no implicit weighting.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS project_allocations_tenant_project_id_employee_key
  ON public.project_allocations (tenant_id, project_id, id, employee_id);

CREATE TABLE public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed')),
  created_by_employee_id uuid NOT NULL,
  completed_by_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT project_tasks_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT project_tasks_created_by_fk FOREIGN KEY (tenant_id, created_by_employee_id)
    REFERENCES public.employees (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT project_tasks_completed_by_fk FOREIGN KEY (tenant_id, completed_by_employee_id)
    REFERENCES public.employees (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT project_tasks_completion_state CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND completed_by_employee_id IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL AND completed_by_employee_id IS NULL)
  ),
  UNIQUE (tenant_id, project_id, id)
);

CREATE TABLE public.project_task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  project_allocation_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  assigned_by_employee_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_at timestamptz,
  CONSTRAINT project_task_assignments_task_fk FOREIGN KEY (tenant_id, project_id, task_id)
    REFERENCES public.project_tasks (tenant_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT project_task_assignments_project_allocation_fk
    FOREIGN KEY (tenant_id, project_id, project_allocation_id, employee_id)
    REFERENCES public.project_allocations (tenant_id, project_id, id, employee_id) ON DELETE RESTRICT,
  CONSTRAINT project_task_assignments_assigned_by_fk FOREIGN KEY (tenant_id, assigned_by_employee_id)
    REFERENCES public.employees (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT project_task_assignments_release_time CHECK (released_at IS NULL OR released_at >= assigned_at),
  UNIQUE (tenant_id, project_id, task_id, id, project_allocation_id, employee_id)
);
CREATE UNIQUE INDEX project_task_assignments_one_active_allocation_idx
  ON public.project_task_assignments (tenant_id, task_id, project_allocation_id)
  WHERE released_at IS NULL;

CREATE TABLE public.project_task_peer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  reviewer_task_assignment_id uuid NOT NULL,
  reviewer_project_allocation_id uuid NOT NULL,
  reviewer_employee_id uuid NOT NULL,
  reviewee_task_assignment_id uuid NOT NULL,
  reviewee_project_allocation_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted')),
  quality_of_work_score smallint,
  quality_of_work_not_observed boolean NOT NULL DEFAULT false,
  collaboration_teamwork_score smallint,
  collaboration_teamwork_not_observed boolean NOT NULL DEFAULT false,
  delivery_reliability_score smallint,
  delivery_reliability_not_observed boolean NOT NULL DEFAULT false,
  ownership_communication_score smallint,
  ownership_communication_not_observed boolean NOT NULL DEFAULT false,
  comments text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  CONSTRAINT project_task_peer_reviews_task_fk FOREIGN KEY (tenant_id, project_id, task_id)
    REFERENCES public.project_tasks (tenant_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT project_task_peer_reviews_reviewer_fk FOREIGN KEY (
    tenant_id, project_id, task_id, reviewer_task_assignment_id,
    reviewer_project_allocation_id, reviewer_employee_id
  ) REFERENCES public.project_task_assignments (
    tenant_id, project_id, task_id, id, project_allocation_id, employee_id
  ) ON DELETE RESTRICT,
  CONSTRAINT project_task_peer_reviews_reviewee_fk FOREIGN KEY (
    tenant_id, project_id, task_id, reviewee_task_assignment_id,
    reviewee_project_allocation_id, employee_id
  ) REFERENCES public.project_task_assignments (
    tenant_id, project_id, task_id, id, project_allocation_id, employee_id
  ) ON DELETE RESTRICT,
  CONSTRAINT project_task_peer_reviews_no_self_review CHECK (reviewer_employee_id <> employee_id),
  CONSTRAINT project_task_peer_reviews_submission_state CHECK (
    (status = 'pending' AND submitted_at IS NULL
      AND quality_of_work_score IS NULL AND NOT quality_of_work_not_observed
      AND collaboration_teamwork_score IS NULL AND NOT collaboration_teamwork_not_observed
      AND delivery_reliability_score IS NULL AND NOT delivery_reliability_not_observed
      AND ownership_communication_score IS NULL AND NOT ownership_communication_not_observed)
    OR
    (status = 'submitted' AND submitted_at IS NOT NULL
      AND ((quality_of_work_not_observed AND quality_of_work_score IS NULL)
        OR (NOT quality_of_work_not_observed AND quality_of_work_score BETWEEN 0 AND 5))
      AND ((collaboration_teamwork_not_observed AND collaboration_teamwork_score IS NULL)
        OR (NOT collaboration_teamwork_not_observed AND collaboration_teamwork_score BETWEEN 0 AND 5))
      AND ((delivery_reliability_not_observed AND delivery_reliability_score IS NULL)
        OR (NOT delivery_reliability_not_observed AND delivery_reliability_score BETWEEN 0 AND 5))
      AND ((ownership_communication_not_observed AND ownership_communication_score IS NULL)
        OR (NOT ownership_communication_not_observed AND ownership_communication_score BETWEEN 0 AND 5)))
  ),
  UNIQUE (tenant_id, task_id, reviewer_employee_id, employee_id)
);

CREATE INDEX project_tasks_tenant_project_status_idx
  ON public.project_tasks (tenant_id, project_id, status, due_date);
CREATE INDEX project_task_assignments_tenant_employee_idx
  ON public.project_task_assignments (tenant_id, employee_id, task_id);
CREATE INDEX project_task_peer_reviews_tenant_reviewer_status_idx
  ON public.project_task_peer_reviews (tenant_id, reviewer_employee_id, status, created_at DESC);
CREATE INDEX project_task_peer_reviews_tenant_reviewee_status_idx
  ON public.project_task_peer_reviews (tenant_id, employee_id, status, created_at DESC);

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_task_peer_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hris_can_manage_project_tasks(p_tenant_id uuid, p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.is_live_session() AND p_tenant_id IS NOT NULL AND p_project_id IS NOT NULL
    AND public.hris_own_employee_for_tenant(p_tenant_id) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE)
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.tenant_id=p_tenant_id
      AND p.id=p_project_id AND p.project_lead_id=public.hris_own_employee_for_tenant(p_tenant_id))
$function$;

CREATE OR REPLACE FUNCTION public.hris_can_access_project_task(p_tenant_id uuid, p_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.is_live_session() AND p_tenant_id IS NOT NULL AND p_task_id IS NOT NULL
    AND public.hris_own_employee_for_tenant(p_tenant_id) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
    AND EXISTS (
      SELECT 1 FROM public.project_tasks t
      WHERE t.tenant_id=p_tenant_id AND t.id=p_task_id
        AND (public.hris_can_manage_project_tasks(p_tenant_id,t.project_id)
          OR EXISTS (SELECT 1 FROM public.project_task_assignments a
            WHERE a.tenant_id=t.tenant_id AND a.project_id=t.project_id AND a.task_id=t.id
              AND a.employee_id=public.hris_own_employee_for_tenant(p_tenant_id)))
    )
$function$;

CREATE OR REPLACE FUNCTION public.hris_can_access_task_assignment(p_tenant_id uuid, p_assignment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.is_live_session() AND p_tenant_id IS NOT NULL AND p_assignment_id IS NOT NULL
    AND public.hris_own_employee_for_tenant(p_tenant_id) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
    AND EXISTS (SELECT 1 FROM public.project_task_assignments a
      WHERE a.tenant_id=p_tenant_id AND a.id=p_assignment_id
        AND (a.employee_id=public.hris_own_employee_for_tenant(p_tenant_id)
          OR public.hris_can_manage_project_tasks(p_tenant_id,a.project_id)))
$function$;

CREATE OR REPLACE FUNCTION public.hris_can_read_project_task_review(p_tenant_id uuid, p_review_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.is_live_session() AND p_tenant_id IS NOT NULL AND p_review_id IS NOT NULL
    AND public.hris_own_employee_for_tenant(p_tenant_id) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
    AND EXISTS (SELECT 1 FROM public.project_task_peer_reviews r
      WHERE r.tenant_id=p_tenant_id AND r.id=p_review_id
        AND (r.reviewer_employee_id=public.hris_own_employee_for_tenant(p_tenant_id)
          OR (r.employee_id=public.hris_own_employee_for_tenant(p_tenant_id) AND r.status='submitted')))
$function$;

CREATE POLICY hris_project_tasks_read ON public.project_tasks
  FOR SELECT TO authenticated USING (public.hris_can_access_project_task(tenant_id,id));
CREATE POLICY hris_project_task_assignments_read ON public.project_task_assignments
  FOR SELECT TO authenticated USING (public.hris_can_access_task_assignment(tenant_id,id));
CREATE POLICY hris_project_task_peer_reviews_read ON public.project_task_peer_reviews
  FOR SELECT TO authenticated USING (public.hris_can_read_project_task_review(tenant_id,id));
REVOKE ALL ON public.project_tasks, public.project_task_assignments, public.project_task_peer_reviews
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.project_tasks, public.project_task_assignments, public.project_task_peer_reviews
  TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_create_project_task(
  p_tenant_id uuid, p_project_id uuid, p_title text, p_description text,
  p_due_date date, p_project_allocation_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_task public.project_tasks%ROWTYPE; v_employee_id uuid; v_today date;
BEGIN
  IF NOT public.hris_can_manage_project_tasks(p_tenant_id,p_project_id) THEN
    RAISE EXCEPTION 'Only the appointed Project Manager can manage project tasks.' USING errcode='42501';
  END IF;
  SELECT public.hris_own_employee_for_tenant(p_tenant_id) INTO v_employee_id;
  SELECT (now() AT TIME ZONE COALESCE(t.timezone,'UTC'))::date INTO v_today
  FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
      OR length(COALESCE(p_description,'')) > 4000 OR p_project_allocation_ids IS NULL
      OR cardinality(p_project_allocation_ids) < 1
      OR cardinality(p_project_allocation_ids) <> (SELECT count(DISTINCT value)::integer FROM unnest(p_project_allocation_ids) AS ids(value))
      OR p_due_date IS NOT NULL AND p_due_date < v_today THEN
    RAISE EXCEPTION 'Task details and at least one project member are required.' USING errcode='22023';
  END IF;
  IF (SELECT count(*) FROM public.project_allocations a
      WHERE a.tenant_id=p_tenant_id AND a.project_id=p_project_id
        AND a.id=ANY(p_project_allocation_ids) AND a.status='active'
        AND a.assigned_date<=v_today AND (a.release_date IS NULL OR a.release_date>=v_today))
      <> cardinality(p_project_allocation_ids) THEN
    RAISE EXCEPTION 'Every task member must have an active allocation in this project.' USING errcode='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects p WHERE p.tenant_id=p_tenant_id
      AND p.id=p_project_id AND p.status='completed') THEN
    RAISE EXCEPTION 'A completed project cannot receive new tasks.' USING errcode='22023';
  END IF;
  INSERT INTO public.project_tasks(tenant_id,project_id,title,description,due_date,created_by_employee_id)
  VALUES (p_tenant_id,p_project_id,btrim(p_title),COALESCE(p_description,''),p_due_date,v_employee_id)
  RETURNING * INTO v_task;
  INSERT INTO public.project_task_assignments(
    tenant_id,project_id,task_id,project_allocation_id,employee_id,assigned_by_employee_id
  ) SELECT p_tenant_id,p_project_id,v_task.id,a.id,a.employee_id,v_employee_id
    FROM public.project_allocations a WHERE a.tenant_id=p_tenant_id AND a.project_id=p_project_id
      AND a.id=ANY(p_project_allocation_ids);
  RETURN to_jsonb(v_task);
END $function$;

CREATE OR REPLACE FUNCTION public.hris_start_project_task(p_tenant_id uuid,p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_task public.project_tasks%ROWTYPE;
BEGIN
  UPDATE public.project_tasks t SET status='in_progress',started_at=COALESCE(t.started_at,clock_timestamp())
  WHERE t.tenant_id=p_tenant_id AND t.id=p_task_id AND t.status='open'
    AND public.hris_can_manage_project_tasks(p_tenant_id,t.project_id)
  RETURNING t.* INTO v_task;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open task in a project you manage was not found.' USING errcode='42501'; END IF;
  RETURN to_jsonb(v_task);
END $function$;

CREATE OR REPLACE FUNCTION public.hris_assign_project_task_member(
  p_tenant_id uuid,p_task_id uuid,p_project_allocation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_task public.project_tasks%ROWTYPE; v_employee_id uuid; v_today date; v_row public.project_task_assignments%ROWTYPE;
BEGIN
  SELECT t.* INTO v_task FROM public.project_tasks t
  WHERE t.tenant_id=p_tenant_id AND t.id=p_task_id FOR UPDATE;
  IF NOT FOUND OR NOT public.hris_can_manage_project_tasks(p_tenant_id,v_task.project_id)
      OR v_task.status='completed' THEN
    RAISE EXCEPTION 'Only the appointed Project Manager can add members to an unfinished task.' USING errcode='42501';
  END IF;
  SELECT public.hris_own_employee_for_tenant(p_tenant_id) INTO v_employee_id;
  SELECT (now() AT TIME ZONE COALESCE(t.timezone,'UTC'))::date INTO v_today
    FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE;
  IF NOT EXISTS (SELECT 1 FROM public.project_allocations a WHERE a.tenant_id=p_tenant_id
      AND a.project_id=v_task.project_id AND a.id=p_project_allocation_id AND a.status='active'
      AND a.assigned_date<=v_today AND (a.release_date IS NULL OR a.release_date>=v_today)) THEN
    RAISE EXCEPTION 'Task member must have an active allocation in this project.' USING errcode='22023';
  END IF;
  INSERT INTO public.project_task_assignments(tenant_id,project_id,task_id,project_allocation_id,employee_id,assigned_by_employee_id)
    SELECT p_tenant_id,v_task.project_id,v_task.id,a.id,a.employee_id,v_employee_id
    FROM public.project_allocations a WHERE a.tenant_id=p_tenant_id AND a.project_id=v_task.project_id AND a.id=p_project_allocation_id
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This project member is already assigned to the task.' USING errcode='22023';
END $function$;

CREATE OR REPLACE FUNCTION public.hris_release_project_task_member(p_tenant_id uuid,p_task_assignment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_assignment public.project_task_assignments%ROWTYPE; v_task public.project_tasks%ROWTYPE;
BEGIN
  SELECT a.* INTO v_assignment FROM public.project_task_assignments a
  WHERE a.tenant_id=p_tenant_id AND a.id=p_task_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task assignment not found.' USING errcode='22023'; END IF;
  SELECT t.* INTO v_task FROM public.project_tasks t
  WHERE t.tenant_id=p_tenant_id AND t.id=v_assignment.task_id FOR UPDATE;
  IF NOT public.hris_can_manage_project_tasks(p_tenant_id,v_task.project_id) OR v_task.status='completed'
      OR v_assignment.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only the appointed Project Manager can release an active member from an unfinished task.' USING errcode='42501';
  END IF;
  UPDATE public.project_task_assignments SET released_at=clock_timestamp()
    WHERE tenant_id=p_tenant_id AND id=p_task_assignment_id RETURNING * INTO v_assignment;
  -- A member release creates obligations for overlapping peers to review the
  -- released member. These obligations never prevent the release operation.
  INSERT INTO public.project_task_peer_reviews(
    tenant_id,project_id,task_id,reviewer_task_assignment_id,reviewer_project_allocation_id,
    reviewer_employee_id,reviewee_task_assignment_id,reviewee_project_allocation_id,employee_id
  ) SELECT v_assignment.tenant_id,v_assignment.project_id,v_assignment.task_id,
      peer.id,peer.project_allocation_id,peer.employee_id,
      v_assignment.id,v_assignment.project_allocation_id,v_assignment.employee_id
    FROM public.project_task_assignments peer
    WHERE peer.tenant_id=v_assignment.tenant_id AND peer.task_id=v_assignment.task_id
      AND peer.id<>v_assignment.id AND peer.employee_id<>v_assignment.employee_id
      AND peer.assigned_at < v_assignment.released_at
      AND COALESCE(peer.released_at,'infinity'::timestamptz) > v_assignment.assigned_at
  ON CONFLICT (tenant_id,task_id,reviewer_employee_id,employee_id) DO NOTHING;
  RETURN jsonb_build_object('assignment',to_jsonb(v_assignment),'feedback_pending',(
    SELECT count(*)::integer FROM public.project_task_peer_reviews r
    WHERE r.tenant_id=p_tenant_id AND r.task_id=v_assignment.task_id AND r.status='pending'));
END $function$;

CREATE OR REPLACE FUNCTION public.hris_release_task_assignments_with_project_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_assignment public.project_task_assignments%ROWTYPE;
BEGIN
  IF NEW.status='released' AND OLD.status IS DISTINCT FROM 'released' THEN
    FOR v_assignment IN
      UPDATE public.project_task_assignments a SET released_at=clock_timestamp()
      FROM public.project_tasks t
      WHERE a.tenant_id=NEW.tenant_id AND a.project_allocation_id=NEW.id
        AND a.released_at IS NULL AND t.tenant_id=a.tenant_id AND t.project_id=a.project_id
        AND t.id=a.task_id AND t.status<>'completed'
      RETURNING a.*
    LOOP
      -- Project membership release closes the employee's open task assignments
      -- and creates the same overlap-based review obligations as task release.
      INSERT INTO public.project_task_peer_reviews(
        tenant_id,project_id,task_id,reviewer_task_assignment_id,reviewer_project_allocation_id,
        reviewer_employee_id,reviewee_task_assignment_id,reviewee_project_allocation_id,employee_id
      ) SELECT v_assignment.tenant_id,v_assignment.project_id,v_assignment.task_id,
          peer.id,peer.project_allocation_id,peer.employee_id,
          v_assignment.id,v_assignment.project_allocation_id,v_assignment.employee_id
        FROM public.project_task_assignments peer
        WHERE peer.tenant_id=v_assignment.tenant_id AND peer.task_id=v_assignment.task_id
          AND peer.id<>v_assignment.id AND peer.employee_id<>v_assignment.employee_id
          AND peer.assigned_at < v_assignment.released_at
          AND COALESCE(peer.released_at,'infinity'::timestamptz) > v_assignment.assigned_at
      ON CONFLICT (tenant_id,task_id,reviewer_employee_id,employee_id) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER hris_project_allocation_release_tasks
  AFTER UPDATE OF status ON public.project_allocations
  FOR EACH ROW WHEN (NEW.status='released' AND OLD.status IS DISTINCT FROM 'released')
  EXECUTE FUNCTION public.hris_release_task_assignments_with_project_allocation();
REVOKE ALL ON FUNCTION public.hris_release_task_assignments_with_project_allocation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.hris_complete_project_task(p_tenant_id uuid,p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_task public.project_tasks%ROWTYPE; v_employee_id uuid; v_review_count integer;
BEGIN
  SELECT t.* INTO v_task FROM public.project_tasks t
  WHERE t.tenant_id=p_tenant_id AND t.id=p_task_id FOR UPDATE;
  IF NOT FOUND OR NOT public.hris_can_manage_project_tasks(p_tenant_id,v_task.project_id)
      OR v_task.status='completed' THEN
    RAISE EXCEPTION 'Only the appointed Project Manager can complete an unfinished task.' USING errcode='42501';
  END IF;
  SELECT public.hris_own_employee_for_tenant(p_tenant_id) INTO v_employee_id;
  UPDATE public.project_tasks SET status='completed',completed_at=clock_timestamp(),completed_by_employee_id=v_employee_id
    WHERE tenant_id=p_tenant_id AND id=p_task_id RETURNING * INTO v_task;
  -- Completion is independent of feedback submission. Create obligations for
  -- all distinct collaborators with overlapping assignment intervals.
  INSERT INTO public.project_task_peer_reviews(
    tenant_id,project_id,task_id,reviewer_task_assignment_id,reviewer_project_allocation_id,
    reviewer_employee_id,reviewee_task_assignment_id,reviewee_project_allocation_id,employee_id
  ) SELECT a.tenant_id,a.project_id,a.task_id,a.id,a.project_allocation_id,a.employee_id,
      b.id,b.project_allocation_id,b.employee_id
    FROM public.project_task_assignments a
    JOIN public.project_task_assignments b ON b.tenant_id=a.tenant_id AND b.project_id=a.project_id
      AND b.task_id=a.task_id AND b.id<>a.id AND b.employee_id<>a.employee_id
      AND a.assigned_at < COALESCE(b.released_at,'infinity'::timestamptz)
      AND b.assigned_at < COALESCE(a.released_at,'infinity'::timestamptz)
    WHERE a.tenant_id=p_tenant_id AND a.task_id=p_task_id
  ON CONFLICT (tenant_id,task_id,reviewer_employee_id,employee_id) DO NOTHING;
  SELECT count(*)::integer INTO v_review_count FROM public.project_task_peer_reviews r
    WHERE r.tenant_id=p_tenant_id AND r.task_id=p_task_id AND r.status='pending';
  RETURN jsonb_build_object('task',to_jsonb(v_task),'feedback_pending',v_review_count);
END $function$;

CREATE OR REPLACE FUNCTION public.hris_get_project_task_workspace(p_tenant_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid; v_can_manage boolean; v_tasks jsonb;
BEGIN
  IF NOT public.is_live_session() OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active tenant session required.' USING errcode='42501';
  END IF;
  v_employee_id:=public.hris_own_employee_for_tenant(p_tenant_id);
  v_can_manage:=public.hris_can_manage_project_tasks(p_tenant_id,p_project_id);
  IF NOT v_can_manage AND NOT EXISTS (SELECT 1 FROM public.project_allocations a
      WHERE a.tenant_id=p_tenant_id AND a.project_id=p_project_id AND a.employee_id=v_employee_id) THEN
    RAISE EXCEPTION 'Project membership required.' USING errcode='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',t.id,'project_id',t.project_id,'title',t.title,'description',t.description,'due_date',t.due_date,
    'status',t.status,'created_at',t.created_at,'started_at',t.started_at,'completed_at',t.completed_at,
    'feedback_pending',(SELECT count(*)::integer FROM public.project_task_peer_reviews r
      WHERE r.tenant_id=t.tenant_id AND r.task_id=t.id AND r.status='pending'),
    'members',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',a.id,'project_allocation_id',a.project_allocation_id,'employee_id',a.employee_id,
      'employee_name',e.full_name,'employee_number',e.employee_number,'assigned_at',a.assigned_at,'released_at',a.released_at
    ) ORDER BY e.full_name,a.assigned_at) FROM public.project_task_assignments a
      JOIN public.employees e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id
      WHERE a.tenant_id=t.tenant_id AND a.task_id=t.id), '[]'::jsonb)
  ) ORDER BY t.due_date NULLS LAST,t.created_at DESC),'[]'::jsonb) INTO v_tasks
  FROM public.project_tasks t WHERE t.tenant_id=p_tenant_id AND t.project_id=p_project_id
    AND (v_can_manage OR EXISTS (SELECT 1 FROM public.project_task_assignments a
      WHERE a.tenant_id=t.tenant_id AND a.task_id=t.id AND a.employee_id=v_employee_id));
  RETURN jsonb_build_object('tasks',v_tasks,'can_manage',v_can_manage);
END $function$;

CREATE OR REPLACE FUNCTION public.hris_get_my_project_tasks(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid; v_tasks jsonb;
BEGIN
  IF NOT public.is_live_session() OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active tenant session required.' USING errcode='42501';
  END IF;
  v_employee_id:=public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Linked employee required.' USING errcode='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'task_id',t.id,'project_id',t.project_id,'project_name',p.name,'project_code',p.code,
    'project_manager_name',lead.full_name,'title',t.title,'description',t.description,
    'due_date',t.due_date,'status',t.status,'completed_at',t.completed_at,
    'feedback_pending',(SELECT count(*)::integer FROM public.project_task_peer_reviews r
      WHERE r.tenant_id=t.tenant_id AND r.task_id=t.id AND r.status='pending'),
    'assignment_id',own_assignment.id,'assigned_at',own_assignment.assigned_at,
    'released_at',own_assignment.released_at,
    'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('employee_id',a.employee_id,'employee_name',e.full_name)
      ORDER BY e.full_name) FROM public.project_task_assignments a
      JOIN public.employees e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id
      WHERE a.tenant_id=t.tenant_id AND a.task_id=t.id),'[]'::jsonb)
  ) ORDER BY t.due_date NULLS LAST,t.created_at DESC),'[]'::jsonb) INTO v_tasks
  FROM public.project_task_assignments own_assignment
  JOIN public.project_tasks t ON t.tenant_id=own_assignment.tenant_id AND t.project_id=own_assignment.project_id AND t.id=own_assignment.task_id
  JOIN public.projects p ON p.tenant_id=t.tenant_id AND p.id=t.project_id
  JOIN public.employees lead ON lead.tenant_id=p.tenant_id AND lead.id=p.project_lead_id
  WHERE own_assignment.tenant_id=p_tenant_id AND own_assignment.employee_id=v_employee_id;
  RETURN jsonb_build_object('tasks',v_tasks);
END $function$;

CREATE OR REPLACE FUNCTION public.hris_get_my_project_peer_reviews(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid; v_reviews jsonb;
BEGIN
  IF NOT public.is_live_session() OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active tenant session required.' USING errcode='42501';
  END IF;
  v_employee_id:=public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Linked employee required.' USING errcode='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',r.id,'task_id',r.task_id,'project_id',r.project_id,'project_name',p.name,
    'task_title',t.title,'reviewer_employee_id',r.reviewer_employee_id,'reviewer_name',reviewer.full_name,
    'reviewer_task_assignment_id',r.reviewer_task_assignment_id,
    'reviewer_project_allocation_id',r.reviewer_project_allocation_id,
    'reviewee_employee_id',r.employee_id,'reviewee_name',reviewee.full_name,
    'reviewee_task_assignment_id',r.reviewee_task_assignment_id,
    'reviewee_project_allocation_id',r.reviewee_project_allocation_id,
    'status',r.status,'quality_of_work_score',r.quality_of_work_score,
    'quality_of_work_not_observed',r.quality_of_work_not_observed,
    'collaboration_teamwork_score',r.collaboration_teamwork_score,
    'collaboration_teamwork_not_observed',r.collaboration_teamwork_not_observed,
    'delivery_reliability_score',r.delivery_reliability_score,
    'delivery_reliability_not_observed',r.delivery_reliability_not_observed,
    'ownership_communication_score',r.ownership_communication_score,
    'ownership_communication_not_observed',r.ownership_communication_not_observed,
    'comments',r.comments,'created_at',r.created_at,'submitted_at',r.submitted_at
  ) ORDER BY r.created_at DESC),'[]'::jsonb) INTO v_reviews
  FROM public.project_task_peer_reviews r
  JOIN public.project_tasks t ON t.tenant_id=r.tenant_id AND t.project_id=r.project_id AND t.id=r.task_id
  JOIN public.projects p ON p.tenant_id=r.tenant_id AND p.id=r.project_id
  JOIN public.employees reviewer ON reviewer.tenant_id=r.tenant_id AND reviewer.id=r.reviewer_employee_id
  JOIN public.employees reviewee ON reviewee.tenant_id=r.tenant_id AND reviewee.id=r.employee_id
  WHERE r.tenant_id=p_tenant_id AND (r.reviewer_employee_id=v_employee_id
    OR (r.employee_id=v_employee_id AND r.status='submitted'));
  RETURN jsonb_build_object('reviews',v_reviews);
END $function$;

CREATE OR REPLACE FUNCTION public.hris_submit_project_peer_review(
  p_tenant_id uuid,p_review_id uuid,p_scores jsonb,p_not_observed text[],p_comments text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid; v_review public.project_task_peer_reviews%ROWTYPE;
  v_allowed text[]:=ARRAY['quality_of_work','collaboration_teamwork','delivery_reliability','ownership_communication'];
BEGIN
  IF NOT public.is_live_session() OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active tenant session required.' USING errcode='42501';
  END IF;
  v_employee_id:=public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL OR p_scores IS NULL OR jsonb_typeof(p_scores)<>'object'
      OR (SELECT count(*) FROM jsonb_object_keys(p_scores))<>4 OR NOT (p_scores ?& v_allowed)
      OR p_not_observed IS NULL OR length(COALESCE(p_comments,''))>4000
      OR cardinality(p_not_observed)<>(SELECT count(DISTINCT value)::integer FROM unnest(p_not_observed) AS criteria(value))
      OR EXISTS (SELECT 1 FROM unnest(p_not_observed) AS criteria(value) WHERE NOT (value=ANY(v_allowed))) THEN
    RAISE EXCEPTION 'All four criteria need a 0–5 score or Not Observed.' USING errcode='22023';
  END IF;
  IF ((p_scores->'quality_of_work'='null'::jsonb) <> ('quality_of_work'=ANY(p_not_observed)))
      OR ((p_scores->'collaboration_teamwork'='null'::jsonb) <> ('collaboration_teamwork'=ANY(p_not_observed)))
      OR ((p_scores->'delivery_reliability'='null'::jsonb) <> ('delivery_reliability'=ANY(p_not_observed)))
      OR ((p_scores->'ownership_communication'='null'::jsonb) <> ('ownership_communication'=ANY(p_not_observed)))
      OR EXISTS (SELECT 1 FROM unnest(v_allowed) k WHERE NOT (k=ANY(p_not_observed)) AND
        (jsonb_typeof(p_scores->k)<>'number' OR p_scores->>k !~ '^[0-5]$')) THEN
    RAISE EXCEPTION 'Each observed criterion must have one integer score from 0 to 5; Not Observed has no numeric score.' USING errcode='22023';
  END IF;
  UPDATE public.project_task_peer_reviews r SET
    quality_of_work_score=CASE WHEN 'quality_of_work'=ANY(p_not_observed) THEN NULL ELSE (p_scores->>'quality_of_work')::smallint END,
    quality_of_work_not_observed='quality_of_work'=ANY(p_not_observed),
    collaboration_teamwork_score=CASE WHEN 'collaboration_teamwork'=ANY(p_not_observed) THEN NULL ELSE (p_scores->>'collaboration_teamwork')::smallint END,
    collaboration_teamwork_not_observed='collaboration_teamwork'=ANY(p_not_observed),
    delivery_reliability_score=CASE WHEN 'delivery_reliability'=ANY(p_not_observed) THEN NULL ELSE (p_scores->>'delivery_reliability')::smallint END,
    delivery_reliability_not_observed='delivery_reliability'=ANY(p_not_observed),
    ownership_communication_score=CASE WHEN 'ownership_communication'=ANY(p_not_observed) THEN NULL ELSE (p_scores->>'ownership_communication')::smallint END,
    ownership_communication_not_observed='ownership_communication'=ANY(p_not_observed),
    comments=COALESCE(p_comments,''),status='submitted',submitted_at=clock_timestamp()
  WHERE r.tenant_id=p_tenant_id AND r.id=p_review_id AND r.reviewer_employee_id=v_employee_id AND r.status='pending'
  RETURNING r.* INTO v_review;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending peer review assigned to this employee was not found.' USING errcode='42501'; END IF;
  RETURN to_jsonb(v_review);
END $function$;

REVOKE ALL ON FUNCTION public.hris_can_manage_project_tasks(uuid,uuid),
  public.hris_can_access_project_task(uuid,uuid),public.hris_can_access_task_assignment(uuid,uuid),
  public.hris_can_read_project_task_review(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_can_manage_project_tasks(uuid,uuid),
  public.hris_can_access_project_task(uuid,uuid),public.hris_can_access_task_assignment(uuid,uuid),
  public.hris_can_read_project_task_review(uuid,uuid) TO authenticated,service_role;

REVOKE ALL ON FUNCTION public.hris_create_project_task(uuid,uuid,text,text,date,uuid[]),
  public.hris_start_project_task(uuid,uuid),public.hris_assign_project_task_member(uuid,uuid,uuid),
  public.hris_release_project_task_member(uuid,uuid),public.hris_complete_project_task(uuid,uuid),
  public.hris_get_project_task_workspace(uuid,uuid),public.hris_get_my_project_tasks(uuid),
  public.hris_get_my_project_peer_reviews(uuid),public.hris_submit_project_peer_review(uuid,uuid,jsonb,text[],text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_create_project_task(uuid,uuid,text,text,date,uuid[]),
  public.hris_start_project_task(uuid,uuid),public.hris_assign_project_task_member(uuid,uuid,uuid),
  public.hris_release_project_task_member(uuid,uuid),public.hris_complete_project_task(uuid,uuid),
  public.hris_get_project_task_workspace(uuid,uuid),public.hris_get_my_project_tasks(uuid),
  public.hris_get_my_project_peer_reviews(uuid),public.hris_submit_project_peer_review(uuid,uuid,jsonb,text[],text)
  TO authenticated,service_role;

COMMIT;
