-- Text-only employee and assigned-reviewer appraisal workflow. Score and
-- finalization policy remains outside this release candidate.
BEGIN;

CREATE OR REPLACE FUNCTION public.hris_get_my_appraisal_work(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_appraisals jsonb;
BEGIN
  IF NOT public.is_live_session()
    OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active tenant session required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Linked employee required.' USING errcode='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'cycle_id',a.cycle_id,
    'employee_id',a.employee_id,
    'reviewer_employee_id',a.reviewer_employee_id,
    'employee_name',CASE WHEN a.reviewer_employee_id=v_employee_id THEN employee.full_name ELSE NULL END,
    'status',a.status,
    'created_at',a.created_at,
    'updated_at',a.updated_at,
    'self_comment',CASE
      WHEN a.employee_id=v_employee_id
        OR (a.reviewer_employee_id=v_employee_id AND a.status IN ('submitted_by_employee','reviewed_by_manager','finalized'))
      THEN a.self_overall_comment ELSE NULL END,
    'manager_comment',CASE
      WHEN a.reviewer_employee_id=v_employee_id
        OR (a.employee_id=v_employee_id AND a.status IN ('reviewed_by_manager','finalized'))
      THEN a.manager_overall_comment ELSE NULL END,
    'cycle_name',cycle.name,
    'cycle_start_date',cycle.start_date,
    'cycle_end_date',cycle.end_date,
    'self_review_deadline',cycle.self_review_deadline,
    'manager_review_deadline',cycle.manager_review_deadline
  ) ORDER BY a.created_at DESC),'[]'::jsonb)
  INTO v_appraisals
  FROM public.performance_appraisals a
  JOIN public.performance_cycles cycle
    ON cycle.tenant_id=a.tenant_id AND cycle.id=a.cycle_id
  JOIN public.employees employee
    ON employee.tenant_id=a.tenant_id AND employee.id=a.employee_id
  WHERE a.tenant_id=p_tenant_id
    AND (a.employee_id=v_employee_id OR a.reviewer_employee_id=v_employee_id);

  RETURN jsonb_build_object('appraisals',v_appraisals);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_save_my_appraisal_self_comment(
  p_tenant_id uuid,p_appraisal_id uuid,p_comment text,p_submit boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_appraisal public.performance_appraisals%ROWTYPE;
BEGIN
  IF NOT public.is_live_session()
    OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active tenant session required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Linked employee required.' USING errcode='42501';
  END IF;
  IF p_appraisal_id IS NULL OR length(COALESCE(p_comment,''))>4000 THEN
    RAISE EXCEPTION 'A valid appraisal and comment of 4,000 characters or fewer are required.' USING errcode='22023';
  END IF;

  UPDATE public.performance_appraisals a
  SET self_overall_comment=NULLIF(btrim(COALESCE(p_comment,'')),''),
      status=CASE WHEN COALESCE(p_submit,false) THEN 'submitted_by_employee' ELSE 'draft' END,
      updated_at=clock_timestamp()
  WHERE a.tenant_id=p_tenant_id AND a.id=p_appraisal_id
    AND a.employee_id=v_employee_id AND a.status='draft'
  RETURNING a.* INTO v_appraisal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft appraisal for this employee was not found.' USING errcode='42501';
  END IF;

  RETURN jsonb_build_object('id',v_appraisal.id,'status',v_appraisal.status,
    'self_comment',v_appraisal.self_overall_comment,'updated_at',v_appraisal.updated_at);
END
$function$;

CREATE OR REPLACE FUNCTION public.hris_save_assigned_appraisal_review(
  p_tenant_id uuid,p_appraisal_id uuid,p_comment text,p_submit boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_appraisal public.performance_appraisals%ROWTYPE;
BEGIN
  IF NOT public.is_live_session()
    OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
    OR NOT public.hris_is_active_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'Active assigned reviewer membership required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Linked employee required.' USING errcode='42501';
  END IF;
  IF p_appraisal_id IS NULL OR length(COALESCE(p_comment,''))>4000 THEN
    RAISE EXCEPTION 'A valid appraisal and comment of 4,000 characters or fewer are required.' USING errcode='22023';
  END IF;

  UPDATE public.performance_appraisals a
  SET manager_overall_comment=NULLIF(btrim(COALESCE(p_comment,'')),''),
      status=CASE WHEN COALESCE(p_submit,false) THEN 'reviewed_by_manager' ELSE 'submitted_by_employee' END,
      updated_at=clock_timestamp()
  WHERE a.tenant_id=p_tenant_id AND a.id=p_appraisal_id
    AND a.reviewer_employee_id=v_employee_id AND a.status='submitted_by_employee'
  RETURNING a.* INTO v_appraisal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submitted appraisal assigned to this reviewer was not found.' USING errcode='42501';
  END IF;

  RETURN jsonb_build_object('id',v_appraisal.id,'status',v_appraisal.status,
    'manager_comment',v_appraisal.manager_overall_comment,'updated_at',v_appraisal.updated_at);
END
$function$;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.performance_appraisals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hris_get_my_appraisal_work(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_save_my_appraisal_self_comment(uuid,uuid,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hris_save_assigned_appraisal_review(uuid,uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_appraisal_work(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_save_my_appraisal_self_comment(uuid,uuid,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hris_save_assigned_appraisal_review(uuid,uuid,text,boolean) TO authenticated, service_role;

COMMIT;
