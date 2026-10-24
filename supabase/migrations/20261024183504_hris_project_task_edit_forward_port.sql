-- Phase 11 forward-only replay of canonical 20261013224251_hris_project_task_edit_workflow.sql.
-- Source Git blob: c7ffda78acee27039522e55c1556a6f49f786543
-- SQL below copied verbatim; no application behavior changes in this PR.
-- Replacement target: xfuxnljfrgvusbrpvxpa ONLY. Original project is immutable.
-- Apply strictly in filename order AFTER Phase 10, only after isolated proof and review.
-- Preserve historical Auth references; no user import or cleanup.
-- Phase 11 task maintenance: allow the assigned Project Manager to correct
-- unfinished task details without changing assignments or review obligations.
BEGIN;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.project_tasks
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE public.project_tasks
  ALTER COLUMN updated_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.hris_update_project_task(
  p_tenant_id uuid,
  p_task_id uuid,
  p_title text,
  p_description text,
  p_due_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_task public.project_tasks%ROWTYPE;
  v_today date;
BEGIN
  SELECT t.* INTO v_task
  FROM public.project_tasks t
  WHERE t.tenant_id = p_tenant_id AND t.id = p_task_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.hris_can_manage_project_tasks(p_tenant_id, v_task.project_id) THEN
    RAISE EXCEPTION 'Only the assigned Project Manager can edit this task.' USING errcode = '42501';
  END IF;
  IF v_task.status = 'completed' THEN
    RAISE EXCEPTION 'Completed tasks cannot be edited.' USING errcode = '42501';
  END IF;

  SELECT (now() AT TIME ZONE COALESCE(t.timezone, 'UTC'))::date INTO v_today
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND t.is_active IS TRUE;

  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
      OR length(COALESCE(p_description, '')) > 4000
      OR (p_due_date IS NOT NULL AND p_due_date < v_today AND p_due_date IS DISTINCT FROM v_task.due_date) THEN
    RAISE EXCEPTION 'Task title, description, or due date is invalid.' USING errcode = '22023';
  END IF;

  UPDATE public.project_tasks t
  SET title = btrim(p_title),
      description = COALESCE(p_description, ''),
      due_date = p_due_date,
      updated_at = clock_timestamp()
  WHERE t.tenant_id = p_tenant_id AND t.id = p_task_id
  RETURNING t.* INTO v_task;

  RETURN to_jsonb(v_task);
END
$function$;

REVOKE ALL ON FUNCTION public.hris_update_project_task(uuid, uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_update_project_task(uuid, uuid, text, text, date) TO authenticated, service_role;

COMMIT;
