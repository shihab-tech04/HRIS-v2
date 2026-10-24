-- Synchronize the new HRIS QA project's verified jobs ACL/RLS repair into
-- the owned WS02 migration history. Applied destination-only 22 Oct 2026.
-- Existing Candidate public/related access must remain intact.
-- Never grant direct application-table SELECT to untrusted browser clients.
BEGIN;

DO $validate$
BEGIN
  IF to_regclass('public.jobs') IS NULL
     OR to_regclass('public.candidate_profiles') IS NULL
     OR to_regclass('public.candidate_saved_jobs') IS NULL
     OR to_regclass('public.job_applications') IS NULL
     OR to_regprocedure('public.is_live_session()') IS NULL
     OR to_regprocedure('public.has_tenant_permission(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'HRIS jobs reader requires existing guarded Auth, candidate and tenant contracts';
  END IF;
END
$validate$;

-- No backend writes are exposed by this table grant.
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.jobs TO authenticated;

-- Ordinary candidate reads previously referenced job_applications inside an
-- RLS predicate. Without base-table SELECT that raised SQLSTATE 42501.
-- SECURITY DEFINER encapsulates only the candidate's own linkage check, and
-- returns a boolean, never private application data.
CREATE OR REPLACE FUNCTION private.hris_candidate_can_read_related_job(
  p_job_id uuid, p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $body$
  SELECT p_job_id IS NOT NULL
    AND p_tenant_id IS NOT NULL
    AND public.is_live_session()
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.candidate_profiles cp
      WHERE cp.user_id = auth.uid()
        AND cp.tenant_id = p_tenant_id
        AND cp.profile_status = 'active'
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.candidate_saved_jobs sj
        WHERE sj.job_id = p_job_id
          AND sj.candidate_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.job_applications app
        WHERE app.job_id = p_job_id
          AND app.tenant_id = p_tenant_id
          AND app.candidate_user_id = auth.uid()
      )
    );
$body$;

REVOKE ALL ON FUNCTION private.hris_candidate_can_read_related_job(uuid,uuid)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.hris_candidate_can_read_related_job(uuid,uuid)
  TO authenticated;

DROP POLICY IF EXISTS jobs_candidate_related_read ON public.jobs;
CREATE POLICY jobs_candidate_related_read ON public.jobs
  FOR SELECT TO authenticated
  USING (private.hris_candidate_can_read_related_job(jobs.id, jobs.tenant_id));

DROP POLICY IF EXISTS jobs_staff_tenant_read ON public.jobs;
CREATE POLICY jobs_staff_tenant_read ON public.jobs
  FOR SELECT TO authenticated
  USING (
    public.is_live_session()
    AND public.has_tenant_permission(jobs.tenant_id, 'recruitment.view')
  );

-- Existing jobs_public_read, staff write policies and service-role rights stay
-- untouched. In particular no application-table permissions are added.
COMMIT;
