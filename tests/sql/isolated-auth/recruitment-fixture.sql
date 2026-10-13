-- Minimal synthetic Candidate tables for local HRIS recruitment-pipeline tests.
-- This fixture contains no production data and is only loaded into the disposable stack.
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  reference_number text NOT NULL,
  title text NOT NULL
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
  stage text NOT NULL,
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
  actor_type text NOT NULL,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_applications_tenant_applied_idx
  ON public.job_applications(tenant_id,applied_at DESC,id);
CREATE INDEX candidate_stage_history_application_idx
  ON public.candidate_application_stage_history(application_id,created_at,id);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_application_stage_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.jobs,public.job_applications,public.candidate_application_stage_history
  FROM PUBLIC,anon,authenticated;
GRANT ALL PRIVILEGES ON TABLE public.jobs,public.job_applications,public.candidate_application_stage_history
  TO service_role;
