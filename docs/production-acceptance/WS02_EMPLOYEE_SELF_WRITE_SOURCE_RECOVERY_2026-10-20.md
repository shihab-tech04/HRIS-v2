# WS02 employee self-write source recovery and parity proposal — 2026-10-20

Read-only addendum to [PR #39](https://github.com/shihab-tech04/HRIS-v2/pull/39) and its [17:43 progress note](https://github.com/shihab-tech04/HRIS-v2/blob/0309e4022dc9db4182900899d99c87d107634411/docs/production-acceptance/WS02_API_SECURITY_PROGRESS_2026-10-20_1743_DHAKA.md). It continues the existing checkpoint.

## Result

- Recovered the exact live `pg_get_functiondef` output for all three hosted Employee self-write RPCs, plus signature, return type, owner, SECURITY DEFINER, fixed search_path, ACL and body MD5.
- **Versioned source parity: FAIL.** The approved HRIS migration history has no versioned definitions for these routines. The body MD5s identify this captured database snapshot; they are not migration versions or source-to-production parity.
- **Disposable two-tenant self-write tests: BLOCKED / NOT RUN.** No reviewed migration definitions exist to test, and this executor has no Docker, Supabase CLI, or PostgreSQL client/server. No test project was created.
- Production remained read-only. No DDL, DML, Auth, membership, tenant, role or migration-history write was made.

The deployed migration head remains the prior read-only checkpoint's `20261020044145`. Before this addendum PR #39 was at `0309e4022dc9db4182900899d99c87d107634411`.

## Hosted catalog contract

All three are `SECURITY DEFINER`, owner `postgres`, with `search_path=pg_catalog, public, auth`. ACL for each is `postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres`: authenticated/service_role EXECUTE; anon denied. No ACL change is proposed; whether service_role EXECUTE is needed requires owner review.

| Hosted function | Return | Body MD5 |
| --- | --- | --- |
| `employee_update_my_profile(p_payload jsonb)` | `uuid` | `4a4f83e5302e27be1bb9ab7ec6ee8212` |
| `employee_save_my_addresses_v2(p_rows jsonb)` | `integer` | `bd52644cbaf177c2302988238d7ab25c` |
| `employee_save_my_family_members_v2(p_rows jsonb)` | `integer` | `4c9a02034f08f6abfc94b9474c98d001` |

All call `is_live_session()` and `employee_for_auth_user()`. The hosted resolver requires a current Auth session, an active `admin_users` row, a linked employee whose status is not resigned/terminated, and the active tenant returned by `synesis_tenant_id()` (fixed slug `synesis-it`). None accepts a tenant/employee target or checks `tenant_memberships`. This is linked-self under the fixed tenant context; it does not establish generic active-tenant behavior. A B-only employee should fail with 42501. An active linked employee in `synesis-it` is not denied only because a tenant-membership row is absent. The reviewed test migration must provide these helper dependencies or point to their approved base source.

- Profile allowlist: `preferred_name, phone, gender, date_of_birth, address, mailing_address, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, father_name, mother_name, birthplace, blood_group, religion, nationality, marital_status, personal_email`. Only the linked employee is updated. Other input keys do not assign protected columns; audit stores input field names except `avatar_url`, not values.
- Addresses: up to 100 rows with `id,address_type,district,thana,post_code,city_village,road_block_house`. Locks parent and owned child rows; foreign IDs -> 42501; unknown keys, duplicate IDs, invalid address type, or omitted existing rows -> 22023. Omission does not delete. Audit stores row count and `preserved_ids=true`.
- Family: up to 100 rows with `id,name,phone,nid_number,date_of_birth,relationship,present_address,permanent_address,is_nominee,working_in_synesis,occupation,academic_qualification,blood_group,gender`. Name required; gender Male/Female/Other when supplied. Foreign IDs -> 42501; unknown keys, missing name, invalid gender, duplicate IDs, or omitted existing rows -> 22023. Omission does not delete. Audit stores row count and `preserved_ids=true`.

## Versioned source history

The prior PR #39 report scanned all 100 SQL migrations at development `b262cade4175fc98cac56af05f88c3d16e68dc53`; it found none of the three definitions. Current development is `c095cfdb3b8fa2c53ccdd794f6546286fe5522de`. GitHub compare `b262cade...c095cfd` is two commits ahead with four changed files, all under `tests/sql/isolated-auth/`; no migration changed, so that scan still covers the current tree.

Historical feature commits show the same gap:
- `56ff6665d41e2fa89c939dff1b306fecc9ca0b84` added profile-edit UI/assets/tests, no SQL migration.
- `192f91134653d29fb3bf4ad36f8b4684f350af6c` added only `20261016150216_employee_get_my_addresses.sql` (getter), not the save routine.
- `0f91e7989c365927262ed2be39f25f92781f979b` added emergency-contact UI/assets/tests, no SQL migration.
- `8c25d3d85f04e8de40e99f49aeb814fc403be599` added `20261016160100_employee_family_members_self_read_policy.sql` (read policy), not the save routine.

No approved migration filename, source commit, migration checksum or original DDL for these three self-write RPCs was found.

## Migration-parity proposal for WS06 / WS01 / WS05 review

1. WS06/schema owner supplies the original approved source and migration identity, or explicitly approves a new forward-only migration that restores the observed behavior. Do not backdate or alter applied history, or copy these evidence blocks into `supabase/migrations` without review.
2. Decide whether to preserve fixed `synesis-it` behavior and service_role EXECUTE, or approve a separate contract change. Do not silently switch to membership-based active-tenant behavior.
3. Confirm the approved base supplies the three helpers above. Preserve the approved bodies, owner, search_path, return types and ACL.
4. Add the cases below to the existing disposable Auth/Postgres harness and run against reviewed source with two synthetic tenants.
5. After release-owner approval, compare normalized `pg_get_functiondef`, SECURITY DEFINER, search_path and per-role EXECUTE with hosted catalog. That is the parity gate.

### Disposable acceptance matrix — NOT RUN

Fixture: synthetic active tenant A with slug `synesis-it`, tenant B with another slug, separate live GoTrue sessions, active `admin_users` rows, linked non-resigned/non-terminated employees, and child rows owned by each. Use authenticated clients only.

| Case | Required assertion |
| --- | --- |
| A profile update with allowed fields | Returns A UUID; only A fields change; audit has key names, no values. |
| A includes protected keys (`tenant_id`, `employment_status`, `user_id`) | Protected columns remain unchanged; do not require extra keys to be rejected. |
| B-only employee calls the targetless profile RPC | 42501; both tenants unchanged. This verifies fixed-tenant behavior only. |
| Missing linked employee, inactive `admin_users`, resigned/terminated employee, stale/no Auth session | 42501; no employee/audit mutation. |
| A inserts and updates its own address/family rows | Accepted; only A's rows change; returned count is exact. |
| A passes B's address/family ID | 42501; B's rows unchanged. |
| Address unknown key, duplicate ID, invalid type, or omitted existing row | 22023 and transaction leaves fixtures unchanged. |
| Family unknown key, missing name, invalid gender, duplicate ID, or omitted existing row | 22023 and transaction leaves fixtures unchanged. |
| Anonymous EXECUTE and direct authenticated child-table DML | Denied by ACL; assert privilege and request outcomes in disposable DB. |
| Active linked employee in A without a membership row | Characterize current behavior; do not assert a membership denial. Owner separately decides whether this lifecycle is desired. |

Invalid UUID/date/boolean casts should assert failure and rollback without assigning an unverified SQLSTATE. Child-table manager-read RLS is a separate known issue: the previous report records missing parent-tenant predicates and extra ACLs; these RPC tests do not repair or certify it.

## HR01 and Candidate source-only contracts — no-invention prerequisites

### HR01-02 / HR01-06 manager contact

Owner-reviewed file `20261014171952_employee_contact_details_editing.sql` is in release PR #38 head `686eec7016ec831e9b679500f28f553b8f93b14f`, blob `17994a63a8b7ae17a6bc12bbbb7165dd3254e093`. It defines only:
- `hris_get_tenant_employee_contact_details(p_tenant_id uuid, p_employee_id uuid) RETURNS jsonb`
- `hris_update_tenant_employee_contact_details(p_tenant_id uuid, p_employee_id uuid, p_contact_details jsonb) RETURNS jsonb`

Both require an active tenant and `has_tenant_permission(p_tenant_id,'employees.manage')`, and constrain by tenant plus employee ID. Update accepts exactly `official_email,personal_email,phone,official_phone,address,mailing_address,emergency_contact_name,emergency_contact_phone,emergency_contact_relation`; all keys are required, values string/null, lengths/email validated, same-tenant official-email duplicates rejected, row locked, changed field names audited without values. SECURITY DEFINER uses empty search path; ACL revokes PUBLIC/anon/service_role and grants authenticated only.

This is manager-scoped HR01-02/HR01-06 source, not an employee-self API. Hosted parity is absent. Existing source run `39378140222` / job `118480812801` passed the HR01 two-tenant source tests. No new endpoint, field, direct table write, or `admin_save_employee` fallback is proposed; keep HR01 call sites gated until release and hosted parity.

### Candidate recruiter pipeline/interview

The release source has seven functions; all seven are absent from hosted production. Preserve signatures/grants and existing gates:

| Function | Signature and return | EXECUTE source ACL |
| --- | --- | --- |
| `hris_get_recruitment_pipeline` | `(p_tenant_id uuid,p_search text DEFAULT NULL,p_stage text DEFAULT NULL,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0) RETURNS jsonb` | authenticated, service_role; revoke PUBLIC/anon |
| `hris_update_candidate_application_stage` | `(p_tenant_id uuid,p_application_id uuid,p_stage text) RETURNS jsonb` | authenticated, service_role; revoke PUBLIC/anon |
| `hris_issue_candidate_offer` | `(p_tenant_id uuid,p_application_id uuid,p_salary_amount numeric,p_salary_currency text,p_pay_period text,p_proposed_joining_date date,p_response_deadline date,p_terms text) RETURNS jsonb` | authenticated, service_role; revoke PUBLIC/anon |
| `hris_schedule_candidate_interview` | `(p_tenant_id uuid,p_application_id uuid,p_round_name text,p_format text,p_scheduled_at timestamp without time zone,p_duration_minutes integer,p_location_or_link text DEFAULT NULL,p_panel_members text[] DEFAULT '{}',p_instructions text DEFAULT NULL) RETURNS jsonb` | authenticated only; revoke PUBLIC/anon |
| `hris_get_candidate_interview_responses` | `(p_tenant_id uuid) RETURNS jsonb` | authenticated only; revoke PUBLIC/anon/service_role |
| `hris_save_candidate_interview_panel_notes` | `(p_tenant_id uuid,p_interview_id uuid,p_panel_notes text) RETURNS jsonb` | authenticated only; revoke PUBLIC/anon/service_role |
| `hris_complete_candidate_interview` | `(p_tenant_id uuid,p_interview_id uuid) RETURNS jsonb` | authenticated only; revoke PUBLIC/anon/service_role |

Bodies require a live session and tenant/role checks; tenant-bound queries are scoped. Pipeline read allows `recruitment.view` or `recruitment.manage`; mutations require `recruitment.manage`. Before exposing the new pipeline page, hosted parity and existing two-tenant acceptance are required for pipeline read and stage update. Offer/interview actions stay gated until each endpoint is hosted and tested. Six existing source paths passed in `39378140222`; offer issuance has no test. Do not invent more fields, transitions, idempotency, or grants.

Story scope in the canonical matrix: **E02-02, E02-04, E02-05, E02-06, E02-07; HR01-02, HR01-06; X02-02–X02-07, X02-09; X03-01, X03-02.** This evidence certifies none of them.

## CI and blockers

- PR #39 prior head `0309e4022dc9db4182900899d99c87d107634411`: build/browser run `39417825181` passed; it has no employee self-write DB calls.
- Release disposable run `39378140222` / job `118480812801`: 342/342 contract and 375/375 Auth/RLS checks passed for its recorded scope, including HR01 and six Candidate paths. It did not call these three self-write RPCs or offer issuance.
- WS06 run `39418189411` passed disposable Auth/Postgres/browser checks at its then-exact PR #42 head, but has no self-write calls. Companion `39418189536` failed Pages entry parity: built `app-C4oUgMGJ.js`/`app-GpVcVTBs.css` vs tracked `index.html` refs `app-2l-hdvDU.js`/`app-BWuIahKW.css`.
- This executor has Node v24.19.0/npm 11.9.0 but no Docker, Podman, psql, Supabase CLI, pg_ctl, initdb, or postgres.
- Release blockers: no reviewed versioned self-write DDL; no targeted E02 write tests; hosted cross-tenant acceptance has only one active tenant; HR01 contact APIs and seven Candidate APIs remain source-only/absent in production. **No E02, HR01, X02/X03 story certification is claimed.**

## Exact hosted definitions recovered

The following are captured verbatim from read-only `pg_get_functiondef`. They are evidence, not migrations.

### public.employee_update_my_profile

Catalog body MD5: `4a4f83e5302e27be1bb9ab7ec6ee8212`; owner `postgres`; SECURITY DEFINER; search_path `search_path=pg_catalog, public, auth`; ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.

```sql
CREATE OR REPLACE FUNCTION public.employee_update_my_profile(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_employee uuid := public.employee_for_auth_user();
begin
  if not public.is_live_session() or v_employee is null then
    raise exception 'Active employee session required.' using errcode='42501';
  end if;

  update public.employees
  set
    preferred_name = case when p_payload ? 'preferred_name' then nullif(btrim(p_payload->>'preferred_name'),'') else preferred_name end,
    phone = case when p_payload ? 'phone' then nullif(btrim(p_payload->>'phone'),'') else phone end,
    gender = case when p_payload ? 'gender' then nullif(p_payload->>'gender','') else gender end,
    date_of_birth = case when p_payload ? 'date_of_birth' then nullif(p_payload->>'date_of_birth','')::date else date_of_birth end,
    address = case when p_payload ? 'address' then nullif(btrim(p_payload->>'address'),'') else address end,
    mailing_address = case when p_payload ? 'mailing_address' then nullif(btrim(p_payload->>'mailing_address'),'') else mailing_address end,
    emergency_contact_name = case when p_payload ? 'emergency_contact_name' then nullif(btrim(p_payload->>'emergency_contact_name'),'') else emergency_contact_name end,
    emergency_contact_phone = case when p_payload ? 'emergency_contact_phone' then nullif(btrim(p_payload->>'emergency_contact_phone'),'') else emergency_contact_phone end,
    emergency_contact_relation = case when p_payload ? 'emergency_contact_relation' then nullif(btrim(p_payload->>'emergency_contact_relation'),'') else emergency_contact_relation end,
    father_name = case when p_payload ? 'father_name' then nullif(btrim(p_payload->>'father_name'),'') else father_name end,
    mother_name = case when p_payload ? 'mother_name' then nullif(btrim(p_payload->>'mother_name'),'') else mother_name end,
    birthplace = case when p_payload ? 'birthplace' then nullif(btrim(p_payload->>'birthplace'),'') else birthplace end,
    blood_group = case when p_payload ? 'blood_group' then nullif(btrim(p_payload->>'blood_group'),'') else blood_group end,
    religion = case when p_payload ? 'religion' then nullif(btrim(p_payload->>'religion'),'') else religion end,
    nationality = case when p_payload ? 'nationality' then nullif(btrim(p_payload->>'nationality'),'') else nationality end,
    marital_status = case when p_payload ? 'marital_status' then nullif(btrim(p_payload->>'marital_status'),'') else marital_status end,
    personal_email = case when p_payload ? 'personal_email' then nullif(lower(btrim(p_payload->>'personal_email')),'') else personal_email end,
    updated_at = now()
  where id=v_employee;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(
    auth.uid(),
    'employee.profile.self_updated',
    'employee',
    v_employee::text,
    jsonb_build_object(
      'fields',
      coalesce(
        (select jsonb_agg(key) from jsonb_each(p_payload) where key <> 'avatar_url'),
        '[]'::jsonb
      )
    )
  );

  return v_employee;
end;
$function$

```

### public.employee_save_my_addresses_v2

Catalog body MD5: `bd52644cbaf177c2302988238d7ab25c`; owner `postgres`; SECURITY DEFINER; search_path `search_path=pg_catalog, public, auth`; ACL `{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}`.

```sql
CREATE OR REPLACE FUNCTION public.employee_save_my_addresses_v2(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
 v_employee uuid := public.employee_for_auth_user();
 v_id uuid; v_existing uuid;
 v_seen uuid[] := '{}'::uuid[];
 v_count integer := 0; v_omitted integer;
 v_type text; r jsonb;
BEGIN
 IF NOT public.is_live_session() OR v_employee IS NULL THEN
   RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
 END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array'
    OR jsonb_array_length(p_rows)>100 THEN
   RAISE EXCEPTION 'Expected an array of up to 100 address records.' USING errcode='22023';
 END IF;
 PERFORM 1 FROM public.employees WHERE id=v_employee FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Employee record not found.' USING errcode='42501';
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   IF jsonb_typeof(r)<>'object' OR EXISTS (
     SELECT 1 FROM jsonb_object_keys(r) AS k
     WHERE k NOT IN ('id','address_type','district','thana','post_code','city_village','road_block_house')
   ) THEN
     RAISE EXCEPTION 'Unsupported address fields.' USING errcode='22023';
   END IF;
   v_id := nullif(r->>'id','')::uuid;
   v_type := coalesce(nullif(r->>'address_type',''),'Other');
   IF v_type NOT IN ('Present','Permanent','Other') THEN
     RAISE EXCEPTION 'Unsupported address type.' USING errcode='22023';
   END IF;
   IF v_id IS NOT NULL AND v_id=ANY(v_seen) THEN
     RAISE EXCEPTION 'Duplicate address ID.' USING errcode='22023';
   END IF;
   IF v_id IS NULL THEN
     INSERT INTO public.employee_addresses(employee_id,address_type,district,thana,post_code,city_village,road_block_house)
     VALUES(v_employee,v_type,nullif(r->>'district',''),nullif(r->>'thana',''),nullif(r->>'post_code',''),
            nullif(r->>'city_village',''),nullif(r->>'road_block_house',''))
     RETURNING id INTO v_id;
   ELSE
     SELECT id INTO v_existing FROM public.employee_addresses
       WHERE id=v_id AND employee_id=v_employee FOR UPDATE;
     IF NOT FOUND THEN
       RAISE EXCEPTION 'Address row does not belong to current employee.' USING errcode='42501';
     END IF;
     UPDATE public.employee_addresses SET
       address_type=CASE WHEN r ? 'address_type' THEN v_type ELSE address_type END,
       district=CASE WHEN r ? 'district' THEN nullif(r->>'district','') ELSE district END,
       thana=CASE WHEN r ? 'thana' THEN nullif(r->>'thana','') ELSE thana END,
       post_code=CASE WHEN r ? 'post_code' THEN nullif(r->>'post_code','') ELSE post_code END,
       city_village=CASE WHEN r ? 'city_village' THEN nullif(r->>'city_village','') ELSE city_village END,
       road_block_house=CASE WHEN r ? 'road_block_house' THEN nullif(r->>'road_block_house','') ELSE road_block_house END
       WHERE id=v_id AND employee_id=v_employee;
   END IF;
   v_seen := array_append(v_seen,v_id);
   v_count := v_count+1;
 END LOOP;
 SELECT count(*) INTO v_omitted FROM public.employee_addresses
   WHERE employee_id=v_employee AND NOT(id=ANY(v_seen));
 IF v_omitted<>0 THEN
   RAISE EXCEPTION 'Existing addresses cannot be removed by saving the list.' USING errcode='22023';
 END IF;
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),'employee.profile.addresses.saved_v2','employee',v_employee::text,
        jsonb_build_object('row_count',v_count,'preserved_ids',true));
 RETURN v_count;
END;
$function$

```

### public.employee_save_my_family_members_v2

Catalog body MD5: `4c9a02034f08f6abfc94b9474c98d001`; owner `postgres`; SECURITY DEFINER; search_path `search_path=pg_catalog, public, auth`; ACL `{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}`.

```sql
CREATE OR REPLACE FUNCTION public.employee_save_my_family_members_v2(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
 v_employee uuid := public.employee_for_auth_user();
 v_id uuid; v_seen uuid[] := '{}'::uuid[];
 v_count integer := 0; v_omitted integer;
 v_gender text; r jsonb;
BEGIN
 IF NOT public.is_live_session() OR v_employee IS NULL THEN
   RAISE EXCEPTION 'Active employee session required.' USING errcode='42501';
 END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>100 THEN
   RAISE EXCEPTION 'Expected an array of up to 100 family members.' USING errcode='22023';
 END IF;
 PERFORM 1 FROM public.employees WHERE id=v_employee FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee record not found.' USING errcode='42501'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   IF jsonb_typeof(r)<>'object' OR EXISTS (
     SELECT 1 FROM jsonb_object_keys(r) AS k
     WHERE k NOT IN ('id','name','phone','nid_number','date_of_birth','relationship','present_address',
                     'permanent_address','is_nominee','working_in_synesis','occupation',
                     'academic_qualification','blood_group','gender')
   ) THEN RAISE EXCEPTION 'Unsupported family member fields.' USING errcode='22023'; END IF;
   v_id := nullif(r->>'id','')::uuid;
   IF nullif(btrim(coalesce(r->>'name','')),'') IS NULL THEN
     RAISE EXCEPTION 'Family member name is required.' USING errcode='22023';
   END IF;
   v_gender:=nullif(btrim(coalesce(r->>'gender','')),'');
   IF v_gender IS NOT NULL AND v_gender NOT IN ('Male','Female','Other') THEN
     RAISE EXCEPTION 'Unsupported gender value.' USING errcode='22023';
   END IF;
   IF v_id IS NOT NULL AND v_id=ANY(v_seen) THEN
     RAISE EXCEPTION 'Duplicate family member ID.' USING errcode='22023';
   END IF;
   IF v_id IS NULL THEN
     INSERT INTO public.employee_family_members(employee_id,name,phone,nid_number,date_of_birth,relationship,present_address,permanent_address,is_nominee,working_in_synesis,occupation,academic_qualification,blood_group,gender)
     VALUES(v_employee,btrim(r->>'name'),nullif(r->>'phone',''),nullif(r->>'nid_number',''),nullif(r->>'date_of_birth','')::date,nullif(r->>'relationship',''),nullif(r->>'present_address',''),nullif(r->>'permanent_address',''),coalesce((r->>'is_nominee')::boolean,false),coalesce((r->>'working_in_synesis')::boolean,false),nullif(r->>'occupation',''),nullif(r->>'academic_qualification',''),nullif(r->>'blood_group',''),v_gender)
     RETURNING id INTO v_id;
   ELSE
     PERFORM 1 FROM public.employee_family_members
       WHERE id=v_id AND employee_id=v_employee FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Family member does not belong to current employee.' USING errcode='42501'; END IF;
     UPDATE public.employee_family_members SET
       name=btrim(r->>'name'),
       phone=CASE WHEN r ? 'phone' THEN nullif(r->>'phone','') ELSE phone END,
       nid_number=CASE WHEN r ? 'nid_number' THEN nullif(r->>'nid_number','') ELSE nid_number END,
       date_of_birth=CASE WHEN r ? 'date_of_birth' THEN nullif(r->>'date_of_birth','')::date ELSE date_of_birth END,
       relationship=CASE WHEN r ? 'relationship' THEN nullif(r->>'relationship','') ELSE relationship END,
       present_address=CASE WHEN r ? 'present_address' THEN nullif(r->>'present_address','') ELSE present_address END,
       permanent_address=CASE WHEN r ? 'permanent_address' THEN nullif(r->>'permanent_address','') ELSE permanent_address END,
       is_nominee=CASE WHEN r ? 'is_nominee' THEN coalesce((r->>'is_nominee')::boolean,false) ELSE is_nominee END,
       working_in_synesis=CASE WHEN r ? 'working_in_synesis' THEN coalesce((r->>'working_in_synesis')::boolean,false) ELSE working_in_synesis END,
       occupation=CASE WHEN r ? 'occupation' THEN nullif(r->>'occupation','') ELSE occupation END,
       academic_qualification=CASE WHEN r ? 'academic_qualification' THEN nullif(r->>'academic_qualification','') ELSE academic_qualification END,
       blood_group=CASE WHEN r ? 'blood_group' THEN nullif(r->>'blood_group','') ELSE blood_group END,
       gender=CASE WHEN r ? 'gender' THEN v_gender ELSE gender END
       WHERE id=v_id AND employee_id=v_employee;
   END IF;
   v_seen:=array_append(v_seen,v_id); v_count:=v_count+1;
 END LOOP;
 SELECT count(*) INTO v_omitted FROM public.employee_family_members
  WHERE employee_id=v_employee AND NOT(id=ANY(v_seen));
 IF v_omitted<>0 THEN
  RAISE EXCEPTION 'Existing family member cannot be removed by saving the list.' USING errcode='22023';
 END IF;
 INSERT INTO public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 VALUES(auth.uid(),'employee.profile.family_members.saved_v2','employee',v_employee::text,
  jsonb_build_object('row_count',v_count,'preserved_ids',true));
 RETURN v_count;
END;
$function$

```
