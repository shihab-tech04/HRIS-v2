-- Synthetic Supabase Auth fixture for candidate_get_recruitment_context.
-- Columns used by this fixture mirror the production information_schema
-- contract; rows are created only by run-local-tenant-auth.mjs.
CREATE TABLE IF NOT EXISTS public.roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO public.roles(id,name,active) VALUES
  ('qa_recruitment_manager','Recruitment Manager',true),
  ('qa_recruitment_viewer','Recruitment Viewer',true),
  ('qa_employee_manager','Employee Manager',true)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,active=EXCLUDED.active;

CREATE TABLE public.candidate_profiles (
  user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  phone text,
  profile_status text NOT NULL,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  current_location text,
  years_experience numeric,
  headline text,
  bio text,
  skills text[] NOT NULL DEFAULT '{}',
  profile_data jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.candidate_published_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  reference_number text,
  title text,
  department_name text,
  team_name text,
  location_name text,
  workplace_type text,
  employment_type text,
  experience_level text,
  vacancy_count integer,
  min_experience_years numeric,
  education_requirement text,
  skills text[], responsibilities text[], requirements text[], benefits text[],
  salary_currency text, salary_min numeric, salary_max numeric,
  is_salary_published boolean,
  posted_date date,
  application_deadline date,
  required_documents text[], screening_questions jsonb,
  instructions text,
  status text,
  is_published boolean,
  is_active boolean,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  reference_number text NOT NULL,
  title text NOT NULL,
  department_name text,
  team_name text,
  location_name text,
  workplace_type text NOT NULL,
  employment_type text NOT NULL,
  experience_level text,
  vacancy_count integer NOT NULL DEFAULT 1,
  min_experience_years numeric NOT NULL DEFAULT 0,
  education_requirement text,
  skills text[] NOT NULL DEFAULT '{}',
  responsibilities text[] NOT NULL DEFAULT '{}',
  requirements text[] NOT NULL DEFAULT '{}',
  benefits text[] NOT NULL DEFAULT '{}',
  salary_currency text NOT NULL DEFAULT 'BDT',
  salary_min numeric,
  salary_max numeric,
  is_salary_published boolean NOT NULL DEFAULT false,
  posted_date date,
  application_deadline date,
  required_documents text[] NOT NULL DEFAULT '{}',
  screening_questions jsonb NOT NULL DEFAULT '[]',
  instructions text,
  status text NOT NULL DEFAULT 'open',
  is_published boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL,
  candidate_user_id uuid NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  years_experience numeric,
  skills text[] NOT NULL DEFAULT '{}',
  cv_url text,
  cover_letter text,
  stage text NOT NULL DEFAULT 'applied',
  status_note text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  application_data jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.candidate_application_stage_history (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL,
  stage text NOT NULL,
  note text,
  actor_type text NOT NULL CHECK (actor_type = ANY (ARRAY['candidate','recruitment','system']::text[])),
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.interviews (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  interview_type text NOT NULL,
  location_or_link text,
  panel_notes text,
  status text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  candidate_response text NOT NULL DEFAULT 'invited',
  candidate_response_note text,
  candidate_proposed_times text,
  candidate_responded_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 30,
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  instructions text,
  panel_members text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE public.candidate_assessments (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL,
  title text NOT NULL,
  assessment_type text NOT NULL,
  instructions text NOT NULL,
  attachment_path text,
  deadline_date date NOT NULL,
  status text NOT NULL,
  submission_data jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  review_note text,
  reviewed_by uuid
);

CREATE TABLE public.candidate_document_requests (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL,
  document_title text NOT NULL,
  description text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL,
  submitted_file_name text,
  submitted_file_path text,
  submitted_at timestamptz,
  verified_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  verification_note text,
  verified_by uuid
);

CREATE TABLE public.job_offers (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL,
  offered_title text,
  salary_amount numeric,
  salary_currency text NOT NULL,
  proposed_joining_date date,
  terms text,
  status text NOT NULL,
  issued_by uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  response_deadline date,
  response_note text,
  acceptance_signature text,
  pay_period text NOT NULL
);

CREATE TABLE public.candidate_application_drafts (id uuid PRIMARY KEY, note text);
CREATE TABLE public.candidate_cvs (id uuid PRIMARY KEY, note text);
CREATE TABLE public.candidate_job_alerts (id uuid PRIMARY KEY, note text);
CREATE TABLE public.candidate_notifications (id uuid PRIMARY KEY, note text);
CREATE TABLE public.candidate_saved_jobs (id uuid PRIMARY KEY, note text);
CREATE TABLE public.onboarding_handoffs (id uuid PRIMARY KEY, note text);

ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_published_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_application_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_application_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_saved_jobs ENABLE ROW LEVEL SECURITY;

GRANT ALL PRIVILEGES ON TABLE
  public.candidate_application_stage_history, public.job_applications,
  public.interviews, public.candidate_assessments,
  public.candidate_document_requests, public.job_offers, public.onboarding_handoffs
TO PUBLIC, anon, authenticated, service_role;

-- The inherited legacy migration references onboarding_handoffs too.
ALTER TABLE public.onboarding_handoffs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, TRUNCATE ON TABLE
  public.candidate_application_drafts, public.candidate_cvs,
  public.candidate_job_alerts, public.candidate_notifications,
  public.candidate_saved_jobs, public.onboarding_handoffs
TO anon;
GRANT SELECT ON TABLE
  public.candidate_application_drafts, public.candidate_cvs,
  public.candidate_job_alerts, public.candidate_notifications,
  public.candidate_saved_jobs, public.onboarding_handoffs
TO authenticated;

-- Plain PostgreSQL CI gets claim helpers; local Supabase keeps its real ones.
CREATE SCHEMA IF NOT EXISTS auth;
DO $do$
BEGIN
  IF to_regclass('auth.sessions') IS NULL THEN
    EXECUTE 'CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz)';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid $$';
  END IF;
  IF to_regprocedure('auth.jwt()') IS NULL THEN
    EXECUTE 'CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb, ''{}''::jsonb) $$';
  END IF;
END $do$;

-- The earlier Phase 2A fixture only exposes email from auth.jwt(). Candidate
-- tenant tests also need the synthetic session_id claim for is_live_session().
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    || jsonb_build_object('email', current_setting('request.jwt.claim.email', true));
$function$;

CREATE OR REPLACE FUNCTION public.is_live_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'auth'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id = nullif(auth.jwt()->>'session_id','')::uuid
        AND s.user_id = auth.uid()
        AND (s.not_after IS NULL OR s.not_after > now())
    );
$function$;
REVOKE ALL ON FUNCTION public.is_live_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_live_session() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.candidate_get_recruitment_context()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
AS $function$ SELECT '{}'::jsonb; $function$;
REVOKE ALL ON FUNCTION public.candidate_get_recruitment_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_get_recruitment_context() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_candidate_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
AS $function$ SELECT NULL::jsonb; $function$;
REVOKE ALL ON FUNCTION public.get_my_candidate_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_candidate_profile() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.candidate_update_profile(p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
AS $function$ SELECT NULL::jsonb; $function$;
REVOKE ALL ON FUNCTION public.candidate_update_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_update_profile(jsonb) TO authenticated, service_role;
