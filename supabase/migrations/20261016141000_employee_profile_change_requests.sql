-- E02-03 / E02-17: employees request corrections to HR-controlled profile
-- fields, and an authorized self-service reviewer records the decision.
create table public.employee_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  field_key text not null check (field_key in (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation',
    'father_name', 'mother_name', 'birthplace', 'blood_group', 'religion',
    'nid_number', 'passport_number', 'etin_number'
  )),
  requested_value text not null check (length(btrim(requested_value)) between 1 and 500),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_profile_change_resolution_consistency check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index employee_profile_change_one_pending_per_field
  on public.employee_profile_change_requests(tenant_id, employee_id, field_key)
  where status = 'pending';
create index employee_profile_change_employee_history
  on public.employee_profile_change_requests(tenant_id, employee_id, submitted_at desc);
create index employee_profile_change_pending_review
  on public.employee_profile_change_requests(tenant_id, submitted_at desc)
  where status = 'pending';

alter table public.employee_profile_change_requests enable row level security;
revoke all on table public.employee_profile_change_requests from public, anon, authenticated;
grant select (
  id, tenant_id, employee_id, requested_by, field_key, reason, status,
  submitted_at, reviewed_by, reviewed_at, review_note, created_at, updated_at
) on table public.employee_profile_change_requests to authenticated;

create policy employee_profile_change_read_own_or_authorized_review
  on public.employee_profile_change_requests
  for select to authenticated
  using (
    public.is_live_session()
    and tenant_id = public.synesis_tenant_id()
    and (
      employee_id = public.employee_for_auth_user()
      or public.has_permission('self_service.manage')
    )
  );

create or replace function public.employee_submit_profile_change_request(
  p_field_key text,
  p_requested_value text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_employee uuid := public.employee_for_auth_user();
  v_tenant uuid := public.synesis_tenant_id();
  v_value text := nullif(btrim(coalesce(p_requested_value, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current text;
  v_id uuid;
begin
  if not public.is_live_session() or v_employee is null or v_tenant is null then
    raise exception 'Active employee session required.' using errcode = '42501';
  end if;
  if p_field_key is null or p_field_key not in (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation',
    'father_name', 'mother_name', 'birthplace', 'blood_group', 'religion',
    'nid_number', 'passport_number', 'etin_number'
  ) then
    raise exception 'This profile field is not available for an employee change request.' using errcode = '22023';
  end if;
  if v_value is null or length(v_value) > 500 then
    raise exception 'Enter a proposed value of 1 to 500 characters.' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) > 1000 then
    raise exception 'Enter a reason of 1 to 1000 characters.' using errcode = '22023';
  end if;
  if p_field_key in ('official_email', 'personal_email')
     and v_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  select case p_field_key
    when 'full_name' then e.full_name
    when 'official_email' then e.official_email
    when 'personal_email' then e.personal_email
    when 'official_phone' then e.official_phone
    when 'address' then e.address
    when 'mailing_address' then e.mailing_address
    when 'emergency_contact_name' then e.emergency_contact_name
    when 'emergency_contact_phone' then e.emergency_contact_phone
    when 'emergency_contact_relation' then e.emergency_contact_relation
    when 'father_name' then e.father_name
    when 'mother_name' then e.mother_name
    when 'birthplace' then e.birthplace
    when 'blood_group' then e.blood_group
    when 'religion' then e.religion
    when 'nid_number' then e.nid_number
    when 'passport_number' then e.passport_number
    when 'etin_number' then e.etin_number
  end
  into v_current
  from public.employees e
  where e.id = v_employee and e.tenant_id = v_tenant;
  if not found then
    raise exception 'Linked employee record not found.' using errcode = 'P0002';
  end if;
  if v_current is not distinct from v_value then
    raise exception 'The proposed value matches the current value.' using errcode = '22023';
  end if;

  insert into public.employee_profile_change_requests(
    tenant_id, employee_id, requested_by, field_key, requested_value, reason
  ) values (v_tenant, v_employee, auth.uid(), p_field_key, v_value, v_reason)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'A pending request already exists for this profile field.' using errcode = '23505';
end;
$function$;

create or replace function public.employee_get_my_profile_change_requests()
returns table (
  id uuid,
  field_key text,
  reason text,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_employee uuid := public.employee_for_auth_user();
  v_tenant uuid := public.synesis_tenant_id();
begin
  if not public.is_live_session() or v_employee is null or v_tenant is null then
    raise exception 'Active employee session required.' using errcode = '42501';
  end if;
  return query
    select r.id, r.field_key, r.reason, r.status, r.submitted_at, r.reviewed_at, r.review_note
    from public.employee_profile_change_requests r
    where r.employee_id = v_employee and r.tenant_id = v_tenant
    order by r.submitted_at desc
    limit 50;
end;
$function$;

create or replace function public.admin_list_profile_change_requests()
returns table (
  id uuid,
  employee_id uuid,
  employee_number text,
  full_name text,
  field_key text,
  requested_value text,
  reason text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if not public.is_live_session() or not public.has_permission('self_service.manage') then
    raise exception 'Self-service management permission required.' using errcode = '42501';
  end if;
  return query
    select r.id, r.employee_id, e.employee_number, e.full_name,
      r.field_key, r.requested_value, r.reason, r.submitted_at
    from public.employee_profile_change_requests r
    join public.employees e on e.id = r.employee_id and e.tenant_id = r.tenant_id
    where r.tenant_id = public.synesis_tenant_id() and r.status = 'pending'
    order by r.submitted_at asc
    limit 100;
end;
$function$;

create or replace function public.admin_review_profile_change_request(
  p_id uuid,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  r public.employee_profile_change_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_live_session() or not public.has_permission('self_service.manage') then
    raise exception 'Self-service management permission required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Review note must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  select * into r
  from public.employee_profile_change_requests
  where id = p_id
    and tenant_id = public.synesis_tenant_id()
    and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending profile change request not found.' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    update public.employees e set
      full_name = case when r.field_key = 'full_name' then r.requested_value else e.full_name end,
      official_email = case when r.field_key = 'official_email' then r.requested_value else e.official_email end,
      personal_email = case when r.field_key = 'personal_email' then r.requested_value else e.personal_email end,
      official_phone = case when r.field_key = 'official_phone' then r.requested_value else e.official_phone end,
      address = case when r.field_key = 'address' then r.requested_value else e.address end,
      mailing_address = case when r.field_key = 'mailing_address' then r.requested_value else e.mailing_address end,
      emergency_contact_name = case when r.field_key = 'emergency_contact_name' then r.requested_value else e.emergency_contact_name end,
      emergency_contact_phone = case when r.field_key = 'emergency_contact_phone' then r.requested_value else e.emergency_contact_phone end,
      emergency_contact_relation = case when r.field_key = 'emergency_contact_relation' then r.requested_value else e.emergency_contact_relation end,
      father_name = case when r.field_key = 'father_name' then r.requested_value else e.father_name end,
      mother_name = case when r.field_key = 'mother_name' then r.requested_value else e.mother_name end,
      birthplace = case when r.field_key = 'birthplace' then r.requested_value else e.birthplace end,
      blood_group = case when r.field_key = 'blood_group' then r.requested_value else e.blood_group end,
      religion = case when r.field_key = 'religion' then r.requested_value else e.religion end,
      nid_number = case when r.field_key = 'nid_number' then r.requested_value else e.nid_number end,
      passport_number = case when r.field_key = 'passport_number' then r.requested_value else e.passport_number end,
      etin_number = case when r.field_key = 'etin_number' then r.requested_value else e.etin_number end,
      updated_at = now()
    where e.id = r.employee_id and e.tenant_id = r.tenant_id;
    if not found then
      raise exception 'Linked employee record not found.' using errcode = 'P0002';
    end if;
  end if;

  update public.employee_profile_change_requests
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = v_note, updated_at = now()
  where id = r.id;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  values (
    auth.uid(), 'self_service.profile_change.' || p_decision,
    'employee_profile_change_request', r.id::text,
    jsonb_build_object('employee_id', r.employee_id, 'field_key', r.field_key)
  );
  return jsonb_build_object('success', true, 'status', p_decision);
end;
$function$;

revoke all on function public.employee_submit_profile_change_request(text, text, text) from public, anon, authenticated;
revoke all on function public.employee_get_my_profile_change_requests() from public, anon, authenticated;
revoke all on function public.admin_list_profile_change_requests() from public, anon, authenticated;
revoke all on function public.admin_review_profile_change_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.employee_submit_profile_change_request(text, text, text) to authenticated;
grant execute on function public.employee_get_my_profile_change_requests() to authenticated;
grant execute on function public.admin_list_profile_change_requests() to authenticated;
grant execute on function public.admin_review_profile_change_request(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
