-- Record the candidate's initial application event so the Candidate timeline
-- can render persisted history instead of manufacturing screening milestones.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_record_candidate_application_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Only the authenticated owner-facing application flow creates this event.
  -- Administrative/import inserts remain outside this candidate timeline.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM NEW.candidate_user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.candidate_application_stage_history (
    id, application_id, stage, note, actor_type, actor_user_id, created_at
  ) VALUES (
    gen_random_uuid(), NEW.id, COALESCE(NULLIF(NEW.stage, ''), 'applied'),
    'Application submitted.', 'candidate', auth.uid(), COALESCE(NEW.applied_at, now())
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_record_candidate_application_submission()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hris_candidate_application_initial_history ON public.job_applications;
CREATE TRIGGER hris_candidate_application_initial_history
  AFTER INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.hris_record_candidate_application_submission();

COMMIT;
