-- WS02: recruitment pipeline listing — single-feature guarded source recovery.
-- Staging only; never run without WS05 release gates and encrypted hosted backup/restore proof.
-- Replacement hosted project xfuxnljfrgvusbrpvxpa; original must remain untouched.
-- Accepted source: supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
DECLARE v_missing text;
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'STOP: PostgreSQL 17 verified baseline required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261022142012') THEN
    RAISE EXCEPTION 'STOP: replacement clone baseline missing';
  END IF;
  IF to_regprocedure('public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: a pipeline function already exists; compare it instead of overwriting';
  END IF;
  IF to_regprocedure('public.is_live_session()') IS NULL
    OR to_regprocedure('public.hris_admin_can_read_tenant(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'STOP: required Auth/tenant authority helpers missing';
  END IF;
  IF (SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin) <> 1 THEN
    RAISE EXCEPTION 'STOP: protected Super Admin invariant has changed';
  END IF;
  SELECT string_agg(req.table_name || '.' || req.column_name, ', ' ORDER BY req.table_name,req.column_name)
  INTO v_missing
  FROM (VALUES
    ('jobs','id'),('jobs','tenant_id'),('jobs','reference_number'),('jobs','title'),
    ('job_applications','id'),('job_applications','tenant_id'),('job_applications','job_id'),
    ('job_applications','full_name'),('job_applications','stage'),('job_applications','applied_at'),
    ('candidate_application_stage_history','id'),('candidate_application_stage_history','application_id'),
    ('candidate_application_stage_history','stage'),('candidate_application_stage_history','created_at')
  ) req(table_name,column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=req.table_name
    AND a.attname=req.column_name AND a.attnum>0 AND NOT a.attisdropped
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: incompatible schema, missing %',v_missing;
  END IF;
END
$preflight$;

-- SOURCE BODY IS BYTE-FOR-BYTE IDENTICAL BETWEEN CREATE FUNCTION AND ROLE GRANTS.
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

DO $postconditions$
DECLARE v_oid oid := to_regprocedure('public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer)');
BEGIN
  IF v_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=v_oid AND prosecdef AND provolatile='s')
    OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
    OR has_function_privilege('anon',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'STOP: installed function signature, stability or privileges mismatch';
  END IF;
END
$postconditions$;
COMMIT;
