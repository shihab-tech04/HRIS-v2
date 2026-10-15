-- Add owner-only leave decision updates to the unified employee notification
-- feed. Decision persistence and notification creation remain one transaction;
-- no read-state, email, or additional leave-decision rule is introduced.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
CREATE UNIQUE INDEX IF NOT EXISTS leave_requests_tenant_id_id_key
  ON public.leave_requests(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_id_id_key
  ON public.employees(tenant_id,id);

CREATE TABLE public.leave_request_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  leave_request_id uuid NOT NULL,
  recipient_employee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('approved','rejected')),
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,recipient_employee_id,leave_request_id,kind),
  CONSTRAINT leave_request_notifications_request_fk
    FOREIGN KEY (tenant_id,leave_request_id)
    REFERENCES public.leave_requests(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT leave_request_notifications_employee_fk
    FOREIGN KEY (tenant_id,recipient_employee_id)
    REFERENCES public.employees(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX leave_request_notifications_employee_feed_idx
  ON public.leave_request_notifications(tenant_id,recipient_employee_id,created_at DESC,id DESC);

ALTER TABLE public.leave_request_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leave_request_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.leave_request_notifications TO authenticated;
DROP POLICY IF EXISTS leave_request_notifications_owner_read ON public.leave_request_notifications;
CREATE POLICY leave_request_notifications_owner_read
  ON public.leave_request_notifications FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND public.hris_own_employee_for_tenant(tenant_id)=recipient_employee_id
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.is_active IS TRUE));

CREATE OR REPLACE FUNCTION private.hris_create_leave_decision_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF OLD.status='pending' AND NEW.status IN ('approved','rejected') THEN
    IF NEW.resolved_at IS NULL OR NEW.resolved_by IS NULL THEN
      RAISE EXCEPTION 'Leave decision notification requires persisted resolution metadata.'
        USING errcode='23514';
    END IF;
    INSERT INTO public.leave_request_notifications(
      tenant_id,leave_request_id,recipient_employee_id,kind,created_at
    ) VALUES (
      NEW.tenant_id,NEW.id,NEW.employee_id,NEW.status,NEW.resolved_at
    ) ON CONFLICT (tenant_id,recipient_employee_id,leave_request_id,kind) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.hris_create_leave_decision_notification() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS leave_decision_notification_after_update ON public.leave_requests;
CREATE TRIGGER leave_decision_notification_after_update
  AFTER UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION private.hris_create_leave_decision_notification();

CREATE OR REPLACE FUNCTION public.hris_get_my_notifications(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_source text DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_limit integer;
  v_notifications jsonb;
  v_unread_project_reviews integer;
  v_has_more boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants t
       WHERE t.id=p_tenant_id AND t.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF (p_before_created_at IS NULL) <> (p_before_source IS NULL)
     OR (p_before_created_at IS NULL) <> (p_before_id IS NULL)
     OR p_before_source IS NOT NULL AND p_before_source NOT IN
       ('project_review','learning_completion','travel_decision','leave_decision') THEN
    RAISE EXCEPTION 'Use a complete notification cursor from the previous page.' USING errcode='22023';
  END IF;

  v_limit := least(greatest(coalesce(p_limit,50),1),100);
  SELECT count(*)::integer INTO v_unread_project_reviews
  FROM public.hris_in_app_notifications n
  WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id AND n.read_at IS NULL;

  WITH source_rows AS (
    SELECT n.id,n.created_at,'project_review'::text AS source,n.kind,n.read_at,
      r.id AS peer_review_id,t.id AS task_id,p.id AS project_id,p.name AS project_name,
      t.title AS task_title,reviewee.full_name AS reviewee_name,r.status::text AS review_status,
      NULL::uuid AS enrollment_id,NULL::text AS program_title,
      NULL::uuid AS travel_request_id,NULL::text AS travel_destination,
      NULL::date AS travel_from_date,NULL::date AS travel_to_date,
      NULL::uuid AS leave_request_id,NULL::text AS leave_type_name,
      NULL::date AS leave_from_date,NULL::date AS leave_to_date
    FROM public.hris_in_app_notifications n
    JOIN public.project_task_peer_reviews r
      ON r.tenant_id=n.tenant_id AND r.id=n.peer_review_id
    JOIN public.project_tasks t
      ON t.tenant_id=r.tenant_id AND t.project_id=r.project_id AND t.id=r.task_id
    JOIN public.projects p ON p.tenant_id=r.tenant_id AND p.id=r.project_id
    JOIN public.employees reviewee ON reviewee.tenant_id=r.tenant_id AND reviewee.id=r.employee_id
    WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id

    UNION ALL

    SELECT n.id,n.created_at,'learning_completion'::text AS source,n.kind,
      NULL::timestamptz AS read_at,NULL::uuid AS peer_review_id,
      NULL::uuid AS task_id,NULL::uuid AS project_id,NULL::text AS project_name,
      NULL::text AS task_title,NULL::text AS reviewee_name,NULL::text AS review_status,
      n.enrollment_id,p.title AS program_title,
      NULL::uuid AS travel_request_id,NULL::text AS travel_destination,
      NULL::date AS travel_from_date,NULL::date AS travel_to_date,
      NULL::uuid AS leave_request_id,NULL::text AS leave_type_name,
      NULL::date AS leave_from_date,NULL::date AS leave_to_date
    FROM public.learning_completion_notifications n
    JOIN public.learning_enrollments e
      ON e.tenant_id=n.tenant_id AND e.id=n.enrollment_id
    JOIN public.learning_programs p
      ON p.tenant_id=e.tenant_id AND p.id=e.program_id
    WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id

    UNION ALL

    SELECT n.id,n.created_at,'travel_decision'::text AS source,n.kind,
      NULL::timestamptz AS read_at,NULL::uuid AS peer_review_id,
      NULL::uuid AS task_id,NULL::uuid AS project_id,NULL::text AS project_name,
      NULL::text AS task_title,NULL::text AS reviewee_name,NULL::text AS review_status,
      NULL::uuid AS enrollment_id,NULL::text AS program_title,
      r.id AS travel_request_id,r.destination AS travel_destination,
      r.from_date AS travel_from_date,r.to_date AS travel_to_date,
      NULL::uuid AS leave_request_id,NULL::text AS leave_type_name,
      NULL::date AS leave_from_date,NULL::date AS leave_to_date
    FROM public.travel_request_notifications n
    JOIN public.travel_requests r
      ON r.tenant_id=n.tenant_id AND r.id=n.travel_request_id
    WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id

    UNION ALL

    SELECT n.id,n.created_at,'leave_decision'::text AS source,n.kind,
      NULL::timestamptz AS read_at,NULL::uuid AS peer_review_id,
      NULL::uuid AS task_id,NULL::uuid AS project_id,NULL::text AS project_name,
      NULL::text AS task_title,NULL::text AS reviewee_name,NULL::text AS review_status,
      NULL::uuid AS enrollment_id,NULL::text AS program_title,
      NULL::uuid AS travel_request_id,NULL::text AS travel_destination,
      NULL::date AS travel_from_date,NULL::date AS travel_to_date,
      r.id AS leave_request_id,lt.name AS leave_type_name,
      r.from_date AS leave_from_date,r.to_date AS leave_to_date
    FROM public.leave_request_notifications n
    JOIN public.leave_requests r
      ON r.tenant_id=n.tenant_id AND r.id=n.leave_request_id
    LEFT JOIN public.leave_types lt
      ON lt.tenant_id=r.tenant_id AND lt.id=r.leave_type_id
    WHERE n.tenant_id=p_tenant_id AND n.recipient_employee_id=v_employee_id
  ), filtered_rows AS (
    SELECT * FROM source_rows n
    WHERE p_before_created_at IS NULL
       OR (n.created_at,n.source,n.id) < (p_before_created_at,p_before_source,p_before_id)
  ), page_rows AS (
    SELECT n.*,
      row_number() OVER (ORDER BY n.created_at DESC,n.source DESC,n.id DESC) AS page_position
    FROM filtered_rows n
    ORDER BY n.created_at DESC,n.source DESC,n.id DESC
    LIMIT v_limit + 1
  )
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',n.id,'source',n.source,'kind',n.kind,'created_at',n.created_at,'read_at',n.read_at,
      'peer_review_id',n.peer_review_id,'task_id',n.task_id,'project_id',n.project_id,
      'project_name',n.project_name,'task_title',n.task_title,'reviewee_name',n.reviewee_name,
      'review_status',n.review_status,'enrollment_id',n.enrollment_id,'program_title',n.program_title,
      'travel_request_id',n.travel_request_id,'travel_destination',n.travel_destination,
      'travel_from_date',n.travel_from_date,'travel_to_date',n.travel_to_date,
      'leave_request_id',n.leave_request_id,'leave_type_name',n.leave_type_name,
      'leave_from_date',n.leave_from_date,'leave_to_date',n.leave_to_date
    )) ORDER BY n.created_at DESC,n.source DESC,n.id DESC)
      FILTER (WHERE n.page_position<=v_limit),'[]'::jsonb),
    count(*)>v_limit
    INTO v_notifications,v_has_more
  FROM page_rows n;

  RETURN jsonb_build_object(
    'notifications',coalesce(v_notifications,'[]'::jsonb),
    'unread_project_reviews',coalesce(v_unread_project_reviews,0),
    'has_more',coalesce(v_has_more,false)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_notifications(uuid,integer,timestamptz,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_notifications(uuid,integer,timestamptz,text,uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.hris_get_my_notifications(uuid,integer,timestamptz,text,uuid)
  IS 'Employee-owned, tenant-scoped keyset notification feed for project-review, learning-completion, travel-decision, and leave-decision events. The unread count covers project review alerts only; learning, travel, and leave decisions remain historical updates without a read-state policy.';

COMMIT;
