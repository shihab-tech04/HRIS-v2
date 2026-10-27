-- Restore the requisition RPC source inspected on 2026-10-27 from the
-- read-only replacement Supabase
-- catalog and prevent callers from creating directly-approved requisitions.
-- Existing edits remain tenant-scoped; only admin_resolve_requisition may
-- transition a pending requisition into an approval decision.
-- Target: replacement Supabase xfuxnljfrgvusbrpvxpa only.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_save_requisition(p_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_tenant uuid:=public.synesis_tenant_id();v_id uuid;v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');v_department_id uuid;v_designation_id uuid;
begin
 if not public.has_permission('recruitment.manage') then raise exception 'Recruitment management permission required.' using errcode='42501'; end if;
 if v_title is null then raise exception 'Requisition title is required.' using errcode='22000'; end if;
 v_department_id:=nullif(p_payload->>'department_id','')::uuid;
 v_designation_id:=nullif(p_payload->>'designation_id','')::uuid;
 if v_department_id is not null and not exists(select 1 from public.departments d where d.id=v_department_id and d.tenant_id=v_tenant) then raise exception 'Department not found.' using errcode='P0002'; end if;
 if v_designation_id is not null and not exists(select 1 from public.designations d where d.id=v_designation_id and d.tenant_id=v_tenant) then raise exception 'Designation not found.' using errcode='P0002'; end if;
 if p_id is null then
  insert into public.manpower_requisitions(tenant_id,reference_number,title,department_id,designation_id,employment_type,project_name,required_positions,desired_joining_date,years_experience,education_qualifications,certifications,job_description,reason,status,requested_by)
  values(v_tenant,public.next_requisition_number(),v_title,v_department_id,v_designation_id,coalesce(nullif(p_payload->>'employment_type',''),'full_time'),nullif(btrim(coalesce(p_payload->>'project_name','')),''),coalesce(nullif(p_payload->>'required_positions','')::integer,1),nullif(p_payload->>'desired_joining_date','')::date,nullif(p_payload->>'years_experience','')::numeric,nullif(btrim(coalesce(p_payload->>'education_qualifications','')),''),nullif(btrim(coalesce(p_payload->>'certifications','')),''),nullif(btrim(coalesce(p_payload->>'job_description','')),''),nullif(btrim(coalesce(p_payload->>'reason','')),''),'pending',auth.uid()) returning id into v_id;
 else
  update public.manpower_requisitions set title=v_title,department_id=v_department_id,designation_id=v_designation_id,employment_type=coalesce(nullif(p_payload->>'employment_type',''),employment_type),project_name=nullif(btrim(coalesce(p_payload->>'project_name','')),''),required_positions=coalesce(nullif(p_payload->>'required_positions','')::integer,required_positions),desired_joining_date=nullif(p_payload->>'desired_joining_date','')::date,years_experience=nullif(p_payload->>'years_experience','')::numeric,education_qualifications=nullif(btrim(coalesce(p_payload->>'education_qualifications','')),''),certifications=nullif(btrim(coalesce(p_payload->>'certifications','')),''),job_description=nullif(btrim(coalesce(p_payload->>'job_description','')),''),reason=nullif(btrim(coalesce(p_payload->>'reason','')),'') where id=p_id and tenant_id=v_tenant returning id into v_id;
 end if;
 if v_id is null then raise exception 'Requisition not found.' using errcode='P0002'; end if;
 insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details) values(auth.uid(),case when p_id is null then 'recruitment.requisition.created' else 'recruitment.requisition.updated' end,'requisition',v_id::text,jsonb_build_object('title',v_title));
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_requisition(p_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
begin
 if not public.has_permission('recruitment.manage') then raise exception 'Recruitment management permission required.' using errcode='42501'; end if;
 if p_decision not in('approved','rejected') then raise exception 'Decision must be approved or rejected.' using errcode='22000'; end if;
 update public.manpower_requisitions set status=p_decision,resolved_by=auth.uid(),resolved_at=now(),resolution_note=nullif(btrim(coalesce(p_note,'')),'') where id=p_id AND tenant_id=public.synesis_tenant_id() and status='pending';
 if not found then raise exception 'Pending requisition not found.' using errcode='P0002'; end if;
 insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details) values(auth.uid(),'recruitment.requisition.'||p_decision,'requisition',p_id::text,jsonb_build_object('note',p_note));
 return jsonb_build_object('success',true,'decision',p_decision);
end $function$;

REVOKE ALL ON FUNCTION public.admin_save_requisition(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_requisition(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_requisition(uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_requisition(uuid,text,text) TO authenticated, service_role;

COMMIT;
