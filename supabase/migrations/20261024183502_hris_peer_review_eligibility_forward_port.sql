-- Phase 11 forward-only replay of canonical 20261013184000_hris_peer_review_eligibility_enforcement.sql.
-- Source Git blob: 62020c815cef79ad969360a1e87b3eb418b0d71b
-- SQL below copied verbatim; no application behavior changes in this PR.
-- Replacement target: xfuxnljfrgvusbrpvxpa ONLY. Original project is immutable.
-- Apply strictly in filename order AFTER Phase 10, only after isolated proof and review.
-- Preserve historical Auth references; no user import or cleanup.
-- Phase 11 policy clarification: validate peer-review eligibility again at
-- submission so stale or malformed pending rows cannot bypass assignment
-- overlap requirements. Release and completion remain independent of feedback.
BEGIN;

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
    AND EXISTS (
      SELECT 1
      FROM public.project_tasks t
      JOIN public.project_task_assignments reviewer_assignment
        ON reviewer_assignment.tenant_id=r.tenant_id AND reviewer_assignment.project_id=r.project_id
        AND reviewer_assignment.task_id=r.task_id AND reviewer_assignment.id=r.reviewer_task_assignment_id
        AND reviewer_assignment.employee_id=r.reviewer_employee_id
      JOIN public.project_task_assignments reviewee_assignment
        ON reviewee_assignment.tenant_id=r.tenant_id AND reviewee_assignment.project_id=r.project_id
        AND reviewee_assignment.task_id=r.task_id AND reviewee_assignment.id=r.reviewee_task_assignment_id
        AND reviewee_assignment.employee_id=r.employee_id
      WHERE t.tenant_id=r.tenant_id AND t.project_id=r.project_id AND t.id=r.task_id
        AND (t.status='completed' OR reviewee_assignment.released_at IS NOT NULL)
        AND reviewer_assignment.assigned_at < COALESCE(reviewee_assignment.released_at,'infinity'::timestamptz)
        AND reviewee_assignment.assigned_at < COALESCE(reviewer_assignment.released_at,'infinity'::timestamptz)
    )
  RETURNING r.* INTO v_review;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending eligible peer review assigned to this employee was not found.' USING errcode='42501'; END IF;
  RETURN to_jsonb(v_review);
END $function$;

REVOKE ALL ON FUNCTION public.hris_submit_project_peer_review(uuid,uuid,jsonb,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_submit_project_peer_review(uuid,uuid,jsonb,text[],text) TO authenticated,service_role;

COMMIT;
