-- Forward-only replay of canonical 20261014160002_hris_system_notifications_inbox.sql for replacement HRIS.
-- Source Git blob: 5122036a51618d0d16050c83ad850fd24e022d19
-- Exact canonical SQL body below (unchanged); intended for reviewed versioned activation.
-- Target: xfuxnljfrgvusbrpvxpa ONLY. Do not modify original oslgwxaqfbteqtwqvdzs.
-- Dependency: Phase 10 and five Phase 11 task/peer-review migrations already applied.
-- NO hosted activation before PG17, UI/API signature regression checks and recovery gate.
-- Combine existing employee-owned notifications without changing either
-- source workflow's read or authorization rules.
BEGIN;

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
     OR p_before_source IS NOT NULL AND p_before_source NOT IN ('project_review','learning_completion') THEN
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
      NULL::uuid AS enrollment_id,NULL::text AS program_title
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
      n.enrollment_id,p.title AS program_title
    FROM public.learning_completion_notifications n
    JOIN public.learning_enrollments e
      ON e.tenant_id=n.tenant_id AND e.id=n.enrollment_id
    JOIN public.learning_programs p
      ON p.tenant_id=e.tenant_id AND p.id=e.program_id
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
      'review_status',n.review_status,'enrollment_id',n.enrollment_id,'program_title',n.program_title
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
  IS 'Employee-owned, tenant-scoped keyset notification feed for existing project-review and learning-completion events. The unread count covers project review alerts only; learning decisions remain historical updates without a read-state policy.';

COMMIT;
