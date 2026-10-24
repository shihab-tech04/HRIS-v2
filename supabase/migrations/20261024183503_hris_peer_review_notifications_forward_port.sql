-- Phase 11 forward-only replay of canonical 20261013222433_hris_peer_review_in_app_notifications.sql.
-- Source Git blob: beebc20ef789b03c8555255814752bab19d995dd
-- SQL below copied verbatim; no application behavior changes in this PR.
-- Replacement target: xfuxnljfrgvusbrpvxpa ONLY. Original project is immutable.
-- Apply strictly in filename order AFTER Phase 10, only after isolated proof and review.
-- Preserve historical Auth references; no user import or cleanup.
-- Phase 16 vertical slice: tenant-scoped in-app alerts for eligible peer
-- reviews. Alerts are created in the same transaction as review obligations;
-- this migration does not send email or introduce reminder/retention policy.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS project_task_peer_reviews_tenant_id_id_key
  ON public.project_task_peer_reviews (tenant_id, id);

CREATE TABLE public.hris_in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  recipient_employee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind = 'peer_review_required'),
  peer_review_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz,
  CONSTRAINT hris_in_app_notifications_employee_fk FOREIGN KEY (tenant_id, recipient_employee_id)
    REFERENCES public.employees (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT hris_in_app_notifications_review_fk FOREIGN KEY (tenant_id, peer_review_id)
    REFERENCES public.project_task_peer_reviews (tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, recipient_employee_id, peer_review_id)
);

CREATE INDEX hris_in_app_notifications_employee_unread_idx
  ON public.hris_in_app_notifications (tenant_id, recipient_employee_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.hris_in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY hris_in_app_notifications_owner_read
  ON public.hris_in_app_notifications FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND recipient_employee_id = public.hris_own_employee_for_tenant(tenant_id)
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.is_active IS TRUE)
  );

REVOKE ALL ON public.hris_in_app_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hris_in_app_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_notify_eligible_project_peer_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.status = 'pending' AND EXISTS (
    SELECT 1
    FROM public.project_tasks t
    JOIN public.project_task_assignments reviewer_assignment
      ON reviewer_assignment.tenant_id = NEW.tenant_id
      AND reviewer_assignment.project_id = NEW.project_id
      AND reviewer_assignment.task_id = NEW.task_id
      AND reviewer_assignment.id = NEW.reviewer_task_assignment_id
      AND reviewer_assignment.employee_id = NEW.reviewer_employee_id
    JOIN public.project_task_assignments reviewee_assignment
      ON reviewee_assignment.tenant_id = NEW.tenant_id
      AND reviewee_assignment.project_id = NEW.project_id
      AND reviewee_assignment.task_id = NEW.task_id
      AND reviewee_assignment.id = NEW.reviewee_task_assignment_id
      AND reviewee_assignment.employee_id = NEW.employee_id
    WHERE t.tenant_id = NEW.tenant_id AND t.project_id = NEW.project_id AND t.id = NEW.task_id
      AND (t.status = 'completed' OR reviewee_assignment.released_at IS NOT NULL)
      AND reviewer_assignment.assigned_at < COALESCE(reviewee_assignment.released_at, 'infinity'::timestamptz)
      AND reviewee_assignment.assigned_at < COALESCE(reviewer_assignment.released_at, 'infinity'::timestamptz)
  ) THEN
    INSERT INTO public.hris_in_app_notifications (
      tenant_id, recipient_employee_id, kind, peer_review_id
    ) VALUES (NEW.tenant_id, NEW.reviewer_employee_id, 'peer_review_required', NEW.id)
    ON CONFLICT (tenant_id, recipient_employee_id, peer_review_id) DO NOTHING;
  ELSIF NEW.status = 'submitted' THEN
    UPDATE public.hris_in_app_notifications n
      SET read_at = COALESCE(n.read_at, NEW.submitted_at, clock_timestamp())
      WHERE n.tenant_id = NEW.tenant_id AND n.peer_review_id = NEW.id
        AND n.recipient_employee_id = NEW.reviewer_employee_id AND n.read_at IS NULL;
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER hris_project_peer_review_notification
  AFTER INSERT OR UPDATE OF status ON public.project_task_peer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.hris_notify_eligible_project_peer_review();
REVOKE ALL ON FUNCTION public.hris_notify_eligible_project_peer_review() FROM PUBLIC, anon, authenticated;

-- Preserve visibility for eligible reviews that were already pending when the
-- notification center was introduced.
INSERT INTO public.hris_in_app_notifications (
  tenant_id, recipient_employee_id, kind, peer_review_id
)
SELECT r.tenant_id, r.reviewer_employee_id, 'peer_review_required', r.id
FROM public.project_task_peer_reviews r
JOIN public.project_tasks t
  ON t.tenant_id = r.tenant_id AND t.project_id = r.project_id AND t.id = r.task_id
JOIN public.project_task_assignments reviewer_assignment
  ON reviewer_assignment.tenant_id = r.tenant_id AND reviewer_assignment.project_id = r.project_id
  AND reviewer_assignment.task_id = r.task_id AND reviewer_assignment.id = r.reviewer_task_assignment_id
  AND reviewer_assignment.employee_id = r.reviewer_employee_id
JOIN public.project_task_assignments reviewee_assignment
  ON reviewee_assignment.tenant_id = r.tenant_id AND reviewee_assignment.project_id = r.project_id
  AND reviewee_assignment.task_id = r.task_id AND reviewee_assignment.id = r.reviewee_task_assignment_id
  AND reviewee_assignment.employee_id = r.employee_id
WHERE r.status = 'pending'
  AND (t.status = 'completed' OR reviewee_assignment.released_at IS NOT NULL)
  AND reviewer_assignment.assigned_at < COALESCE(reviewee_assignment.released_at, 'infinity'::timestamptz)
  AND reviewee_assignment.assigned_at < COALESCE(reviewer_assignment.released_at, 'infinity'::timestamptz)
ON CONFLICT (tenant_id, recipient_employee_id, peer_review_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hris_get_my_project_notifications(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_notifications jsonb;
  v_unread_count integer;
  v_limit integer;
BEGIN
  IF NOT public.is_live_session()
      OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_active IS TRUE)
      OR (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Active tenant session and a complete page cursor are required.' USING errcode = '42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Linked employee required.' USING errcode = '42501';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  SELECT count(*)::integer INTO v_unread_count
  FROM public.hris_in_app_notifications n
  WHERE n.tenant_id = p_tenant_id AND n.recipient_employee_id = v_employee_id AND n.read_at IS NULL;

  SELECT COALESCE(jsonb_agg(page.item ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
    INTO v_notifications
  FROM (
    SELECT n.id, n.created_at,
      jsonb_build_object(
        'id', n.id,
        'kind', n.kind,
        'peer_review_id', r.id,
        'task_id', t.id,
        'project_id', p.id,
        'project_name', p.name,
        'task_title', t.title,
        'reviewee_name', reviewee.full_name,
        'review_status', r.status,
        'created_at', n.created_at,
        'read_at', n.read_at
      ) AS item
    FROM public.hris_in_app_notifications n
    JOIN public.project_task_peer_reviews r
      ON r.tenant_id = n.tenant_id AND r.id = n.peer_review_id
    JOIN public.project_tasks t
      ON t.tenant_id = r.tenant_id AND t.project_id = r.project_id AND t.id = r.task_id
    JOIN public.projects p
      ON p.tenant_id = r.tenant_id AND p.id = r.project_id
    JOIN public.employees reviewee
      ON reviewee.tenant_id = r.tenant_id AND reviewee.id = r.employee_id
    WHERE n.tenant_id = p_tenant_id AND n.recipient_employee_id = v_employee_id
      AND (p_before_created_at IS NULL OR (n.created_at, n.id) < (p_before_created_at, p_before_id))
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT v_limit
  ) page;
  RETURN jsonb_build_object('notifications', v_notifications, 'unread_count', v_unread_count);
END $function$;

REVOKE ALL ON FUNCTION public.hris_get_my_project_notifications(uuid, integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_project_notifications(uuid, integer, timestamptz, uuid) TO authenticated, service_role;

COMMIT;
