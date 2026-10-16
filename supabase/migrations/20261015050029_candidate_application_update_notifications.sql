-- Persist candidate-owned notifications for recruitment-authored application
-- history events. The notification contains no recruiter note or reviewer ID.
BEGIN;

-- Keep the actual application stage in history. These values already exist in
-- the verified job application contract; several were missing from the older
-- stage-history allow-list.
ALTER TABLE public.candidate_application_stage_history
  DROP CONSTRAINT IF EXISTS candidate_application_stage_history_stage_check;
ALTER TABLE public.candidate_application_stage_history
  ADD CONSTRAINT candidate_application_stage_history_stage_check
  CHECK (stage = ANY (ARRAY[
    'draft','applied','submitted','under_review','screening','shortlisted',
    'assessment','assessment_pending','interview','interview_scheduled',
    'final_review','offer','offer_extended','offer_accepted','offer_declined',
    'hired','rejected','withdrawn'
  ]::text[])) NOT VALID;
ALTER TABLE public.candidate_application_stage_history
  VALIDATE CONSTRAINT candidate_application_stage_history_stage_check;

-- Older installations already have this table. The IF NOT EXISTS definition
-- also makes the notification contract explicit for isolated test databases.
CREATE TABLE IF NOT EXISTS public.candidate_notifications (
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

ALTER TABLE public.candidate_notifications
  ADD COLUMN IF NOT EXISTS related_stage_history_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.candidate_notifications'::regclass
      AND conname='candidate_notifications_stage_history_fk'
  ) THEN
    ALTER TABLE public.candidate_notifications
      ADD CONSTRAINT candidate_notifications_stage_history_fk
      FOREIGN KEY (related_stage_history_id)
      REFERENCES public.candidate_application_stage_history(id)
      ON DELETE CASCADE;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS candidate_notifications_stage_history_uidx
  ON public.candidate_notifications(related_stage_history_id)
  WHERE related_stage_history_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS candidate_notifications_owner_created_idx
  ON public.candidate_notifications(candidate_user_id,created_at DESC,id DESC);

ALTER TABLE public.candidate_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.candidate_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE(is_read) ON TABLE public.candidate_notifications TO authenticated;

DROP POLICY IF EXISTS candidate_notifications_read_own ON public.candidate_notifications;
CREATE POLICY candidate_notifications_read_own
  ON public.candidate_notifications FOR SELECT TO authenticated
  USING (candidate_user_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS candidate_notifications_update_own ON public.candidate_notifications;
CREATE POLICY candidate_notifications_update_own
  ON public.candidate_notifications FOR UPDATE TO authenticated
  USING (candidate_user_id=(SELECT auth.uid()))
  WITH CHECK (candidate_user_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.hris_notify_candidate_application_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_candidate_user_id uuid;
  v_job_id uuid;
BEGIN
  IF NEW.actor_type <> 'recruitment' THEN
    RETURN NEW;
  END IF;

  SELECT a.candidate_user_id,a.job_id
  INTO v_candidate_user_id,v_job_id
  FROM public.job_applications a
  JOIN public.jobs j ON j.id=a.job_id AND j.tenant_id=a.tenant_id
  WHERE a.id=NEW.application_id;

  IF v_candidate_user_id IS NULL OR v_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.candidate_notifications(
    candidate_user_id,title,message,notification_type,
    related_application_id,related_job_id,action_view,related_stage_history_id
  ) VALUES (
    v_candidate_user_id,
    'Application update',
    'Your application has a new update. Open the application timeline to review it.',
    'application_update',
    NEW.application_id,v_job_id,'applications',NEW.id
  )
  ON CONFLICT (related_stage_history_id)
    WHERE related_stage_history_id IS NOT NULL
    DO NOTHING;

  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.hris_notify_candidate_application_stage() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS candidate_application_stage_notification
  ON public.candidate_application_stage_history;
CREATE TRIGGER candidate_application_stage_notification
  AFTER INSERT ON public.candidate_application_stage_history
  FOR EACH ROW
  EXECUTE FUNCTION private.hris_notify_candidate_application_stage();

COMMIT;
