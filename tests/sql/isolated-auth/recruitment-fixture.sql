-- Minimal synthetic Candidate tables for local HRIS recruitment-pipeline tests.
-- This fixture contains no production data and is only loaded into the disposable stack.
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  reference_number text NOT NULL,
  title text NOT NULL,
  department_name text,
  department_id uuid,
  status text NOT NULL DEFAULT 'draft',
  is_published boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  application_deadline date
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
  actor_type text NOT NULL CONSTRAINT candidate_application_stage_history_actor_check
    CHECK (actor_type = ANY (ARRAY['candidate','recruitment','system']::text[])),
  CONSTRAINT candidate_application_stage_history_stage_check
    CHECK (stage = ANY (ARRAY[
      'applied','screening','shortlisted','assessment','interview','final_review',
      'offer','offer_accepted','offer_declined','hired','rejected','withdrawn'
    ]::text[])),
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.candidate_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL DEFAULT 'system',
  related_application_id uuid REFERENCES public.job_applications(id) ON DELETE CASCADE,
  related_job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  action_view text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.candidate_profiles (
  user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  profile_status text NOT NULL DEFAULT 'active'
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
  deadline_date date NOT NULL,
  status text NOT NULL,
  submission_data jsonb,
  submitted_at timestamptz,
  review_note text,
  reviewed_at timestamptz,
  created_by uuid,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_applications_tenant_applied_idx
  ON public.job_applications(tenant_id,applied_at DESC,id);
CREATE INDEX candidate_stage_history_application_idx
  ON public.candidate_application_stage_history(application_id,created_at,id);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_application_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.jobs,public.job_applications,public.candidate_application_stage_history,
  public.interviews,
  public.candidate_profiles,public.candidate_assessments,public.candidate_notifications
  FROM PUBLIC,anon,authenticated;
GRANT ALL PRIVILEGES ON TABLE public.jobs,public.job_applications,public.candidate_application_stage_history
  TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.interviews,public.candidate_profiles,public.candidate_assessments,
  public.candidate_notifications TO service_role;
