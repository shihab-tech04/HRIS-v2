-- The Candidate profile is unique by user_id. Derive the tenant from that
-- authenticated user's active profile instead of pinning every candidate to
-- the global synesis-it tenant helper. Preserve the existing sanitized payload.
CREATE OR REPLACE FUNCTION public.candidate_get_recruitment_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'Active candidate session required.' USING errcode='42501';
  END IF;

  SELECT cp.tenant_id
  INTO v_tenant
  FROM public.candidate_profiles cp
  WHERE cp.user_id=auth.uid()
    AND cp.profile_status='active';

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Active candidate session required.' USING errcode='42501';
  END IF;

  RETURN jsonb_build_object(
    'profile',(SELECT to_jsonb(c) FROM public.candidate_profiles c WHERE c.user_id=auth.uid() AND c.tenant_id=v_tenant),
    'jobs',coalesce((
      SELECT jsonb_agg(to_jsonb(j) ORDER BY j.published_at DESC NULLS LAST,j.created_at DESC)
      FROM public.candidate_published_jobs j
      WHERE j.tenant_id=v_tenant AND j.is_published=true AND j.status='published' AND j.is_active=true
        AND (j.application_deadline IS NULL OR j.application_deadline>=current_date)
    ),'[]'::jsonb),
    'applications',coalesce((
      SELECT jsonb_agg(((to_jsonb(x) - 'status_note') || (CASE WHEN x.stage='withdrawn' THEN jsonb_build_object('status_note',x.status_note) ELSE '{}'::jsonb END)) ORDER BY x.applied_at DESC)
      FROM(
        SELECT a.*,j.title job_title,j.reference_number job_reference,j.location_name,j.department_name,
          coalesce((SELECT jsonb_agg(((to_jsonb(h) - 'note' - 'actor_user_id') || (CASE WHEN h.actor_type='candidate' THEN jsonb_build_object('note',h.note) ELSE '{}'::jsonb END)) ORDER BY h.created_at)
                    FROM public.candidate_application_stage_history h WHERE h.application_id=a.id),'[]'::jsonb) stage_history
        FROM public.job_applications a
        JOIN public.jobs j ON j.id=a.job_id
        WHERE a.candidate_user_id=auth.uid() AND a.tenant_id=v_tenant AND j.tenant_id=v_tenant
      )x
    ),'[]'::jsonb),
    'interviews',coalesce((
      SELECT jsonb_agg((to_jsonb(x) - 'panel_notes' - 'created_by') ORDER BY x.scheduled_at DESC)
      FROM(
        SELECT i.*,a.candidate_user_id,j.title job_title
        FROM public.interviews i
        JOIN public.job_applications a ON a.id=i.application_id
        JOIN public.jobs j ON j.id=a.job_id
        WHERE a.candidate_user_id=auth.uid() AND a.tenant_id=v_tenant AND j.tenant_id=v_tenant
      )x
    ),'[]'::jsonb),
    'assessments',coalesce((
      SELECT jsonb_agg((to_jsonb(x) - 'review_note' - 'reviewed_by' - 'created_by') ORDER BY x.created_at DESC)
      FROM(
        SELECT ca.*,a.candidate_user_id,j.title job_title
        FROM public.candidate_assessments ca
        JOIN public.job_applications a ON a.id=ca.application_id
        JOIN public.jobs j ON j.id=a.job_id
        WHERE a.candidate_user_id=auth.uid() AND a.tenant_id=v_tenant AND j.tenant_id=v_tenant
      )x
    ),'[]'::jsonb),
    'document_requests',coalesce((
      SELECT jsonb_agg((to_jsonb(x) - 'verification_note' - 'verified_by' - 'created_by') ORDER BY x.created_at DESC)
      FROM(
        SELECT dr.*,a.candidate_user_id,j.title job_title
        FROM public.candidate_document_requests dr
        JOIN public.job_applications a ON a.id=dr.application_id
        JOIN public.jobs j ON j.id=a.job_id
        WHERE a.candidate_user_id=auth.uid() AND a.tenant_id=v_tenant AND j.tenant_id=v_tenant
      )x
    ),'[]'::jsonb),
    'offers',coalesce((
      SELECT jsonb_agg((to_jsonb(x) - 'issued_by') ORDER BY x.issued_at DESC)
      FROM(
        SELECT o.*,a.candidate_user_id,j.title job_title,j.department_name,j.location_name
        FROM public.job_offers o
        JOIN public.job_applications a ON a.id=o.application_id
        JOIN public.jobs j ON j.id=a.job_id
        WHERE a.candidate_user_id=auth.uid() AND a.tenant_id=v_tenant AND j.tenant_id=v_tenant
      )x
    ),'[]'::jsonb)
  );
END;
$function$;
