-- Keep a durable employee-visible record when an existing roster assignment
-- changes shift. Assignment status and date remain unchanged.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS shifts_tenant_id_id_key
  ON public.shifts(tenant_id,id);

CREATE TABLE public.employee_shift_assignment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_shift_assignment_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  previous_shift_id uuid NOT NULL,
  new_shift_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_shift_assignment_changes_tenant_id_id_key UNIQUE (tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_assignment_fk
    FOREIGN KEY (tenant_id,employee_shift_assignment_id)
    REFERENCES public.employee_shift_assignments(tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_employee_fk
    FOREIGN KEY (tenant_id,employee_id)
    REFERENCES public.employees(tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_previous_shift_fk
    FOREIGN KEY (tenant_id,previous_shift_id)
    REFERENCES public.shifts(tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_new_shift_fk
    FOREIGN KEY (tenant_id,new_shift_id)
    REFERENCES public.shifts(tenant_id,id),
  CONSTRAINT employee_shift_assignment_changes_distinct_shifts
    CHECK (previous_shift_id <> new_shift_id)
);

CREATE INDEX employee_shift_assignment_changes_employee_date_idx
  ON public.employee_shift_assignment_changes(tenant_id,employee_id,changed_at DESC,id DESC);

ALTER TABLE public.employee_shift_assignment_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_shift_assignment_changes FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.roster_change_notifications
  DROP CONSTRAINT IF EXISTS roster_change_notifications_kind_check;
ALTER TABLE public.roster_change_notifications
  ADD CONSTRAINT roster_change_notifications_kind_check CHECK (kind IN ('assigned','changed'));

CREATE OR REPLACE FUNCTION private.hris_record_employee_shift_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_employee_id uuid;
BEGIN
  IF NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated attendance manager is required for roster changes.' USING errcode='42501';
  END IF;

  SELECT e.id INTO v_employee_id
  FROM public.employees e
  JOIN public.tenants t ON t.id=e.tenant_id AND t.is_active IS TRUE
  WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.employee_id AND e.user_id IS NOT NULL;

  INSERT INTO public.employee_shift_assignment_changes(
    tenant_id,employee_shift_assignment_id,employee_id,previous_shift_id,new_shift_id,changed_by,changed_at
  ) VALUES (
    NEW.tenant_id,NEW.id,NEW.employee_id,OLD.shift_id,NEW.shift_id,auth.uid(),clock_timestamp()
  );

  IF v_employee_id IS NOT NULL THEN
    UPDATE public.roster_change_notifications n
    SET kind='changed',created_at=clock_timestamp()
    WHERE n.tenant_id=NEW.tenant_id AND n.recipient_employee_id=v_employee_id
      AND n.employee_shift_assignment_id=NEW.id;
    IF NOT FOUND THEN
      INSERT INTO public.roster_change_notifications(
        tenant_id,employee_shift_assignment_id,recipient_employee_id,kind,created_at
      ) VALUES (NEW.tenant_id,NEW.id,v_employee_id,'changed',clock_timestamp())
      ON CONFLICT (tenant_id,recipient_employee_id,employee_shift_assignment_id)
      DO UPDATE SET kind='changed',created_at=excluded.created_at;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.hris_record_employee_shift_change() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS employee_shift_assignment_change_history ON public.employee_shift_assignments;
CREATE TRIGGER employee_shift_assignment_change_history
  AFTER UPDATE OF shift_id ON public.employee_shift_assignments
  FOR EACH ROW EXECUTE FUNCTION private.hris_record_employee_shift_change();

CREATE OR REPLACE FUNCTION public.hris_change_tenant_employee_shift(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_new_shift_id uuid,
  p_expected_shift_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_current_shift_id uuid;
  v_updated_id uuid;
BEGIN
  IF NOT public.has_tenant_permission(p_tenant_id,'attendance.manage') THEN
    RAISE EXCEPTION 'Tenant attendance management permission required.' USING errcode='42501';
  END IF;
  IF p_tenant_id IS NULL OR p_assignment_id IS NULL OR p_new_shift_id IS NULL OR p_expected_shift_id IS NULL THEN
    RAISE EXCEPTION 'Choose an assignment and replacement shift.' USING errcode='22023';
  END IF;

  SELECT a.employee_id,a.shift_id INTO v_employee_id,v_current_shift_id
  FROM public.employee_shift_assignments a
  WHERE a.tenant_id=p_tenant_id AND a.id=p_assignment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roster assignment not found in the authorized tenant.' USING errcode='P0002';
  END IF;
  IF v_current_shift_id IS DISTINCT FROM p_expected_shift_id THEN
    RAISE EXCEPTION 'This roster assignment changed since it was loaded. Refresh and try again.' USING errcode='40001';
  END IF;
  IF p_new_shift_id=v_current_shift_id THEN
    RAISE EXCEPTION 'Choose a different shift.' USING errcode='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.tenant_id=p_tenant_id AND e.id=v_employee_id
      AND e.employment_status NOT IN ('resigned','terminated')
  ) THEN
    RAISE EXCEPTION 'Active employee not found in the authorized tenant.' USING errcode='P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.tenant_id=p_tenant_id AND s.id=p_new_shift_id AND s.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active replacement shift not found in the authorized tenant.' USING errcode='P0002';
  END IF;

  UPDATE public.employee_shift_assignments a
  SET shift_id=p_new_shift_id
  WHERE a.tenant_id=p_tenant_id AND a.id=p_assignment_id AND a.shift_id=p_expected_shift_id
  RETURNING a.id INTO v_updated_id;
  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'This roster assignment changed since it was loaded. Refresh and try again.' USING errcode='40001';
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),'shift.assignment.changed','employee_shift_assignment',v_updated_id::text,
    jsonb_build_object('tenant_id',p_tenant_id,'employee_id',v_employee_id,
      'assignment_id',v_updated_id,'previous_shift_id',v_current_shift_id,
      'new_shift_id',p_new_shift_id));
  RETURN v_updated_id;
END
$function$;
REVOKE ALL ON FUNCTION public.hris_change_tenant_employee_shift(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hris_change_tenant_employee_shift(uuid,uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_my_shift_changes(
  p_tenant_id uuid,
  p_start date,
  p_end date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_changes jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active employee sign-in for this organization is required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>30 THEN
    RAISE EXCEPTION 'Choose a valid roster date range of 31 days or fewer.' USING errcode='22023';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'change_id',c.id,'assignment_id',a.id,'assignment_date',a.assignment_date,
    'previous_shift_name',old_shift.name,'new_shift_name',new_shift.name,'changed_at',c.changed_at
  ) ORDER BY c.changed_at DESC,c.id DESC),'[]'::jsonb)
  INTO v_changes
  FROM public.employee_shift_assignment_changes c
  JOIN public.employee_shift_assignments a
    ON a.tenant_id=c.tenant_id AND a.id=c.employee_shift_assignment_id AND a.employee_id=c.employee_id
  JOIN public.shifts old_shift ON old_shift.tenant_id=c.tenant_id AND old_shift.id=c.previous_shift_id
  JOIN public.shifts new_shift ON new_shift.tenant_id=c.tenant_id AND new_shift.id=c.new_shift_id
  WHERE c.tenant_id=p_tenant_id AND c.employee_id=v_employee_id
    AND a.assignment_date BETWEEN p_start AND p_end;

  RETURN v_changes;
END
$function$;
REVOKE ALL ON FUNCTION public.hris_get_my_shift_changes(uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_my_shift_changes(uuid,date,date) TO authenticated;

COMMENT ON FUNCTION public.hris_change_tenant_employee_shift(uuid,uuid,uuid,uuid)
  IS 'Changes only the shift on an existing same-tenant roster assignment for attendance.manage; expected-shift matching prevents stale overwrites. Date and status are preserved.';
COMMENT ON FUNCTION public.hris_get_my_shift_changes(uuid,date,date)
  IS 'Returns append-only shift-change history for the authenticated employee in their active tenant and requested date range.';

COMMIT;
