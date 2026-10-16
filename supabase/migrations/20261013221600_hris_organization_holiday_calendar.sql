-- Tenant-scoped holiday calendar management for active holidays.manage members.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.holidays FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.hris_get_org_holiday_calendar(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_holidays jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
      OR NOT public.has_tenant_permission(p_tenant_id, 'holidays.manage') THEN
    RAISE EXCEPTION 'Holiday management access for this organization is required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active organization not found.' USING errcode='P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',h.id,'name',h.name,'start_date',h.start_date,'end_date',h.end_date,
    'holiday_type',h.holiday_type,'description',h.description,'active',h.active,
    'created_at',h.created_at,'updated_at',h.updated_at
  ) ORDER BY h.start_date,h.name,h.id),'[]'::jsonb)
  INTO v_holidays
  FROM public.holidays h
  WHERE h.tenant_id=p_tenant_id;

  RETURN v_holidays;
END
$function$;

CREATE OR REPLACE FUNCTION private.hris_save_org_holiday(
  p_tenant_id uuid,
  p_holiday_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_holiday_type text DEFAULT 'general',
  p_description text DEFAULT NULL,
  p_active boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_id uuid;
  v_name text := btrim(COALESCE(p_name,''));
  v_type text := COALESCE(NULLIF(btrim(p_holiday_type),''),'general');
  v_description text := NULLIF(btrim(p_description),'');
  v_created boolean := p_holiday_id IS NULL;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
      OR NOT public.has_tenant_permission(p_tenant_id, 'holidays.manage') THEN
    RAISE EXCEPTION 'Holiday management access for this organization is required.' USING errcode='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active organization not found.' USING errcode='P0002';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 160
      OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
      OR length(v_type) > 80 OR COALESCE(length(v_description),0) > 2000
      OR p_active IS NULL THEN
    RAISE EXCEPTION 'Enter a holiday name, a valid date range, and supported details.' USING errcode='22000';
  END IF;

  IF v_created THEN
    INSERT INTO public.holidays(tenant_id,name,start_date,end_date,holiday_type,description,active)
    VALUES (p_tenant_id,v_name,p_start_date,p_end_date,v_type,v_description,p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.holidays h SET
      name=v_name,start_date=p_start_date,end_date=p_end_date,holiday_type=v_type,
      description=v_description,active=p_active,updated_at=clock_timestamp()
    WHERE h.tenant_id=p_tenant_id AND h.id=p_holiday_id
    RETURNING h.id INTO v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Holiday not found in this organization.' USING errcode='P0002';
    END IF;
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  VALUES (auth.uid(),CASE WHEN v_created THEN 'holiday.created' ELSE 'holiday.updated' END,
    'holiday',v_id::text,jsonb_build_object('tenant_id',p_tenant_id,'start_date',p_start_date,
      'end_date',p_end_date,'active',p_active));

  RETURN jsonb_build_object('id',v_id,'name',v_name,'start_date',p_start_date,
    'end_date',p_end_date,'holiday_type',v_type,'description',v_description,'active',p_active);
END
$function$;

REVOKE ALL ON FUNCTION private.hris_get_org_holiday_calendar(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.hris_save_org_holiday(uuid,uuid,text,date,date,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.hris_get_org_holiday_calendar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.hris_save_org_holiday(uuid,uuid,text,date,date,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_org_holiday_calendar(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT private.hris_get_org_holiday_calendar(p_tenant_id)
$function$;

CREATE OR REPLACE FUNCTION public.hris_save_org_holiday(
  p_tenant_id uuid,p_holiday_id uuid,p_name text,p_start_date date,p_end_date date,
  p_holiday_type text DEFAULT 'general',p_description text DEFAULT NULL,p_active boolean DEFAULT true
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER
SET search_path = '' AS $function$
  SELECT private.hris_save_org_holiday(p_tenant_id,p_holiday_id,p_name,p_start_date,
    p_end_date,p_holiday_type,p_description,p_active)
$function$;

REVOKE ALL ON FUNCTION public.hris_get_org_holiday_calendar(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_save_org_holiday(uuid,uuid,text,date,date,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_org_holiday_calendar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hris_save_org_holiday(uuid,uuid,text,date,date,text,text,boolean) TO authenticated;

COMMIT;
