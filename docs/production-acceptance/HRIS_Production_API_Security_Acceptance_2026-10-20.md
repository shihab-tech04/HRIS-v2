# HRIS Production API and Security Acceptance — 2026-10-20

## Live API/security recheck — authoritative addendum (2026-10-20)

This addendum supersedes any earlier statement in this report or the WS06 audit that employee self-write RPCs are absent. It separates hosted catalog facts, source contracts, isolated test results, and production session limits. No story is marked certified here without independent story-ID acceptance evidence.

### Rechecked repository heads

| Item | Current ref |
|---|---|
| Production main | cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7 |
| Development checkpoint | 1714a08e24f47999618b0127fc818a3d19eb187a |
| PR #39 evidence | c92838b9d7ea9f5ec680393dae545b07afa7967c |
| PR #38 release candidate / source under review | 686eec7016ec831e9b679500f28f553b8f93b14f |
| PR #42 WS06 | 2c0a48c9e6e43cda9893e34665c1ffef85d410f2 |
| PR #43 WS07 | c6f912dec4f892de96a4bf9376c3428bc210890e |
| PR #44 WS08 | f4c44bf52c4041232d591746651ee409ccf8c120 |
| Stable release branch | 567e10f889ca82f6a90e3b20e7cfdb8514b5c37e |

### Permission root cause and narrow remedy

The deployed contract is internally consistent:

- public.has_permission(p_permission_id text) is SECURITY DEFINER with an empty search_path and returns public.has_tenant_permission(public.synesis_tenant_id(), p_permission_id).
- public.has_tenant_permission(p_tenant_id uuid, p_permission_id text) requires a live Auth session, non-null IDs, an active tenant, an active tenant_memberships row for auth.uid(), an active role, and the exact role_permissions.permission_id. It does not read user_roles.
- The separate public.platform_hris_is_super_admin() checks admin_users.active and admin_users.is_super_admin plus live/valid Auth status. That platform identity does not grant tenant permissions by itself.

The live aggregate recheck found one active tenant, one active tenant-membership row, one active Super Admin, and that membership belongs to that Super Admin. The membership role is Tenant HR administrator and its only permission is organization.manage. The separate System Administrator has one legacy user_roles assignment and 45 role_permissions, but zero active tenant memberships. Therefore has_permission('employees.manage') and has_permission('recruitment.manage') are false for that account because the membership join fails before the legacy role can matter. This is the exact reason a System Administrator with legacy permissions is rejected by tenant APIs.

**Proposal only:** keep the current rejection unless the product owner confirms that this specific System Administrator should act within a named tenant. If confirmed, grant one explicit membership for that tenant through the reviewed owner-controlled path and use a role limited to the approved existing permission IDs needed for the job. Do not make user_roles a fallback, activate the 45-permission legacy role for tenant APIs, or broaden the sole Super Admin. The deployed roles do not currently offer a least-privilege employees.manage or recruitment.manage role, so there is no safe membership row to add without owner role approval.

### HR01 contact RPCs

Hosted production does not contain either contact RPC. The history query reports migration 20261014171952 absent, and to_regprocedure is false for both signatures. The separate broad admin_save_employee endpoint is not equivalent to this narrow contact contract.

The development source contract is:

| RPC | Signature and behavior | Source ACL |
|---|---|---|
| hris_get_tenant_employee_contact_details | (p_tenant_id uuid, p_employee_id uuid) RETURNS jsonb | SECURITY DEFINER; revoke PUBLIC, anon, service_role; grant EXECUTE to authenticated only |
| hris_update_tenant_employee_contact_details | (p_tenant_id uuid, p_employee_id uuid, p_contact_details jsonb) RETURNS jsonb | SECURITY DEFINER; revoke PUBLIC, anon, service_role; grant EXECUTE to authenticated only |

Both require an active tenant plus has_tenant_permission(p_tenant_id, 'employees.manage') and constrain the employee lookup/update by both employee ID and tenant ID. The update payload accepts only official_email, personal_email, phone, official_phone, address, mailing_address, emergency_contact_name, emergency_contact_phone, and emergency_contact_relation; rejects non-string/non-null values and unknown keys; validates lengths and email; rejects duplicate same-tenant official email; and audits changed field names without contact values. The development OrganizationEmployeeDirectory call sites pass p_tenant_id and the selected p_employee_id. These are source facts, not deployed parity.

**Isolated test result:** workflow 39378140222, job 118480812801 ran the local Auth/RLS harness with synthetic tenant A/B users. Its logs show the contact read/save positive path and denials for viewer, no-permission, global-only, inactive membership, foreign tenant, anonymous, invalid fields, duplicate email, and direct table updates. The log records SQLSTATE 42501 for authorization denials, 22023 for invalid payloads, and 23505 for duplicate email. The HR01 contact source contract passes in the disposable environment; hosted parity fails because both functions are absent in production.

**Workstation 1 proposal:** keep any UI path that calls these source-only functions disabled until the reviewed migration is delivered through the release process and hosted parity is rechecked. Do not substitute direct employee table writes or the broad employee-save RPC.

### WS06 E02 self-service contracts

Hosted production has the following authenticated-only SECURITY DEFINER functions; anon EXECUTE is false. Employees, employee_addresses, and employee_family_members have RLS enabled. Authenticated direct UPDATE/INSERT/DELETE privileges are false for these tables, so writes must use the RPCs.

| Story scope | Deployed RPC | Current server authorization and row boundary |
|---|---|---|
| E02-02 editable profile; E02-04 contact; E02-06 emergency contact | employee_update_my_profile(p_payload jsonb) RETURNS uuid | Requires is_live_session() and employee_for_auth_user(). The helper maps auth.uid() through an active admin_users row to the caller’s own non-resigned/non-terminated employee in synesis_tenant_id(). The RPC writes only its hard-coded own-row column set: preferred_name, phone, gender, date_of_birth, address, mailing_address, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, father_name, mother_name, birthplace, blood_group, religion, nationality, marital_status, and personal_email. It accepts no target employee or tenant argument. Extra keys do not change protected columns; audit details record keys, not values. No tenant_memberships check is performed by this self-write path. |
| E02-05 present/permanent addresses | employee_save_my_addresses_v2(p_rows jsonb) RETURNS integer | Requires a live session and linked own employee via employee_for_auth_user(). Allows up to 100 objects with id, address_type, district, thana, post_code, city_village, and road_block_house. A supplied ID must belong to the current employee. Unknown keys, invalid type, duplicate IDs, and omitted existing rows are rejected. |
| E02-07 family/dependents | employee_save_my_family_members_v2(p_rows jsonb) RETURNS integer | Requires a live session and linked own employee via employee_for_auth_user(). Allows up to 100 objects with id, name, phone, nid_number, date_of_birth, relationship, present_address, permanent_address, is_nominee, working_in_synesis, occupation, academic_qualification, blood_group, and gender. A supplied ID must belong to the current employee. Unknown keys, invalid values, duplicate IDs, and omitted existing rows are rejected. |
| E02-03/E02-17 protected-field requests and status | employee_submit_profile_change_request(p_tenant_id uuid, p_field_key text, p_requested_value text, p_reason text) RETURNS uuid; employee_get_my_profile_change_requests(p_tenant_id uuid) RETURNS table | Both require hris_profile_change_active_member(p_tenant_id) and the linked employee for that tenant. They need an active tenant membership. The submitted field key is allowlisted; review requires self_service.manage. |

The first three self-write RPCs are identity-scoped, not tenant-membership-scoped: employee_for_auth_user() requires an active linked employee account but fixes the tenant to synesis_tenant_id(); it does not accept a client-supplied employee or tenant ID. This prevents a caller from selecting another employee through these signatures, but it is not evidence that the intended future multi-tenant membership policy has been approved. The protected profile-change request RPCs have a separate, explicit active-membership contract.

The current main LiveApp.tsx calls employee_update_my_profile({p_payload}), employee_save_my_addresses_v2({p_rows}), and employee_save_my_family_members_v2({p_rows}) with matching signatures. Its profile-change calls do not match the deployed signatures: it invokes employee_get_my_profile_change_requests() with no arguments and omits p_tenant_id from employee_submit_profile_change_request. That is a frontend/API signature mismatch. The narrow frontend proposal is:

- Call employee_get_my_profile_change_requests with { p_tenant_id: tenantId }.
- Add p_tenant_id: tenantId to employee_submit_profile_change_request alongside p_field_key, p_requested_value, and p_reason.

The function itself validates active membership and ownership; the client must use the active tenant from the authenticated context, not a guessed/local default. No runtime employee session was available to observe the mismatch over production HTTP.

**Test boundary:** the disposable 39378140222 and latest WS06 39393639383 runners exercise profile-change requests (E02-03/E02-17), but their Auth/RLS script contains no calls to employee_update_my_profile, employee_save_my_addresses_v2, or employee_save_my_family_members_v2. The separate employee-family workflow tests read isolation, not these write RPCs. Thus these deployed function definitions and UI request shapes are verified, but E02-02 and E02-04 through E02-07 are not certified and their synthetic positive/negative write tests remain outstanding.

**Runnable disposable acceptance proposal:** in the existing local-only Auth/RLS harness, use its employeeA and employeeB sessions and tenant A/B fixtures; do not point it at a cloud project.

1. employeeA calls employee_update_my_profile with a changed preferred_name/phone and extra employee_id, tenant_id, official_email, and employment_status keys. Assert success for employeeA’s own ID, only allowlisted profile columns change, and official_email/employment_status/user_id/tenant_id remain unchanged.
2. employeeB (tenant B) and managerA (unlinked employee account) call the same profile RPC. Assert SQLSTATE 42501. Attempt direct authenticated UPDATE on employees and assert privilege/authorization denial.
3. employeeA inserts and updates one own address through employee_save_my_addresses_v2; repeat with an address ID owned by employeeB and assert 42501. Assert unknown keys and omitted existing IDs return 22023; direct authenticated table writes remain denied.
4. Repeat for employee_save_my_family_members_v2 with a synthetic own family row and employeeB’s row ID; assert own success, foreign ID 42501, invalid key/omission 22023, and direct table writes denied.
5. Call both profile-change RPCs with p_tenant_id=tenantA as employeeA and assert success/read of own request; use tenantB, inactive membership, and an unlinked caller for 42501; confirm review without self_service.manage is denied.

These cases are proposed, not run. The current disposable CI passed 375/375 other Auth/RLS assertions; that aggregate is not a result for the five unrun E02 write cases above.

### HR03 legal entities and WS08 SA06 master data

HR03-01 remains blocked because production has no public.legal_entities relation and no legal-entity API. The nine HR03 requirements do not yet specify cardinality, identity fields, lifecycle/archive rules, legal-entity-to-employee linkage, or historical/effective-date behavior. Production admin_get_organization_masters() is a SECURITY DEFINER read-only tenant API requiring organization.view or organization.manage; it returns existing organization arrays and does not implement legal entities. Do not adopt speculative DDL or API names. WS07’s PR #43 proposal correctly leaves the physical contract to product/WS01/WS02 decisions.

SA06-01 through SA06-04 specify master-data intents but not the catalog list, fields, ownership scope, duplicate rules, lifecycle, or API. Production has no platform-global master-data writer. platform_hris_is_super_admin() and platform_hris_list_tenants() do not authorize arbitrary master-data access. The tenant-scoped organization reader is not an SA06 API. The source-only hris_save_leave_type path is a tenant leave.manage operation, not SA06, and its migration 20261016142000 is absent in production.

Separate least-privilege discrepancy: authenticated has direct INSERT/UPDATE/DELETE table ACLs on production leave_types, while RLS policies are SELECT-only, so the current write paths are rejected by RLS. Proposal only, if the owner confirms there is no approved direct-table writer: add a reviewed ACL revocation of INSERT, UPDATE, DELETE on public.leave_types from PUBLIC, anon, and authenticated; do not add a grant fallback or execute a production change in WS02.

### WS03 Candidate/interview RPC contract and release gate

All seven source RPCs below are absent from hosted production. They are in the release source at 686eec7016ec831e9b679500f28f553b8f93b14f. Every SECURITY DEFINER body requires active tenant/session/role checks and tenant-equality joins or filters; mutation APIs require recruitment.manage, while pipeline read permits recruitment.view or recruitment.manage.

| RPC signature | Source execute grant | Call site and release criticality | Isolated CI |
|---|---|---|---|
| hris_get_recruitment_pipeline(p_tenant_id uuid, p_search text DEFAULT NULL, p_stage text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb | Revoke PUBLIC/anon; authenticated and service_role | RecruitmentPipeline.tsx:528 read on page load. Release-critical if the new pipeline page is mounted. | PASS: tenant A/B managers see only own tenant; foreign tenant, global-only, inactive membership, anon, and no-permission denied. |
| hris_update_candidate_application_stage(p_tenant_id uuid, p_application_id uuid, p_stage text) RETURNS jsonb | Revoke PUBLIC/anon; authenticated and service_role | RecruitmentPipeline.tsx:443. Release-critical for any exposed stage-change action; gated by canManageApplicationStages. | PASS: valid stage path plus view-only/no-permission/foreign tenant/invalid transition denials. |
| hris_issue_candidate_offer(p_tenant_id uuid, p_application_id uuid, p_salary_amount numeric, p_salary_currency text, p_pay_period text, p_proposed_joining_date date, p_response_deadline date, p_terms text) RETURNS jsonb | Revoke PUBLIC/anon; authenticated and service_role | RecruitmentPipeline.tsx:60, gated by canManageOffers. Later-gated if offers remain disabled. | BLOCKED: current suite does not call this function. |
| hris_schedule_candidate_interview(p_tenant_id uuid, p_application_id uuid, p_round_name text, p_format text, p_scheduled_at timestamp without time zone, p_duration_minutes integer, p_location_or_link text DEFAULT NULL, p_panel_members text[] DEFAULT '{}', p_instructions text DEFAULT NULL) RETURNS jsonb | Revoke PUBLIC/anon; authenticated only | RecruitmentPipeline.tsx:159, gated by canManageOffers. Later-gated with interview controls. | PASS: authorized schedule and cross-tenant/unprivileged denials. |
| hris_get_candidate_interview_responses(p_tenant_id uuid) RETURNS jsonb | Final grant authenticated only; revoke PUBLIC, anon, and service_role | RecruitmentPipeline.tsx:333, response list mounted under canManageOffers. Later-gated. | PASS: same-tenant responses and foreign/unprivileged privacy denials. |
| hris_save_candidate_interview_panel_notes(p_tenant_id uuid, p_interview_id uuid, p_panel_notes text) RETURNS jsonb | Final grant authenticated only; revoke PUBLIC, anon, and service_role | RecruitmentPipeline.tsx:286, panel-note save under canManageOffers. Later-gated. | PASS: same-tenant write, foreign/unprivileged and oversize denials; direct table access denied. |
| hris_complete_candidate_interview(p_tenant_id uuid, p_interview_id uuid) RETURNS jsonb | Final grant authenticated only; revoke PUBLIC, anon, and service_role | RecruitmentPipeline.tsx:310, scheduled/confirmed state action under canManageOffers. Later-gated. | PASS: valid completion/idempotency plus wrong role, tenant, anonymous and invalid-state denials. |

The release source currently gates the five offer/interview controls under canManageOffers. They can remain disabled while the pipeline read and stage action are released only after their two APIs are hosted and independently accepted. Production main still uses its existing admin_get_recruitment_data() path and does not call the seven new RPCs; the new release component would fail API parity if enabled against the current hosted schema. Do not replay development migrations from WS02.

### Updated acceptance matrix

| Acceptance item | Result | Evidence |
|---|---|---|
| Deployed has_permission / tenant membership contract | PASS | Read-only pg_get_functiondef and role/membership aggregates; exact membership requirement described above. |
| Sole Super Admin identity and current signed-in app session | PASS | One active Super Admin and one active tenant; connected app tab shows authenticated workspace and Sign out control; prior read-only HTTP request evidence remains valid. |
| System Administrator tenant permission result | PASS — expected denial | One legacy user, 45 legacy permissions, zero active memberships; has_permission does not read user_roles. |
| HR01 contact RPCs hosted parity | FAIL | Both exact signatures and migration 20261014171952 absent in production. |
| HR01 synthetic source API tenant/role tests | PASS | Run 39378140222/job 118480812801 positive and denied contact tests in disposable two-tenant Auth/Postgres. |
| E02 self-update/address/family hosted signatures and grants | PASS | Read-only function catalog/definitions, no direct DML ACL, own-row SECURITY DEFINER guards. |
| E02 self-update/address/family synthetic writes | BLOCKED | Existing isolated runners do not call the three functions; no employee signed-in production session. Runnable cases are above. |
| E02 profile-change request UI signature | FAIL | Main source omits required p_tenant_id in get and submit calls; no production employee session available for HTTP reproduction. |
| HR03 legal entities | BLOCKED | No production table/API; product model and lifecycle are unspecified. |
| SA06 master-data API | BLOCKED | Scope/catalog/API unspecified and no platform master-data writer is deployed. |
| Production leave_types direct DML ACL | FAIL — least-privilege follow-up | Authenticated ACL allows DML but only SELECT RLS policies exist; writes currently denied by RLS. Proposal only; no change made. |
| Candidate/interview hosted parity | FAIL for new release component | All seven signatures absent from hosted production; current main uses legacy path. |
| Candidate/interview disposable source tests | PASS for six / BLOCKED for offer | Pipeline, stage, schedule, responses, notes, completion pass; offer issuance has no test in the current suite. |
| System Administrator intended tenant access | BLOCKED | Product/role intent is unspecified; no approved least-privilege active membership exists for this user. |\n| Independent HR/Admin and employee production sessions | BLOCKED | No separately identified HR/Admin or employee session was open in the connected browser; the available acceptance tab shows the signed-in workspace. Production has no second active tenant membership. |
| Production positive/rejected cross-tenant API acceptance | BLOCKED | Production has one active tenant; synthetic two-tenant tests are isolated CI only. |
| Production mutation safety | PASS | No DDL, DML, Auth-user, membership, role, tenant, migration-history, or setting changes were made. |

### Owner handoffs and story certification

- WS01: fix the two profile-change RPC argument objects in main as specified above; preserve the existing self-only RPC argument shapes; do not surface the HR01 source UI until the exact tenant-scoped contact APIs are in a reviewed release. Add the targeted two-tenant E02 cases before marking E02-02/E02-04/E02-05/E02-06/E02-07 accepted.
- WS06: refresh PR #42 because the current source/deployed catalog contradicts its prior “no employee self-update API” statement. The hosted contract exists; story certification and independent synthetic write evidence remain outstanding.
- WS07: keep HR03-01 blocked until product approves cardinality, fields, lifecycle, employee linkage, and effective-date/history semantics.
- WS08: keep SA06 blocked until the catalog and authorization scope are approved; do not treat tenant leave types or platform tenant listing as the SA06 master-data API.
- WS03/WS05: do not enable the release Candidate page until pipeline read/stage parity and separate offer/interview gates have matching hosted contracts. Workstation 5 remains the release controller.

No E02, HR03, SA06, or WS03 story is certified by this addendum. PR #39 remains draft and no code was merged or deployed.


**Result: PARTIAL / NOT ACCEPTED as a full production release gate.** The connected production browser verifies one authorized Super Admin session and its read-only API outcomes. I also reused a free, disposable two-tenant Auth/Postgres CI stack: workflow run [39378140222](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140222), job [118480812801](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140222/job/118480812801), passed 342/342 contract checks and 375/375 local Auth/RLS checks. That isolated evidence covers synthetic HR/Admin, employee, platform Super Admin, no-permission and global-only callers, including cross-tenant denials. It does not replace production acceptance. Production still has one tenant and one active tenant membership, so independent HR/Admin, linked employee, and production cross-tenant tests remain blocked. All seven candidate/interview RPCs remain absent from hosted production.

## Scope and safety

Target production project: **hrmis-saas** / **oslgwxaqfbteqtwqvdzs**. The hosted database is **ACTIVE_HEALTHY** and its migration head is **20261020044145** (phase03_learning_context_authenticated_acl_20261020).

All production SQL statements were read-only SELECTs. The live browser actions opened read-only screens. Production logs were aggregated to method, path, role, status, and row-count metadata for the signed-in session. No production records or schema were changed; no migrations were replayed; no token, password, recovery code, OTP, or employee record contents were collected. One signed-in account identifier was used transiently to match the browser session to its authorization row and is omitted here.

## Signed-in production acceptance matrix

| Check | Result | Evidence |
|---|---|---|
| Production health and migration head | **PASS** | Supabase reports ACTIVE_HEALTHY; both the migration listing and database migration table end at 20261020044145. |
| Hosted app responds and has an authorized session | **PASS** | Connected Chrome loaded the production Pages app and showed an authenticated HRIS workspace. The served index.html points to assets/app-D0JtBbVh.js, which is present in current main. |
| Sole Shihab Super Admin account | **PASS — identity and session only** | Read-only SQL found one active Super Admin with confirmed, non-deleted, non-banned Auth status. The connected browser session matched that account and the database showed one current valid session. No other Super Admin exists. |
| Super Admin's existing tenant access | **PASS — limited tenant read** | The signed-in account has an active hr_admin membership in synesis-it. Authenticated GET /rest/v1/tenants returned the one active tenant; GET /rest/v1/departments returned 2 rows (200, content range 0-1/2). |
| Production platform Super Admin tenant-management UI | **FAIL** | The production workspace labels Tenant configuration as “Workflow pending.” platformTenantApi.ts is stage-only and the production UI does not mount platform_hris_list_tenants(). |
| Current hr_admin permissions | **FAIL — role does not cover HR directory/recruiting** | The only active tenant membership belongs to the Super Admin and role hr_admin has only organization.manage. The signed-in account could read departments, but the employee directory returned no visible rows and Candidate pipeline displayed “Recruitment view permission is required.” |
| Employee directory RLS denial | **PASS — expected deny for this account** | Authenticated GET /rest/v1/employees returned 200 with no visible rows. A separate read-only SQL aggregate counted 5 employee rows in production; this account has no linked employee record and lacks employees.view/employees.manage. Production employee RLS policies require a linked employee row or a tenant-scoped view/manage permission. |
| Candidate pipeline role restriction | **PASS — expected deny for this account** | Signed-in UI displayed “Access restricted”; authenticated HEAD /rest/v1/jobs returned 403. Permission RPC requests returned 200; no recruiter data or candidate records were exposed. No candidate RPC mutation was attempted. |
| Employee View for the Super Admin account | **FAIL — denial is rendered as a database error** | The account is not an employee. Its Employee View requests to employee_get_leave_context, employee_get_expense_context, employee_get_notice_context, employee_get_my_performance_context, employee_get_travel_context, employee_get_dashboard_schedule, employee_get_my_payslips, and employee_get_self_service_context returned authenticated 403s. SQL confirms these RPCs require a live employee session and a linked employee. The UI showed a generic “Database read failed” alongside “No linked employee profile is available.” No personal data was returned. |
| Separate System Administrator tenant access | **FAIL — no tenant authorization; runtime signed-in check BLOCKED** | Read-only SQL shows the separate active System Administrator has user_roles.role_id = hris_system_admin, an active role with 45 legacy permission rows, and no active tenant membership. Hosted has_permission() delegates to has_tenant_permission() and does not consult user_roles, so those legacy permissions cannot grant tenant access. This account is not the Super Admin. Four valid Auth sessions exist, but none is an available connected Chrome app session; no session tokens were read or reused. |
| Independent HR/Admin signed-in acceptance | **BLOCKED** | Production has only one active tenant membership, and it belongs to the Super Admin account. There is no separate active HR/Admin tenant member to exercise as a second identity. |
| Employee self-service positive acceptance | **BLOCKED** | Production has one employee-linked Auth account. Auth session inventory found 1 valid session for it, but no employee session was available in connected Chrome. The current Super Admin is not linked to an employee; no session token was read or reused. |
| Positive and rejected cross-tenant access in production | **BLOCKED** | Production has only one active tenant. A foreign-tenant request cannot prove isolation without a second real tenant and synthetic foreign rows. No production tenant or record was created. The separate disposable CI environment passes two-tenant checks; see the supporting isolated matrix below. |
| Signed-in production platform Super Admin RPC access | **BLOCKED — not called by deployed UI** | The account is confirmed as the sole active platform Super Admin, but the deployed UI does not mount the platform tenant-management page or call platform_hris_is_super_admin()/platform_hris_list_tenants(). Their SQL contracts and ACLs were rechecked separately; no direct signed-in RPC result is claimed. |
| Anonymous HTTP/PostgREST rejection | **BLOCKED — catalog check only** | Hosted function ACL checks show authenticated can execute the permission helpers and anon cannot. No anonymous HTTP request was captured, so runtime anonymous denial is not claimed. |
| Production behavior of the seven new candidate/interview RPCs | **FAIL for any release that enables the new component; currently gated** | All seven are absent from the production public schema. The current deployed main candidate component calls the existing admin_get_recruitment_data() after its permission check. The release branch switches to seven new hris_* RPCs; those calls are gated by permissions.recruitment and permissions.recruitmentManage. Production has no active membership with recruitment permission, so the signed-in production session did not call the new RPCs. Do not expose the release component to a recruiter until API parity is delivered and tested. |
| Disposable free two-tenant API environment | **PASS — CI stack created, exercised, and stopped** | The existing free GitHub Actions job initialized a fresh local-only Supabase project (`synesis-local-hris-test`) on loopback ports 55421/55422, started disposable Auth/Postgres/Storage, ran the isolated Auth/RLS and parity commands, and successfully stopped only that stack. No cloud Supabase project/branch was created and production was not contacted by this test. |
| Production remains unchanged | **PASS** | No migration, DDL, DML, auth-user change, or production setting change was made. |

## Supporting isolated two-tenant API/RLS acceptance

This is test-environment evidence, separate from the production matrix above. Workflow [39378140222 / job 118480812801](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140222/job/118480812801) ran on the frozen release source commit `686eec7016ec831e9b679500f28f553b8f93b14f`. It created a fresh local-only Supabase configuration named `synesis-local-hris-test`; the runner used loopback API/DB ports 55421/55422. The harness creates real synthetic GoTrue users/sessions and exercises PostgREST/RPC plus RLS using those session claims. The workflow logs show:

```sh
supabase init --workdir "$HRIS_SUPABASE_TEST_WORKDIR" --force
supabase start --workdir "$HRIS_SUPABASE_TEST_WORKDIR" --exclude studio,edge-runtime,logflare,vector,supavisor
node tests/sql/isolated-auth/run-local.mjs
node tests/sql/hosted-parity/run-local.mjs
# workflow teardown: Stop only the disposable Supabase project
```

The completed job reports 342/342 contract checks and **Local Auth/RLS acceptance: 375/375 passed; 0 failed**. The isolated stack was stopped at job completion. It is not a production request, a cloud Supabase branch, or proof of hosted API parity.

| Isolated test | Result | Evidence |
|---|---|---|
| Two-tenant signed-in fixtures | **PASS** | The harness signs in synthetic tenant A/B managers, tenant A/B employees, a platform Super Admin, recruiter-only, no-permission and global-only users. The tenant foundation check returns one tenant to each regular manager/employee and two tenants to the synthetic Super Admin. |
| Authorized tenant reads and employee self-access | **PASS** | Tenant-specific employee directory, employee learning/self-service, payslip and report checks return only authorized tenant/owner rows. |
| Denied roles, anonymous callers, and direct table access | **PASS** | The local Auth/RLS run rejects no-permission, recruiter-only where management is required, global-only, anonymous, inactive-membership, and direct-table access paths; representative authorization failures are SQLSTATE 42501. |
| Recruitment pipeline read | **PASS** | `hris_get_recruitment_pipeline` returns tenant A/B rows only to each matching manager; a tenant A caller asking for tenant B is rejected (42501). No-permission, global-only, anonymous, inactive-membership and direct-table reads are rejected. |
| Candidate stage change | **PASS** | `hris_update_candidate_application_stage` accepts an authorized valid tenant A transition and rejects no-permission, view-only, foreign application/tenant, invalid/regressive/closed transitions and direct writes. Cross-tenant cases return 42501 or P0002 per contract. |
| Interview schedule, response read, panel notes, completion | **PASS** | The isolated run exercises `hris_schedule_candidate_interview`, `hris_get_candidate_interview_responses`, `hris_save_candidate_interview_panel_notes`, and `hris_complete_candidate_interview`, with same-tenant owner/manager flows and cross-tenant, unprivileged, anonymous, privacy and invalid-state denials. |
| Candidate offer issuance | **BLOCKED — not exercised in this job** | The isolated acceptance script does not call `hris_issue_candidate_offer`; no positive/negative offer test is claimed. Add an isolated Auth/RLS test before enabling this action. |
| Hosted parity for candidate/interview APIs | **FAIL — seven signatures absent** | The CI exercises disposable source migrations only. Production catalog checks still return `present=false` for all seven functions, so the isolated passes do not authorize enabling the release component in production. |

## Reproducible signed-in API evidence

The browser session was verified against the sole active Super Admin record. Its session-specific Supabase edge-log query returned only request metadata; tokens, session IDs, request bodies, IP addresses, and returned record contents were not selected.

| Authenticated request | Observed result |
|---|---|
| POST /rest/v1/rpc/has_permission | 200; the app made permission checks under the authenticated role. |
| GET /rest/v1/tenants | 200; one active tenant is present in production. |
| GET /rest/v1/departments | 200; 2 rows visible to the signed-in membership. |
| GET /rest/v1/employees | 200; 0 rows visible to this account, while a separate SQL count is 5. |
| HEAD /rest/v1/jobs | 403; recruiter access is not granted to this membership. |
| POST /rest/v1/rpc/employee_get_* listed above | Each returned 403; this account has no linked employee. |

The 403s for the self-service RPCs are consistent with the SQL guard, not evidence of a tenant leak. The front end should distinguish a missing employee link/permission denial from a database outage. The empty employee-directory response is also a valid RLS-filtered response; the UI should say access is restricted when employees.view/employees.manage is false instead of presenting an empty directory as if the tenant had no employees.

## Independently rechecked production authorization contract

| SQL API | Contract |
|---|---|
| public.is_live_session() RETURNS boolean | Requires non-null auth.uid() and a matching, unexpired auth.sessions row for the JWT session_id. |
| public.has_permission(p_permission_id text) RETURNS boolean | SECURITY DEFINER; delegates to has_tenant_permission(public.synesis_tenant_id(), p_permission_id). authenticated EXECUTE is true; anon EXECUTE is false. |
| public.has_tenant_permission(p_tenant_id uuid, p_permission_id text) RETURNS boolean | Requires a live session, non-null tenant/permission, active tenant, an active tenant_memberships row for auth.uid(), an active tenant role, and the matching role_permissions.permission_id. It does not read user_roles. |
| public.hris_admin_can_read_tenant(p_tenant_id uuid, p_permission_id text) RETURNS boolean | Delegates to has_tenant_permission() and is used by tenant-scoped employee RLS. |
| public.platform_hris_is_super_admin() RETURNS boolean | Requires a live session and an admin_users row for auth.uid() with active=true, is_super_admin=true, confirmed Auth email, not deleted, and not currently banned. |
| public.platform_hris_list_tenants() RETURNS TABLE(id uuid, code text, slug text, name text, is_active boolean, timezone text, default_locale text, active_admin_count bigint) | Raises SQLSTATE 42501 (“Not authorized”) unless platform_hris_is_super_admin() is true. |

The current Super Admin session therefore has two independent identities: platform Super Admin status and an hr_admin tenant membership. The tenant membership itself carries only organization.manage; Super Admin status does not make has_permission('employees.view') or has_permission('recruitment.view') true. The separate System Administrator's 45 legacy user_roles permissions do not create tenant scope.

The employee policies allow self-read only through hris_own_employee_for_tenant(tenant_id), or tenant reads where has_tenant_permission(tenant_id, employees.view|employees.manage) is true. That matches the observed 200/zero-row directory result for the current account.

## Seven candidate/interview RPCs absent from hosted production

Signatures below are the development/release SQL declarations; catalog checks on production returned present=false for all seven. Call sites are in src/live/RecruitmentPipeline.tsx on the frozen release branch.

| RPC signature | Frontend call site and workflow | Release criticality |
|---|---|---|
| hris_get_recruitment_pipeline(p_tenant_id uuid, p_search text DEFAULT NULL, p_stage text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb | RecruitmentPipeline.tsx:528, page-load pipeline read. | Core parity before exposing Candidate pipeline when permissions.recruitment is true. Disposable two-tenant positive/negative read test PASS; production function absent. |
| hris_update_candidate_application_stage(p_tenant_id uuid, p_application_id uuid, p_stage text) RETURNS jsonb | RecruitmentPipeline.tsx:443, stage-change form save. | Core parity before promising stage changes when permissions.recruitmentManage is true. Disposable valid/denied/cross-tenant tests PASS; production function absent. |
| hris_issue_candidate_offer(p_tenant_id uuid, p_application_id uuid, p_salary_amount numeric, p_salary_currency text, p_pay_period text, p_proposed_joining_date date, p_response_deadline date, p_terms text) RETURNS jsonb | RecruitmentPipeline.tsx:60, offer form submit. | Later-gated by canManageOffers; production function absent. Disposable acceptance job did not exercise this call; add explicit positive, rejected-role and foreign-tenant tests before enabling. |
| hris_schedule_candidate_interview(p_tenant_id uuid, p_application_id uuid, p_round_name text, p_format text, p_scheduled_at timestamp without time zone, p_duration_minutes integer, p_location_or_link text DEFAULT NULL, p_panel_members text[] DEFAULT '{}', p_instructions text DEFAULT NULL) RETURNS jsonb | RecruitmentPipeline.tsx:159, interview invitation submit. | Later-gated by canManageOffers; disposable Auth/RLS test PASS; production function absent. |
| hris_get_candidate_interview_responses(p_tenant_id uuid) RETURNS jsonb | RecruitmentPipeline.tsx:333, response list load inside CandidateInterviewResponses. | Later-gated; the response component is mounted only with canManageOffers. Disposable Auth/RLS test PASS; production function absent. |
| hris_save_candidate_interview_panel_notes(p_tenant_id uuid, p_interview_id uuid, p_panel_notes text) RETURNS jsonb | RecruitmentPipeline.tsx:286, panel-note save. | Later-gated with interview response management. Disposable privacy/tenant test PASS; production function absent. |
| hris_complete_candidate_interview(p_tenant_id uuid, p_interview_id uuid) RETURNS jsonb | RecruitmentPipeline.tsx:310, completion action only for a scheduled interview with a confirmed candidate response. | Later-gated with interview response management. Disposable positive, idempotency, role and tenant-denial tests PASS; production function absent. |

The frozen release branch mounts RecruitmentPipeline only when permissions.recruitment is true; it passes canManageOffers and canManageApplicationStages from permissions.recruitmentManage. The existing tests/browser/recruitment-pipeline.spec.ts intercepts /auth/v1/** and /rest/v1/** and returns synthetic responses, so it verifies the UI contract but does not prove hosted functions exist. The isolated Auth/RLS run provides real local-database evidence for six of the seven new candidate/interview RPCs; it did not call hris_issue_candidate_offer and it does not establish production parity.

Do not replay the development migrations to close this gap. Workstation 1 should either keep this feature/action surface disabled until the normal reviewed API release establishes these exact contracts, or coordinate a separately reviewed schema release and run tenant/role tests before enabling it. The current main app's admin_get_recruitment_data() path is not the same contract as these seven new RPCs.

## Smallest safe remediation for Workstation 1

1. Keep has_permission() tenant-scoped. Do not add a fallback from user_roles and do not treat admin_users.active or Super Admin status as blanket tenant authorization.
2. If the separate System Administrator is meant to be a tenant HR/Admin, provide an explicit active membership for the approved tenant through the normal owner-controlled data/release process and use an approved least-privilege tenant role. The existing hr_admin role has only organization.manage; it does not grant employee or recruitment access. Do not assign the 45-permission legacy role as a shortcut.
3. Keep platform Super Admin operations on platform_hris_is_super_admin()/platform_hris_list_tenants(). The production tenant-management UI remains unavailable until the feature is intentionally mounted and acceptance-tested.
4. Gate employee-directory UI on employees.view/employees.manage; show an authorization message when those checks are false. In Employee View, detect absence of a linked employee and avoid presenting the expected self-service 42501 denials as “Database read failed.”
5. Keep the release Candidate pipeline hidden unless the exact hosted API contracts are present. hris_get_recruitment_pipeline and hris_update_candidate_application_stage are prerequisites for the page and stage workflow; the offer/interview controls are further gated by recruitment management. Before enabling offers, add a disposable test for hris_issue_candidate_offer covering authorized issuance, no-permission/view-only denial, and a foreign-tenant application.
6. Preserve every API-side tenant and role check even after the front end is gated. Client filtering is not a security boundary.

## Acceptance tests for Workstation 1

Run in an isolated two-tenant Supabase environment with synthetic users and rows; do not create those records in production.

1. **Super Admin positive / non-Super Admin negative:** signed-in sole SA calls platform_hris_is_super_admin() and receives true; platform_hris_list_tenants() returns the active tenant list. A non-SA authenticated account gets false from the helper and SQLSTATE 42501 from the list RPC. Anonymous EXECUTE remains denied.
2. **Tenant permission matrix:** HR/Admin with an approved membership gets true only for permission IDs granted to that role. A membership with organization.manage alone must get false for employees.view and recruitment.view; has_permission() must not consult user_roles.
3. **System Administrator without membership:** has_permission('employees.view') and has_permission('recruitment.view') are false; the account is not a platform Super Admin; tenant-scoped employee rows remain invisible.
4. **Employee self-access:** linked employee receives its own profile/self-service rows; a non-employee or another employee's id cannot read that profile. The existing employee_get_* functions should return 200 only for a live session with a linked employee and return the intended 42501/403 for an unlinked user.
5. **Two-tenant isolation:** tenant A users can read only tenant A rows and tenant B users only tenant B rows. For user A, has_tenant_permission(tenantB, permission) is false; query attempts for tenant B return no rows/403 according to the endpoint contract. Repeat the inverse direction.
6. **Candidate API:** the isolated run passes pipeline and stage tenant/role checks and passes interview schedule/response/panel-note/completion checks. Production still lacks all seven functions. The isolated offer issuance case remains uncovered; add it before the offer action can be accepted. Keep every production action gated until hosted parity is separately delivered and tested.
7. **Front-end denial states:** a 403 from employee self-service for an unlinked account renders “No linked employee profile” or an access message; it does not render a generic database-outage error. A successful RLS-filtered empty directory is clearly labeled as restricted when the caller lacks employees permissions.

## Source and evidence references

- [Production PR #39](https://github.com/shihab-tech04/HRIS-v2/pull/39)
- [Release controller PR #38](https://github.com/shihab-tech04/HRIS-v2/pull/38)
- [Current main candidate workflow](https://github.com/shihab-tech04/HRIS-v2/blob/main/src/live/RecruitmentPipeline.tsx#L179)
- [Release candidate/interview workflow](https://github.com/shihab-tech04/HRIS-v2/blob/release/hris-integrated-20261020/src/live/RecruitmentPipeline.tsx)
- [Release permission-gated mount](https://github.com/shihab-tech04/HRIS-v2/blob/release/hris-integrated-20261020/src/live/LiveHrisWorkspace.tsx#L3818)
- [Synthetic browser test with intercepted Supabase calls](https://github.com/shihab-tech04/HRIS-v2/blob/release/hris-integrated-20261020/tests/browser/recruitment-pipeline.spec.ts)
- [Stage-only platform tenant API](https://github.com/shihab-tech04/HRIS-v2/blob/main/src/live/platformTenantApi.ts)
- [Pages entry point](https://github.com/shihab-tech04/HRIS-v2/blob/main/index.html)

**Completion boundary:** one actual signed-in production Super Admin session and its API outcomes are evidenced. Two-tenant synthetic API/RLS acceptance is also evidenced by the free disposable CI job, but it is not a production cross-tenant test. Full production acceptance remains open until an approved independent HR/Admin session and the employee-linked account are interactively signed into connected Chrome; production cannot prove foreign-tenant behavior while it contains only one tenant. Valid Auth rows on the server are not treated as browser sessions, and no tokens were read or reused.