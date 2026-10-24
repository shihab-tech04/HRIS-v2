-- Restore missing version-controlled job-circular RPC source from the live, verified
-- replacement HRIS SQL catalog on 2026-10-24. DO NOT REPLAY blindly on the cloned
-- hosted project: its restored migration ledger has separate provenance.
-- Deployed definitions were inspected with pg_get_functiondef; no change was made.
-- Source functions retain tenant-scoped authorization, required job validations and audit.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_save_job(p_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_tenant uuid:=public.synesis_tenant_id();
  v_id uuid;
  v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');
  v_req uuid:=nullif(p_payload->>'requisition_id','')::uuid;
  v_dep uuid:=nullif(p_payload->>'department_id','')::uuid;
  v_team uuid:=nullif(p_payload->>'team_id','')::uuid;
  v_des uuid:=nullif(p_payload->>'designation_id','')::uuid;
  v_loc uuid:=nullif(p_payload->>'location_id','')::uuid;
  v_dep_name text;
  v_team_name text;
  v_loc_name text;
  v_exp text:=coalesce(nullif(btrim(coalesce(p_payload->>'experience_level','')),''),'mid');
  v_screening jsonb:=coalesce(p_payload->'screening_questions','[]'::jsonb);
begin
  if not public.has_permission('recruitment.manage') then
    raise exception 'Recruitment management permission required.' using errcode='42501';
  end if;
  if v_title is null then raise exception 'Job title is required.' using errcode='22000'; end if;
  if v_exp not in('entry','mid','senior','lead','executive') then
    raise exception 'Invalid experience level.' using errcode='22000';
  end if;
  if jsonb_typeof(v_screening)<>'array' then
    raise exception 'Screening questions must be an array.' using errcode='22000';
  end if;
  if exists(
    select 1 from jsonb_array_elements(v_screening) q
    where nullif(btrim(coalesce(q->>'id','')),'') is null
       or nullif(btrim(coalesce(q->>'questionText','')),'') is null
       or coalesce(q->>'type','') not in('short_text','long_text','number','yes_no','single_select','multi_select','date')
       or (
         q->>'type' in('single_select','multi_select')
         and (
           jsonb_typeof(coalesce(q->'options','null'::jsonb))<>'array'
           or jsonb_array_length(coalesce(q->'options','[]'::jsonb))=0
         )
       )
  ) then
    raise exception 'Every screening question requires an id, question, valid type, and options where applicable.' using errcode='22000';
  end if;
  if (
    select count(*) from jsonb_array_elements(v_screening)
  ) <> (
    select count(distinct q->>'id') from jsonb_array_elements(v_screening) q
  ) then
    raise exception 'Screening question ids must be unique.' using errcode='22000';
  end if;

  if v_req is not null and not exists(
    select 1 from public.manpower_requisitions
    where id=v_req and tenant_id=v_tenant and status='approved'
  ) then raise exception 'Only approved requisitions can be linked to a job.' using errcode='23503'; end if;

  if v_dep is not null then
    select name into v_dep_name from public.departments
    where id=v_dep and tenant_id=v_tenant and active=true;
    if not found then raise exception 'Department is unavailable.' using errcode='23503'; end if;
  end if;
  if v_team is not null then
    select name into v_team_name from public.teams
    where id=v_team and tenant_id=v_tenant and active=true
      and (v_dep is null or department_id=v_dep);
    if not found then raise exception 'Team is unavailable for the selected department.' using errcode='23503'; end if;
  end if;
  if v_des is not null and not exists(
    select 1 from public.designations
    where id=v_des and tenant_id=v_tenant and active=true
      and (v_dep is null or department_id is null or department_id=v_dep)
  ) then raise exception 'Designation is unavailable for the selected department.' using errcode='23503'; end if;
  if v_loc is not null then
    select name into v_loc_name from public.org_locations
    where id=v_loc and tenant_id=v_tenant and active=true;
    if not found then raise exception 'Location is unavailable.' using errcode='23503'; end if;
  end if;

  if p_id is null then
    insert into public.jobs(
      tenant_id,requisition_id,reference_number,title,
      department_id,department_name,team_id,team_name,designation_id,location_id,location_name,
      workplace_type,employment_type,experience_level,vacancy_count,min_experience_years,
      education_requirement,skills,responsibilities,requirements,benefits,
      salary_currency,salary_min,salary_max,is_salary_published,
      application_deadline,required_documents,screening_questions,instructions,created_by
    )
    values(
      v_tenant,v_req,public.next_job_number(),v_title,
      v_dep,v_dep_name,v_team,v_team_name,v_des,v_loc,v_loc_name,
      coalesce(nullif(p_payload->>'workplace_type',''),'on-site'),
      coalesce(nullif(p_payload->>'employment_type',''),'full-time'),
      v_exp,
      coalesce(nullif(p_payload->>'vacancy_count','')::integer,1),
      coalesce(nullif(p_payload->>'min_experience_years','')::numeric,0),
      nullif(btrim(coalesce(p_payload->>'education_requirement','')),''),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'skills','[]'::jsonb))),'{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'responsibilities','[]'::jsonb))),'{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'requirements','[]'::jsonb))),'{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'benefits','[]'::jsonb))),'{}'),
      upper(coalesce(nullif(p_payload->>'salary_currency',''),'BDT')),
      nullif(p_payload->>'salary_min','')::numeric,
      nullif(p_payload->>'salary_max','')::numeric,
      coalesce((p_payload->>'is_salary_published')::boolean,false),
      nullif(p_payload->>'application_deadline','')::date,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'required_documents','[]'::jsonb))),'{}'),
      v_screening,
      nullif(btrim(coalesce(p_payload->>'instructions','')),''),
      auth.uid()
    ) returning id into v_id;
  else
    update public.jobs
    set requisition_id=v_req,
        title=v_title,
        department_id=v_dep,department_name=v_dep_name,
        team_id=v_team,team_name=v_team_name,
        designation_id=v_des,
        location_id=v_loc,location_name=v_loc_name,
        workplace_type=coalesce(nullif(p_payload->>'workplace_type',''),workplace_type),
        employment_type=coalesce(nullif(p_payload->>'employment_type',''),employment_type),
        experience_level=v_exp,
        vacancy_count=coalesce(nullif(p_payload->>'vacancy_count','')::integer,vacancy_count),
        min_experience_years=coalesce(nullif(p_payload->>'min_experience_years','')::numeric,min_experience_years),
        education_requirement=nullif(btrim(coalesce(p_payload->>'education_requirement','')),''),
        skills=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'skills','[]'::jsonb))),'{}'),
        responsibilities=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'responsibilities','[]'::jsonb))),'{}'),
        requirements=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'requirements','[]'::jsonb))),'{}'),
        benefits=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'benefits','[]'::jsonb))),'{}'),
        salary_currency=upper(coalesce(nullif(p_payload->>'salary_currency',''),salary_currency)),
        salary_min=nullif(p_payload->>'salary_min','')::numeric,
        salary_max=nullif(p_payload->>'salary_max','')::numeric,
        is_salary_published=coalesce((p_payload->>'is_salary_published')::boolean,is_salary_published),
        application_deadline=nullif(p_payload->>'application_deadline','')::date,
        required_documents=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'required_documents','[]'::jsonb))),'{}'),
        screening_questions=v_screening,
        instructions=nullif(btrim(coalesce(p_payload->>'instructions','')),'')
    where id=p_id and tenant_id=v_tenant
    returning id into v_id;
  end if;

  if v_id is null then raise exception 'Job not found.' using errcode='P0002'; end if;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(
    auth.uid(),
    case when p_id is null then 'recruitment.job.created' else 'recruitment.job.updated' end,
    'job',v_id::text,
    jsonb_build_object('title',v_title,'screening_questions',jsonb_array_length(v_screening))
  );
  return v_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.admin_set_job_published(p_job_id uuid, p_published boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_job public.jobs%rowtype;
begin
  if not public.has_permission('recruitment.manage') then
    raise exception 'Recruitment management permission required.' using errcode='42501';
  end if;

  select * into v_job from public.jobs
  where id=p_job_id and tenant_id=public.synesis_tenant_id();
  if not found then raise exception 'Job not found.' using errcode='P0002'; end if;

  if p_published then
    if not v_job.is_active then raise exception 'Inactive job cannot be published.' using errcode='22000'; end if;
    if v_job.application_deadline is null or v_job.application_deadline<current_date then
      raise exception 'A current or future application deadline is required before publishing.' using errcode='22000';
    end if;
    if v_job.is_salary_published and (v_job.salary_min is null or v_job.salary_max is null) then
      raise exception 'Published salary requires both minimum and maximum values.' using errcode='22000';
    end if;
  end if;

  update public.jobs
  set is_published=p_published,
      status=case when p_published then 'published'
                  else case when status='published' then 'draft' else status end end,
      published_at=case when p_published then coalesce(published_at,now()) else published_at end,
      posted_date=case when p_published then coalesce(posted_date,current_date) else posted_date end
  where id=p_job_id;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(
    auth.uid(),
    case when p_published then 'recruitment.job.published' else 'recruitment.job.unpublished' end,
    'job',p_job_id::text,'{}'::jsonb
  );
  return jsonb_build_object('success',true,'published',p_published);
end;
$function$

REVOKE ALL ON FUNCTION public.admin_save_job(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_job_published(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_job(uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_job_published(uuid,boolean) TO authenticated, service_role;
COMMIT;
