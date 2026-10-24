-- Forward-only source-identical recovery of 20261013130829_hris_recruitment_pipeline_read.sql.
-- Replacement HRIS project xfuxnljfrgvusbrpvxpa only; the original project is immutable.
-- The replacement migration history has advanced beyond the historical version; this
-- later version preserves source provenance without fabricating a historical ledger row.
-- Tenant-authorized, read-only recruiter queue. Candidate-visible stage
-- milestones are exposed; application answers, files, private notes, and
-- reviewer identities remain outside this surface.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_recruitment_pipeline(
  p_tenant_id uuid,
  p_search text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_stage text := NULLIF(btrim(COALESCE(p_stage, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_payload jsonb;
BEGIN
  IF NOT public.is_live_session()
    OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
    OR NOT (
      public.hris_admin_can_read_tenant(p_tenant_id, 'recruitment.view')
      OR public.hris_admin_can_read_tenant(p_tenant_id, 'recruitment.manage')
    ) THEN
    RAISE EXCEPTION 'Authorized recruitment membership required.' USING errcode='42501';
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT a.id AS application_id,
      a.full_name AS candidate_name,
      a.stage,
      a.applied_at,
      j.id AS job_id,
      j.reference_number AS job_reference,
      j.title AS job_title
    FROM public.job_applications a
    JOIN public.jobs j ON j.tenant_id=a.tenant_id AND j.id=a.job_id
    WHERE a.tenant_id=p_tenant_id
      AND (v_stage IS NULL OR a.stage=v_stage)
      AND (v_search IS NULL OR concat_ws(' ',a.full_name,j.title,j.reference_number,a.stage) ILIKE '%' || v_search || '%')
  ),
  page AS (
    SELECT s.* FROM scoped s
    ORDER BY s.applied_at DESC NULLS LAST,s.application_id
    LIMIT v_limit OFFSET v_offset
  ),
  stages AS (
    SELECT DISTINCT a.stage
    FROM public.job_applications a
    JOIN public.jobs j ON j.tenant_id=a.tenant_id AND j.id=a.job_id
    WHERE a.tenant_id=p_tenant_id
  )
  SELECT jsonb_build_object(
    'applications',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'application_id',p.application_id,
        'candidate_name',p.candidate_name,
        'job_id',p.job_id,
        'job_reference',p.job_reference,
        'job_title',p.job_title,
        'stage',p.stage,
        'applied_at',p.applied_at,
        'milestones',COALESCE((
          SELECT jsonb_agg(jsonb_build_object('stage',h.stage,'created_at',h.created_at) ORDER BY h.created_at,h.id)
          FROM public.candidate_application_stage_history h
          WHERE h.application_id=p.application_id
        ),'[]'::jsonb)
      ) ORDER BY p.applied_at DESC NULLS LAST,p.application_id)
      FROM page p
    ),'[]'::jsonb),
    'available_stages',COALESCE((SELECT jsonb_agg(s.stage ORDER BY s.stage) FROM stages s),'[]'::jsonb),
    'total_count',(SELECT count(*)::integer FROM scoped),
    'limit',v_limit,
    'offset',v_offset
  ) INTO v_payload;

  RETURN v_payload;
END
$function$;

REVOKE ALL ON FUNCTION public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer) TO authenticated,service_role;

COMMIT;
