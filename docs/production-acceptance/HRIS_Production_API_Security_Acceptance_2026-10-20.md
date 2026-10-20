# HRIS Production API and Security Acceptance — 2026-10-20

**Result: PARTIAL / NOT ACCEPTED as a full production release gate.** I verified the hosted application with the existing signed-in Super Admin session and captured authenticated PostgREST outcomes. The current production tenant role still does not grant the separate System Administrator tenant access or employee/recruitment permissions. Cross-tenant and separate HR/Admin/employee acceptance remain blocked, and the free two-tenant test environment could not be provisioned within the organization quota.

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
| Production platform Super Admin tenant-management UI | **FAIL** | The production workspace labels Tenant configuration as “Workflow pending.” platformTenantApi.ts is stage-only and the production UI does not mount platform_hris_list_tenants(). A direct session call to this RPC was therefore not observed. |
| Current hr_admin permissions | **FAIL — role does not cover HR directory/recruiting** | The only active tenant membership belongs to the Super Admin and role hr_admin has only organization.manage. The signed-in account could read departments, but the employee directory returned no visible rows and Candidate pipeline displayed “Recruitment view permission is required.” |
| Employee directory RLS denial | **PASS — expected deny for this account** | Authenticated GET /rest/v1/employees returned 200 with no visible rows. A separate read-only SQL aggregate counted 5 employee rows in production; this account has no linked employee record and lacks employees.view/employees.manage. Production employee RLS policies require a linked employee row or a tenant-scoped view/manage permission. |
| Candidate pipeline role restriction | **PASS — expected deny for this account** | Signed-in UI displayed “Access restricted”; authenticated HEAD /rest/v1/jobs returned 403. Permission RPC requests returned 200; no recruiter data or candidate records were exposed. No candidate RPC mutation was attempted. |
| Employee View for the Super Admin account | **FAIL — denial is rendered as a database error** | The account is not an employee. Its Employee View requests to employee_get_leave_context, employee_get_expense_context, employee_get_notice_context, employee_get_my_performance_context, employee_get_travel_context, employee_get_dashboard_schedule, employee_get_my_payslips, and employee_get_self_service_context returned authenticated 403s. SQL confirms these RPCs require a live employee session and a linked employee. The UI showed a generic “Database read failed” alongside “No linked employee profile is available.” No personal data was returned. |
| Separate System Administrator tenant access | **FAIL — legacy permissions do not grant tenant membership** | The separate active System Administrator has user_roles.role_id = hris_system_admin, an active role with 45 legacy permission rows, and no active tenant membership. Hosted has_permission() delegates to has_tenant_permission() and does not consult user_roles; without membership the legacy permissions cannot satisfy tenant-scoped checks. This account is not the Super Admin. The read-only Auth session inventory found 4 valid sessions for this account, but none was an available connected Chrome tab; no session tokens were read or reused. |
| Independent HR/Admin signed-in acceptance | **BLOCKED** | Production has only one active tenant membership, and it belongs to the Super Admin account. There is no separate active HR/Admin tenant member to exercise as a second identity. |
| Employee self-service positive acceptance | **BLOCKED** | Production has one employee-linked Auth account. Auth session inventory found 1 valid session for it, but no employee session was available in connected Chrome. The current Super Admin is not linked to an employee; no session token was read or reused. |
| Positive and rejected cross-tenant access | **BLOCKED** | Production has only one active tenant. A foreign-tenant request cannot prove isolation without a second real tenant and synthetic foreign rows. No production tenant or record was created. |
| Anonymous HTTP/PostgREST rejection | **BLOCKED — catalog check only** | Hosted function ACL checks show authenticated can execute the permission helpers and anon cannot. No anonymous HTTP request was captured, so runtime anonymous denial is not claimed. |
| Production behavior of the seven new candidate/interview RPCs | **FAIL for any release that enables the new component; currently gated** | All seven are absent from the production public schema. The current deployed main candidate component calls the existing admin_get_recruitment_data() after its permission check. The release branch switches to seven new hris_* RPCs; those calls are gated by permissions.recruitment and permissions.recruitmentManage. Production has no active membership with recruitment permission, so the signed-in production session did not call the new RPCs. Do not expose the release component to a recruiter until API parity is delivered and tested. |
| Disposable free two-tenant API environment | **BLOCKED** | A new free project was quoted at $0 but creation was rejected because the organization is at its 2-project free limit. The only other free project is unrelated and was not reused. A Supabase branch costs $0.01344/hour; local Docker, Supabase CLI, PostgreSQL, PGlite, and pg-mem are unavailable. No test project was created. |
| Production remains unchanged | **PASS** | No migration, DDL, DML, auth-user change, or production setting change was made. |

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
| hris_get_recruitment_pipeline(p_tenant_id uuid, p_search text DEFAULT NULL, p_stage text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb | RecruitmentPipeline.tsx:528, page-load pipeline read. | Core parity before exposing Candidate pipeline when permissions.recruitment is true. |
| hris_update_candidate_application_stage(p_tenant_id uuid, p_application_id uuid, p_stage text) RETURNS jsonb | RecruitmentPipeline.tsx:443, stage-change form save. | Core parity before promising stage changes when permissions.recruitmentManage is true. |
| hris_issue_candidate_offer(p_tenant_id uuid, p_application_id uuid, p_salary_amount numeric, p_salary_currency text, p_pay_period text, p_proposed_joining_date date, p_response_deadline date, p_terms text) RETURNS jsonb | RecruitmentPipeline.tsx:60, offer form submit. | Later-gated by canManageOffers; keep the offer action hidden until parity exists. |
| hris_schedule_candidate_interview(p_tenant_id uuid, p_application_id uuid, p_round_name text, p_format text, p_scheduled_at timestamp without time zone, p_duration_minutes integer, p_location_or_link text DEFAULT NULL, p_panel_members text[] DEFAULT '{}', p_instructions text DEFAULT NULL) RETURNS jsonb | RecruitmentPipeline.tsx:159, interview invitation submit. | Later-gated by canManageOffers; keep schedule actions hidden until parity exists. |
| hris_get_candidate_interview_responses(p_tenant_id uuid) RETURNS jsonb | RecruitmentPipeline.tsx:333, response list load inside CandidateInterviewResponses. | Later-gated; the response component is mounted only with canManageOffers. |
| hris_save_candidate_interview_panel_notes(p_tenant_id uuid, p_interview_id uuid, p_panel_notes text) RETURNS jsonb | RecruitmentPipeline.tsx:286, panel-note save. | Later-gated with interview response management. |
| hris_complete_candidate_interview(p_tenant_id uuid, p_interview_id uuid) RETURNS jsonb | RecruitmentPipeline.tsx:310, completion action only for a scheduled interview with a confirmed candidate response. | Later-gated with interview response management. |

The frozen release branch mounts RecruitmentPipeline only when permissions.recruitment is true; it passes canManageOffers and canManageApplicationStages from permissions.recruitmentManage. The existing tests/browser/recruitment-pipeline.spec.ts intercepts /auth/v1/** and /rest/v1/** and returns synthetic responses, so it verifies the UI contract but does not prove these functions exist or authorize production users.

Do not replay the development migrations to close this gap. Workstation 1 should either keep this feature/action surface disabled until the normal reviewed API release establishes these exact contracts, or coordinate a separately reviewed schema release and run tenant/role tests before enabling it. The current main app's admin_get_recruitment_data() path is not the same contract as these seven new RPCs.

## Smallest safe remediation for Workstation 1

1. Keep has_permission() tenant-scoped. Do not add a fallback from user_roles and do not treat admin_users.active or Super Admin status as blanket tenant authorization.
2. If the separate System Administrator is meant to be a tenant HR/Admin, provide an explicit active membership for the approved tenant through the normal owner-controlled data/release process and use an approved least-privilege tenant role. The existing hr_admin role has only organization.manage; it does not grant employee or recruitment access. Do not assign the 45-permission legacy role as a shortcut.
3. Keep platform Super Admin operations on platform_hris_is_super_admin()/platform_hris_list_tenants(). The production tenant-management UI remains unavailable until the feature is intentionally mounted and acceptance-tested.
4. Gate employee-directory UI on employees.view/employees.manage; show an authorization message when those checks are false. In Employee View, detect absence of a linked employee and avoid presenting the expected self-service 42501 denials as “Database read failed.”
5. Keep the release Candidate pipeline hidden unless the exact hosted API contracts are present. hris_get_recruitment_pipeline and hris_update_candidate_application_stage are prerequisites for the page and stage workflow; the offer/interview controls are further gated by recruitment management.
6. Preserve every API-side tenant and role check even after the front end is gated. Client filtering is not a security boundary.

## Acceptance tests for Workstation 1

Run in an isolated two-tenant Supabase environment with synthetic users and rows; do not create those records in production.

1. **Super Admin positive / non-Super Admin negative:** signed-in sole SA calls platform_hris_is_super_admin() and receives true; platform_hris_list_tenants() returns the active tenant list. A non-SA authenticated account gets false from the helper and SQLSTATE 42501 from the list RPC. Anonymous EXECUTE remains denied.
2. **Tenant permission matrix:** HR/Admin with an approved membership gets true only for permission IDs granted to that role. A membership with organization.manage alone must get false for employees.view and recruitment.view; has_permission() must not consult user_roles.
3. **System Administrator without membership:** has_permission('employees.view') and has_permission('recruitment.view') are false; the account is not a platform Super Admin; tenant-scoped employee rows remain invisible.
4. **Employee self-access:** linked employee receives its own profile/self-service rows; a non-employee or another employee's id cannot read that profile. The existing employee_get_* functions should return 200 only for a live session with a linked employee and return the intended 42501/403 for an unlinked user.
5. **Two-tenant isolation:** tenant A users can read only tenant A rows and tenant B users only tenant B rows. For user A, has_tenant_permission(tenantB, permission) is false; query attempts for tenant B return no rows/403 according to the endpoint contract. Repeat the inverse direction.
6. **Candidate API:** with recruitment view, pipeline read succeeds only for the user's tenant; with recruitment manage, stage update succeeds for an owned application and a foreign-tenant application is rejected. Offer/interview RPCs remain unavailable until their action gates and the same tenant/role rejection tests pass.
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

**Completion boundary:** one actual signed-in Super Admin session and its production API outcomes are now evidenced. Full acceptance remains open until an approved independent HR/Admin identity, the employee-linked account is interactively signed into connected Chrome, and a real two-tenant isolated environment is available. Valid Auth rows on the server are not treated as browser sessions, and no tokens were read or reused.