-- Forward-only replay of canonical 20261016033936_hris_project_scoped_timesheet_review.sql for replacement HRIS.
-- Source Git blob: fcc6cc9742b0afd863b5dad263585852de73644e
-- Exact canonical SQL body below (unchanged); intended for reviewed versioned activation.
-- Target: xfuxnljfrgvusbrpvxpa ONLY. Do not modify original oslgwxaqfbteqtwqvdzs.
-- Dependency: Phase 10 and five Phase 11 task/peer-review migrations already applied.
-- NO hosted activation before PG17, UI/API signature regression checks and recovery gate.
-- Project-scoped timesheet review. This release-candidate migration is covered
-- by the disposable Auth/Postgres acceptance workflow; it is not production-applied.

ALTER TABLE public.timesheet_entries
  ADD COLUMN IF NOT EXISTS project_allocation_id uuid
    REFERENCES public.project_allocations(id) ON DELETE RESTRICT;

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS timesheets_tenant_id_id_key
  ON public.timesheets (tenant_id, id);

CREATE TABLE IF NOT EXISTS public.timesheet_project_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  timesheet_id uuid NOT NULL,
  project_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewer_employee_id uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, timesheet_id, project_id),
  FOREIGN KEY (tenant_id, timesheet_id)
    REFERENCES public.timesheets (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.projects (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reviewer_employee_id)
    REFERENCES public.employees (tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'pending' AND reviewer_employee_id IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
      OR (status = 'approved' AND reviewer_employee_id IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
      OR (status = 'rejected' AND reviewer_employee_id IS NOT NULL AND reviewed_at IS NOT NULL
          AND rejection_reason IS NOT NULL AND length(btrim(rejection_reason)) > 0))
);

CREATE TABLE IF NOT EXISTS public.timesheet_project_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  timesheet_id uuid NOT NULL,
  project_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  event_type text NOT NULL CHECK (event_type IN ('submitted','approved','rejected','corrected_resubmitted')),
  actor_employee_id uuid,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, timesheet_id)
    REFERENCES public.timesheets (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.projects (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_employee_id)
    REFERENCES public.employees (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS timesheet_project_reviews_inbox_idx
  ON public.timesheet_project_reviews (tenant_id, project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS timesheet_project_review_events_scope_idx
  ON public.timesheet_project_review_events (tenant_id, timesheet_id, project_id, occurred_at);

ALTER TABLE public.timesheet_project_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_project_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.timesheet_project_reviews, public.timesheet_project_review_events
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.timesheets, public.timesheet_entries FROM PUBLIC, anon, authenticated;

-- Keep the table contract default-deny. Reads and writes are returned only by
-- the tenant/employee/project-checked RPCs below.

DROP FUNCTION IF EXISTS public.hris_get_my_timesheet_context(uuid);
CREATE FUNCTION public.hris_get_my_timesheet_context(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_context jsonb;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode = '42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'employee_id', v_employee_id,
    'activities', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id, 'activity_type', a.activity_type, 'name', a.name, 'code', a.code
      ) ORDER BY a.activity_type, a.name)
      FROM public.timesheet_activities a
      WHERE a.tenant_id = p_tenant_id AND a.active IS TRUE
    ), '[]'::jsonb),
    'allocations', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id, 'project_id', p.id, 'project_name', p.name, 'project_code', p.code,
        'assigned_date', a.assigned_date, 'release_date', a.release_date
      ) ORDER BY p.name, a.assigned_date)
      FROM public.project_allocations a
      JOIN public.projects p ON p.tenant_id = a.tenant_id AND p.id = a.project_id
      WHERE a.tenant_id = p_tenant_id AND a.employee_id = v_employee_id
    ), '[]'::jsonb),
    'timesheets', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', t.id, 'period_type', t.period_type, 'period_start', t.period_start,
        'period_end', t.period_end, 'status', t.status, 'version', t.version,
        'submitted_at', t.submitted_at, 'resolved_at', t.resolved_at,
        'resolution_note', t.resolution_note,
        'project_reviews', COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'project_id', r.project_id, 'project_name', p.name, 'revision', r.revision,
            'status', r.status, 'reviewed_at', r.reviewed_at, 'rejection_reason', r.rejection_reason,
            'events', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'revision', ev.revision, 'event_type', ev.event_type, 'reason', ev.reason,
              'occurred_at', ev.occurred_at
            ) ORDER BY ev.occurred_at, ev.id) FROM public.timesheet_project_review_events ev
              WHERE ev.tenant_id=r.tenant_id AND ev.timesheet_id=r.timesheet_id AND ev.project_id=r.project_id), '[]'::jsonb)
          ) ORDER BY p.name)
          FROM public.timesheet_project_reviews r
          JOIN public.projects p ON p.tenant_id = r.tenant_id AND p.id = r.project_id
          WHERE r.tenant_id = t.tenant_id AND r.timesheet_id = t.id
        ), '[]'::jsonb),
        'entries', COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', e.id, 'activity_id', e.activity_id, 'activity_name', a.name,
            'activity_code', a.code, 'activity_type', a.activity_type,
            'work_date', e.work_date, 'hours', e.hours, 'note', e.note,
            'project_allocation_id', e.project_allocation_id,
            'project_id', pa.project_id, 'project_name', p.name
          ) ORDER BY e.work_date, a.name, e.id)
          FROM public.timesheet_entries e
          JOIN public.timesheet_activities a ON a.id = e.activity_id AND a.tenant_id = t.tenant_id
          LEFT JOIN public.project_allocations pa ON pa.id = e.project_allocation_id AND pa.tenant_id = t.tenant_id
          LEFT JOIN public.projects p ON p.id = pa.project_id AND p.tenant_id = pa.tenant_id
          WHERE e.timesheet_id = t.id
        ), '[]'::jsonb)
      ) ORDER BY t.period_start DESC, t.created_at DESC)
      FROM public.timesheets t
      WHERE t.tenant_id = p_tenant_id AND t.employee_id = v_employee_id
    ), '[]'::jsonb)
  ) INTO v_context;
  RETURN v_context;
END;
$function$;

DROP FUNCTION IF EXISTS public.hris_save_my_timesheet(uuid, uuid, text, date, date, jsonb);
CREATE FUNCTION public.hris_save_my_timesheet(
  p_tenant_id uuid, p_id uuid, p_period_type text, p_start date, p_end date,
  p_entries jsonb, p_expected_version integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_timesheet_id uuid;
  v_status text;
  v_version integer;
  v_entry jsonb;
  v_activity_id uuid;
  v_work_date date;
  v_hours numeric;
  v_note text;
  v_allocation_id uuid;
BEGIN
  IF NOT public.is_live_session() THEN
    RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode = '42501';
  END IF;
  IF p_period_type IS NULL OR p_period_type NOT IN ('daily','weekly') OR p_start IS NULL OR p_end IS NULL
      OR p_end < p_start OR p_end - p_start > 6 OR (p_period_type = 'daily' AND p_start <> p_end) THEN
    RAISE EXCEPTION 'Choose a valid daily or seven-day timesheet period.' USING errcode = '22000';
  END IF;
  IF p_entries IS NULL OR pg_catalog.jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Timesheet entries must be a list.' USING errcode = '22000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_entries) item(value)
    WHERE pg_catalog.jsonb_typeof(item.value) <> 'object'
      OR NULLIF(item.value->>'activity_id','') IS NULL
      OR NULLIF(item.value->>'work_date','') IS NULL
      OR NULLIF(item.value->>'hours','') IS NULL
  ) THEN RAISE EXCEPTION 'Each entry needs an activity, work date, and hours.' USING errcode = '22000'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_entries) item(value)
    WHERE (item.value->>'work_date')::date < p_start OR (item.value->>'work_date')::date > p_end
      OR (item.value->>'hours')::numeric <= 0 OR (item.value->>'hours')::numeric > 24
  ) THEN RAISE EXCEPTION 'Entry dates must be inside the period and hours must be between 0 and 24.' USING errcode = '22000'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_entries) item(value)
    GROUP BY (item.value->>'work_date')::date
    HAVING sum((item.value->>'hours')::numeric) > 24
  ) THEN RAISE EXCEPTION 'A day cannot contain more than 24 total hours.' USING errcode = '22000'; END IF;

  IF p_id IS NULL THEN
    IF p_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'A new draft must not include a version.' USING errcode = '22000';
    END IF;
    INSERT INTO public.timesheets(tenant_id,employee_id,period_type,period_start,period_end,status)
    VALUES (p_tenant_id,v_employee_id,p_period_type,p_start,p_end,'draft') RETURNING id INTO v_timesheet_id;
  ELSE
    SELECT t.status,t.version INTO v_status,v_version FROM public.timesheets t
    WHERE t.id=p_id AND t.tenant_id=p_tenant_id AND t.employee_id=v_employee_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found.' USING errcode = 'P0002'; END IF;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'Submitted timesheets can only be changed through a rejected project portion.' USING errcode = '42501';
    END IF;
    IF p_expected_version IS NULL OR p_expected_version <> v_version THEN
      RAISE EXCEPTION 'This draft changed elsewhere. Refresh it and try again.' USING errcode = '40001';
    END IF;
    UPDATE public.timesheets SET period_type=p_period_type,period_start=p_start,period_end=p_end,version=version+1
    WHERE id=p_id AND tenant_id=p_tenant_id AND employee_id=v_employee_id RETURNING id INTO v_timesheet_id;
    DELETE FROM public.timesheet_entries WHERE timesheet_id=v_timesheet_id;
  END IF;

  FOR v_entry IN SELECT item.value FROM pg_catalog.jsonb_array_elements(p_entries) item(value) LOOP
    v_activity_id := (v_entry->>'activity_id')::uuid;
    v_work_date := (v_entry->>'work_date')::date;
    v_hours := (v_entry->>'hours')::numeric;
    v_note := NULLIF(pg_catalog.btrim(COALESCE(v_entry->>'note','')),'');
    v_allocation_id := NULLIF(v_entry->>'project_allocation_id','')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.timesheet_activities a
        WHERE a.id=v_activity_id AND a.tenant_id=p_tenant_id AND a.active IS TRUE) THEN
      RAISE EXCEPTION 'Choose an active timesheet activity from this organization.' USING errcode = '22000';
    END IF;
    IF EXISTS (SELECT 1 FROM public.timesheet_activities a WHERE a.id=v_activity_id
        AND a.tenant_id=p_tenant_id AND a.activity_type='project') AND v_allocation_id IS NULL THEN
      RAISE EXCEPTION 'Choose a project allocation for each project entry.' USING errcode = '22000';
    END IF;
    IF v_allocation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.project_allocations a
      WHERE a.id=v_allocation_id AND a.tenant_id=p_tenant_id AND a.employee_id=v_employee_id
        AND a.assigned_date <= v_work_date AND (a.release_date IS NULL OR a.release_date >= v_work_date)
    ) THEN RAISE EXCEPTION 'Choose an allocation that covers this employee and work date.' USING errcode = '42501'; END IF;
    INSERT INTO public.timesheet_entries(timesheet_id,activity_id,work_date,hours,note,project_allocation_id)
    VALUES (v_timesheet_id,v_activity_id,v_work_date,v_hours,v_note,v_allocation_id);
  END LOOP;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'timesheet.saved','timesheet',v_timesheet_id::text,
    pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'period_type',p_period_type,
      'entry_count',pg_catalog.jsonb_array_length(p_entries)));
  RETURN v_timesheet_id;
END;
$function$;

-- Compatibility endpoint permits creation only. Every edit supplies the
-- version returned by the context RPC.
CREATE FUNCTION public.hris_save_my_timesheet(
  p_tenant_id uuid, p_id uuid, p_period_type text, p_start date, p_end date, p_entries jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF p_id IS NOT NULL THEN
    RAISE EXCEPTION 'Refresh the draft and use its version before editing.' USING errcode = '40001';
  END IF;
  RETURN public.hris_save_my_timesheet(p_tenant_id,NULL,p_period_type,p_start,p_end,p_entries,NULL::integer);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_submit_my_timesheet(p_tenant_id uuid, p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid; v_status text; v_has_entries boolean;
BEGIN
  IF NOT public.is_live_session() THEN RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501'; END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode = '42501'; END IF;
  SELECT status INTO v_status FROM public.timesheets
    WHERE id=p_id AND tenant_id=p_tenant_id AND employee_id=v_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found.' USING errcode = 'P0002'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be submitted. Revise rejected project portions separately.' USING errcode = '42501'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.timesheet_entries e
      JOIN public.timesheet_activities a ON a.id=e.activity_id AND a.tenant_id=p_tenant_id AND a.active IS TRUE
      WHERE e.timesheet_id=p_id) INTO v_has_entries;
  IF NOT v_has_entries THEN RAISE EXCEPTION 'Add at least one active timesheet entry before submitting.' USING errcode = '22000'; END IF;

  INSERT INTO public.timesheet_project_reviews(tenant_id,timesheet_id,project_id,status)
  SELECT p_tenant_id,p_id,pa.project_id,'pending'
  FROM public.timesheet_entries e JOIN public.project_allocations pa
    ON pa.id=e.project_allocation_id AND pa.tenant_id=p_tenant_id
  WHERE e.timesheet_id=p_id GROUP BY pa.project_id;
  INSERT INTO public.timesheet_project_review_events(tenant_id,timesheet_id,project_id,revision,event_type,actor_employee_id)
  SELECT r.tenant_id,r.timesheet_id,r.project_id,r.revision,'submitted',v_employee_id
  FROM public.timesheet_project_reviews r WHERE r.tenant_id=p_tenant_id AND r.timesheet_id=p_id;
  UPDATE public.timesheets SET status='submitted',submitted_at=pg_catalog.now(),resolved_at=NULL,
    resolution_note=NULL,resolved_by=NULL,version=version+1 WHERE id=p_id AND tenant_id=p_tenant_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'timesheet.submitted','timesheet',p_id::text,pg_catalog.jsonb_build_object('tenant_id',p_tenant_id));
  RETURN p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_get_my_project_timesheet_reviews(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid; v_result jsonb; v_can_review boolean;
BEGIN
  IF NOT public.is_live_session() THEN RAISE EXCEPTION 'An active manager session is required.' USING errcode = '42501'; END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode = '42501'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.projects p WHERE p.tenant_id=p_tenant_id AND p.project_lead_id=v_employee_id)
    INTO v_can_review;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'timesheet_id',t.id,'project_id',p.id,'project_name',p.name,'employee_id',t.employee_id,
    'employee_name',e.full_name,'period_type',t.period_type,'period_start',t.period_start,
    'period_end',t.period_end,'timesheet_status',t.status,'timesheet_version',t.version,
    'revision',r.revision,'status',r.status,'reviewed_at',r.reviewed_at,
    'rejection_reason',r.rejection_reason,'entries',(
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',te.id,'activity_name',ta.name,'activity_code',ta.code,'work_date',te.work_date,
        'hours',te.hours,'note',te.note,'allocation_id',pa.id
      ) ORDER BY te.work_date,te.id),'[]'::jsonb)
      FROM public.timesheet_entries te
      JOIN public.project_allocations pa ON pa.id=te.project_allocation_id AND pa.tenant_id=p_tenant_id
      JOIN public.timesheet_activities ta ON ta.id=te.activity_id AND ta.tenant_id=p_tenant_id
      WHERE te.timesheet_id=t.id AND pa.project_id=p.id
    )
  ) ORDER BY t.period_start DESC,p.name),'[]'::jsonb) INTO v_result
  FROM public.timesheet_project_reviews r
  JOIN public.timesheets t ON t.tenant_id=r.tenant_id AND t.id=r.timesheet_id
  JOIN public.projects p ON p.tenant_id=r.tenant_id AND p.id=r.project_id AND p.project_lead_id=v_employee_id
  JOIN public.employees e ON e.tenant_id=t.tenant_id AND e.id=t.employee_id
  WHERE r.tenant_id=p_tenant_id AND r.status IN ('pending','approved','rejected');
  RETURN jsonb_build_object('can_review',v_can_review,'reviews',v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_resolve_project_timesheet(
  p_tenant_id uuid,p_timesheet_id uuid,p_project_id uuid,p_expected_revision integer,
  p_decision text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid; v_review public.timesheet_project_reviews%ROWTYPE; v_overall text;
BEGIN
  IF NOT public.is_live_session() THEN RAISE EXCEPTION 'An active manager session is required.' USING errcode = '42501'; END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects p
      WHERE p.tenant_id=p_tenant_id AND p.id=p_project_id AND p.project_lead_id=v_employee_id) THEN
    RAISE EXCEPTION 'Only the assigned Project Manager can review these hours.' USING errcode = '42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Choose approve or reject.' USING errcode = '22000'; END IF;
  IF p_decision='rejected' AND (NULLIF(pg_catalog.btrim(COALESCE(p_reason,'')),'') IS NULL
      OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 1000) THEN
    RAISE EXCEPTION 'A rejection reason is required and must be 1000 characters or fewer.' USING errcode = '22000';
  END IF;
  PERFORM 1 FROM public.timesheets t WHERE t.tenant_id=p_tenant_id AND t.id=p_timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found.' USING errcode = 'P0002'; END IF;
  SELECT * INTO v_review FROM public.timesheet_project_reviews r
    WHERE r.tenant_id=p_tenant_id AND r.timesheet_id=p_timesheet_id AND r.project_id=p_project_id FOR UPDATE;
  IF NOT FOUND OR v_review.status <> 'pending' THEN RAISE EXCEPTION 'This project portion is no longer awaiting review.' USING errcode = '40001'; END IF;
  IF p_expected_revision IS NULL OR v_review.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'This review changed elsewhere. Refresh before deciding.' USING errcode = '40001';
  END IF;
  UPDATE public.timesheet_project_reviews SET status=p_decision,reviewer_employee_id=v_employee_id,
    reviewed_at=pg_catalog.now(),rejection_reason=CASE WHEN p_decision='rejected' THEN pg_catalog.btrim(p_reason) ELSE NULL END,
    updated_at=pg_catalog.now()
  WHERE id=v_review.id;
  INSERT INTO public.timesheet_project_review_events(tenant_id,timesheet_id,project_id,revision,event_type,actor_employee_id,reason)
  VALUES(p_tenant_id,p_timesheet_id,p_project_id,v_review.revision,p_decision,v_employee_id,
    CASE WHEN p_decision='rejected' THEN pg_catalog.btrim(p_reason) ELSE NULL END);
  SELECT CASE WHEN EXISTS(SELECT 1 FROM public.timesheet_project_reviews r
      WHERE r.tenant_id=p_tenant_id AND r.timesheet_id=p_timesheet_id AND r.status='rejected') THEN 'rejected'
    WHEN EXISTS(SELECT 1 FROM public.timesheet_project_reviews r
      WHERE r.tenant_id=p_tenant_id AND r.timesheet_id=p_timesheet_id AND r.status='pending') THEN 'submitted'
    WHEN EXISTS(SELECT 1 FROM public.timesheet_entries e JOIN public.timesheets t ON t.id=e.timesheet_id
      WHERE t.tenant_id=p_tenant_id AND t.id=p_timesheet_id AND e.project_allocation_id IS NULL) THEN 'submitted'
    WHEN EXISTS(SELECT 1 FROM public.timesheet_project_reviews r
      WHERE r.tenant_id=p_tenant_id AND r.timesheet_id=p_timesheet_id)
      AND NOT EXISTS(SELECT 1 FROM public.timesheet_project_reviews r
      WHERE r.tenant_id=p_tenant_id AND r.timesheet_id=p_timesheet_id AND r.status<>'approved') THEN 'approved'
    ELSE 'submitted' END INTO v_overall;
  UPDATE public.timesheets SET status=v_overall,version=version+1,
    resolved_at=CASE WHEN v_overall IN ('approved','rejected') THEN pg_catalog.now() ELSE NULL END,
    resolved_by=NULL,resolution_note=NULL WHERE tenant_id=p_tenant_id AND id=p_timesheet_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'timesheet.project.'||p_decision,'timesheet_project_review',v_review.id::text,
    pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'timesheet_id',p_timesheet_id,
      'project_id',p_project_id,'revision',v_review.revision,'reason',CASE WHEN p_decision='rejected' THEN p_reason ELSE NULL END));
  RETURN pg_catalog.jsonb_build_object('timesheet_id',p_timesheet_id,'project_id',p_project_id,'status',p_decision,'timesheet_status',v_overall);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_resubmit_rejected_project_timesheet(
  p_tenant_id uuid,p_timesheet_id uuid,p_project_id uuid,p_expected_revision integer,p_entries jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid; v_review public.timesheet_project_reviews%ROWTYPE; v_sheet public.timesheets%ROWTYPE;
  v_entry jsonb; v_allocation_id uuid; v_work_date date; v_activity_id uuid; v_hours numeric; v_note text;
BEGIN
  IF NOT public.is_live_session() THEN RAISE EXCEPTION 'An active employee session is required.' USING errcode = '42501'; END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode = '42501'; END IF;
  IF p_entries IS NULL OR pg_catalog.jsonb_typeof(p_entries)<>'array' THEN RAISE EXCEPTION 'Entries must be a list.' USING errcode = '22000'; END IF;
  IF pg_catalog.jsonb_array_length(p_entries)=0 THEN RAISE EXCEPTION 'Keep at least one entry in the corrected project portion.' USING errcode = '22000'; END IF;
  SELECT * INTO v_sheet FROM public.timesheets t WHERE t.tenant_id=p_tenant_id AND t.id=p_timesheet_id
    AND t.employee_id=v_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found.' USING errcode = 'P0002'; END IF;
  SELECT * INTO v_review FROM public.timesheet_project_reviews r WHERE r.tenant_id=p_tenant_id
    AND r.timesheet_id=p_timesheet_id AND r.project_id=p_project_id FOR UPDATE;
  IF NOT FOUND OR v_review.status<>'rejected' OR p_expected_revision IS NULL OR v_review.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'This rejected project portion changed. Refresh before correcting it.' USING errcode = '40001';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_entries) item(value)
      WHERE pg_catalog.jsonb_typeof(item.value)<>'object'
        OR NULLIF(item.value->>'activity_id','') IS NULL
        OR NULLIF(item.value->>'work_date','') IS NULL
        OR NULLIF(item.value->>'hours','') IS NULL
        OR NULLIF(item.value->>'project_allocation_id','') IS NULL) THEN
    RAISE EXCEPTION 'Each corrected project entry needs an activity, allocation, date, and hours.' USING errcode = '22000';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_entries) item(value)
      WHERE (item.value->>'work_date')::date < v_sheet.period_start
        OR (item.value->>'work_date')::date > v_sheet.period_end
        OR (item.value->>'hours')::numeric<=0 OR (item.value->>'hours')::numeric>24) THEN
    RAISE EXCEPTION 'Corrected entry dates and hours must stay inside the timesheet limits.' USING errcode = '22000';
  END IF;
  IF EXISTS(
    SELECT combined.work_date FROM (
      SELECT e.work_date,e.hours FROM public.timesheet_entries e
      LEFT JOIN public.project_allocations a ON a.id=e.project_allocation_id AND a.tenant_id=p_tenant_id
      WHERE e.timesheet_id=p_timesheet_id AND (a.project_id IS NULL OR a.project_id<>p_project_id)
      UNION ALL
      SELECT (item.value->>'work_date')::date,(item.value->>'hours')::numeric
      FROM pg_catalog.jsonb_array_elements(p_entries) item(value)
    ) combined GROUP BY combined.work_date HAVING sum(combined.hours)>24
  ) THEN RAISE EXCEPTION 'A day cannot contain more than 24 total hours.' USING errcode = '22000'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_entries) item(value)
      WHERE NOT EXISTS(SELECT 1 FROM public.project_allocations a WHERE a.id=(item.value->>'project_allocation_id')::uuid
        AND a.tenant_id=p_tenant_id AND a.employee_id=v_employee_id AND a.project_id=p_project_id
        AND a.assigned_date <= (item.value->>'work_date')::date
        AND (a.release_date IS NULL OR a.release_date >= (item.value->>'work_date')::date))
        OR NOT EXISTS(SELECT 1 FROM public.timesheet_activities a WHERE a.id=(item.value->>'activity_id')::uuid
        AND a.tenant_id=p_tenant_id AND a.active IS TRUE)) THEN
    RAISE EXCEPTION 'Corrected entries must use an active activity and an allocation for this project and date.' USING errcode = '42501';
  END IF;
  DELETE FROM public.timesheet_entries e USING public.project_allocations a
    WHERE e.project_allocation_id=a.id AND a.tenant_id=p_tenant_id AND a.project_id=p_project_id
      AND a.employee_id=v_employee_id AND e.timesheet_id=p_timesheet_id;
  FOR v_entry IN SELECT item.value FROM pg_catalog.jsonb_array_elements(p_entries) item(value) LOOP
    v_allocation_id := (v_entry->>'project_allocation_id')::uuid;
    v_work_date := (v_entry->>'work_date')::date;
    v_activity_id := (v_entry->>'activity_id')::uuid;
    v_hours := (v_entry->>'hours')::numeric;
    v_note := NULLIF(pg_catalog.btrim(COALESCE(v_entry->>'note','')),'');
    INSERT INTO public.timesheet_entries(timesheet_id,activity_id,work_date,hours,note,project_allocation_id)
    VALUES(p_timesheet_id,v_activity_id,v_work_date,v_hours,v_note,v_allocation_id);
  END LOOP;
  UPDATE public.timesheet_project_reviews SET revision=revision+1,status='pending',reviewer_employee_id=NULL,
    reviewed_at=NULL,rejection_reason=NULL,updated_at=pg_catalog.now() WHERE id=v_review.id;
  INSERT INTO public.timesheet_project_review_events(tenant_id,timesheet_id,project_id,revision,event_type,actor_employee_id)
  VALUES(p_tenant_id,p_timesheet_id,p_project_id,v_review.revision+1,'corrected_resubmitted',v_employee_id);
  UPDATE public.timesheets SET status=CASE WHEN EXISTS(SELECT 1 FROM public.timesheet_project_reviews r
      WHERE r.tenant_id=p_tenant_id AND r.timesheet_id=p_timesheet_id AND r.status='rejected') THEN 'rejected' ELSE 'submitted' END,
    submitted_at=pg_catalog.now(),resolved_at=NULL,resolved_by=NULL,resolution_note=NULL,version=version+1
  WHERE id=p_timesheet_id AND tenant_id=p_tenant_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES(auth.uid(),'timesheet.project.corrected_resubmitted','timesheet_project_review',v_review.id::text,
    pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'timesheet_id',p_timesheet_id,'project_id',p_project_id,
      'revision',v_review.revision+1,'entry_count',pg_catalog.jsonb_array_length(p_entries)));
  RETURN pg_catalog.jsonb_build_object('timesheet_id',p_timesheet_id,'project_id',p_project_id,'status','pending','revision',v_review.revision+1);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_my_timesheet_context(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_submit_my_timesheet(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_get_my_project_timesheet_reviews(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_resolve_project_timesheet(uuid,uuid,uuid,integer,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_resubmit_rejected_project_timesheet(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_timesheet_context(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_save_my_timesheet(uuid,uuid,text,date,date,jsonb,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_submit_my_timesheet(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_project_timesheet_reviews(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_resolve_project_timesheet(uuid,uuid,uuid,integer,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_resubmit_rejected_project_timesheet(uuid,uuid,uuid,integer,jsonb) TO authenticated,service_role;
