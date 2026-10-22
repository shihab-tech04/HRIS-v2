-- Disposable PostgreSQL 17 acceptance for the scoped jobs SQL migration.
-- Neither hosted Supabase project is used by this test.
\set ON_ERROR_STOP on
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  title text NOT NULL,
  status text DEFAULT 'draft',
  is_published boolean DEFAULT false,
  is_active boolean DEFAULT true,
  application_deadline date
);
CREATE TABLE public.candidate_profiles (
  user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  profile_status text NOT NULL
);
CREATE TABLE public.candidate_saved_jobs (
  job_id uuid NOT NULL,
  candidate_user_id uuid NOT NULL
);
CREATE TABLE public.job_applications (
  job_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  candidate_user_id uuid NOT NULL
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
CREATE OR REPLACE FUNCTION public.is_live_session()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.live',true),'')='yes'
    AND auth.uid() IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public.has_tenant_permission(p_tenant_id uuid,p_permission_id text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_live_session()
    AND p_permission_id='recruitment.view'
    AND p_tenant_id=nullif(current_setting('test.staff_tenant',true),'')::uuid;
$$;

-- Setup two tenants, two actual candidate identifiers and private jobs.
INSERT INTO public.jobs(id,tenant_id,title,status,is_published)
VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','Tenant A private','draft',false),
 ('bbbbbbbb-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-000000000002','Tenant B private','draft',false);
INSERT INTO public.candidate_profiles(user_id,tenant_id,profile_status)
VALUES
 ('aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-0000-4000-8000-000000000001','active'),
 ('bbbbbbbb-4444-4444-8444-444444444444','bbbbbbbb-0000-4000-8000-000000000002','active');
INSERT INTO public.candidate_saved_jobs(job_id,candidate_user_id)
VALUES ('aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-3333-4333-8333-333333333333');
INSERT INTO public.job_applications(job_id,tenant_id,candidate_user_id)
VALUES ('bbbbbbbb-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-4444-4444-8444-444444444444');

-- Real migration, executed in disposable database only.
\i supabase/migrations/20261022153000_hris_jobs_authenticated_tenant_read.sql

DO $acl$
BEGIN
  IF NOT has_table_privilege('authenticated','public.jobs','SELECT')
    OR has_table_privilege('authenticated','public.job_applications','SELECT')
    OR has_table_privilege('anon','public.jobs','SELECT')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.jobs'::regclass)
  THEN
    RAISE EXCEPTION 'ACL/RLS denied: jobs read must be scoped and applications private';
  END IF;
END
$acl$;
\echo ACL_AND_RLS_PASS

-- Scenario 1: unauthenticated request is refused private jobs even with
-- a configured staff tenant. A role alone is not a valid live session.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3333-4333-8333-333333333333',true);
SELECT set_config('test.live','no',true);
SELECT set_config('test.staff_tenant','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.jobs)<>0 THEN RAISE EXCEPTION 'No-session private jobs leak'; END IF;
END $$;
ROLLBACK;

-- Scenario 2: Tenant A candidate sees only their saved Tenant A job.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3333-4333-8333-333333333333',true);
SELECT set_config('test.live','yes',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.jobs)<>1
    OR NOT EXISTS(SELECT 1 FROM public.jobs WHERE title='Tenant A private')
 THEN RAISE EXCEPTION 'Candidate A cross-tenant read or own saved-job denial'; END IF;
END $$;
ROLLBACK;

-- Scenario 3: Tenant B candidate sees only their related application job.
-- The caller is not granted direct SELECT on private application rows.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-4444-4444-8444-444444444444',true);
SELECT set_config('test.live','yes',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.jobs)<>1
    OR NOT EXISTS(SELECT 1 FROM public.jobs WHERE title='Tenant B private')
 THEN RAISE EXCEPTION 'Candidate B cross-tenant read or own applied-job denial'; END IF;
 BEGIN
   PERFORM 1 FROM public.job_applications LIMIT 1;
   RAISE EXCEPTION 'Candidate can directly read private application rows';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
ROLLBACK;

-- Scenario 4: scoped HR staff can see only the tenant they manage.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3333-4333-8333-333333333333',true);
SELECT set_config('test.live','yes',true);
SELECT set_config('test.staff_tenant','bbbbbbbb-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.jobs)<>2
 THEN RAISE EXCEPTION 'Scoped B staff expected B plus their own A candidate saved job'; END IF;
END $$;
ROLLBACK;

-- Scenario 5: unrelated authenticated user cannot see either tenant's jobs.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-5555-4555-8555-555555555555',true);
SELECT set_config('test.live','yes',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.jobs)<>0
 THEN RAISE EXCEPTION 'Unscoped user saw private tenant jobs'; END IF;
END $$;
ROLLBACK;
\echo HRIS_JOBS_TENANT_ISOLATION_PASS=5 ACL=restricted source_migration=20261022153000
