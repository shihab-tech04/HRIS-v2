# WS02 hosted and source security evidence — 2026-10-21

## Release gate

**BLOCKED for a production view release.** The connected hosted catalog still has cross-tenant address/family read policies, broad client ACLs including TRUNCATE, and a disabled leaked-password protection setting. Hosted mutation RPCs do not match several checked-in API contracts. No real two-tenant Auth-session acceptance is possible in the current unpopulated ephemeral branch.

PR #50 remains an open draft. Its source fix and disposable acceptance run at code commit b55ca3dd12a90557159f9eccc6b53310a4c6e94e; this report update is documentation only. Nothing in PR #50 has been applied to hosted main. No hosted schema, Auth, user, tenant, membership, role, or data writes were made. No employee or Candidate rows were read. No merge or deployment was made.

## Hosted versus source matrix

Read-only hosted refresh completed on 2026-10-21 through the existing Supabase connection. Project: hrmis-saas, ref oslgwxaqfbteqtwqvdzs.

| Control | Hosted evidence | Source and isolated evidence | Status |
|---|---|---|---|
| Project and migration head | Project ACTIVE_HEALTHY, PostgreSQL 17.11.0.002. Migration inventory ends at 20261020044145 phase03_learning_context_authenticated_acl_20261020. | PR #50 adds address ACL and tenant guards, and leave_types ACL protection. Source family tenant migration 20261016171104 exists in development but is absent from the hosted ledger. None of these PR #50 changes is hosted. | PASS for observation; FAIL for migration parity |
| Hosted test environment | Only default main exists (branch c2ab5042-2a39-412c-ba6d-23b9a78209b2), persistent=false, with_data=false; preview status ACTIVE_HEALTHY. No test tenants or test Auth users were created. | PG17 disposable fixtures use synthetic tenants and identities only. | BLOCKED for hosted two-tenant acceptance |
| Auth and session configuration | Project connection does not expose the full Auth configuration through the read-only APIs used. Advisor reports leaked-password protection disabled. Hosted Auth/session behavior was not exercised. | Existing source checks and disposable Auth tests do not substitute for real hosted Auth sessions. | FAIL for leaked-password setting; BLOCKED for full Auth and hosted session verification |
| Address and family row policies | employee_addresses_admin_read and employee_family_admin_read are SELECT policies using only has_permission(employees.view/manage); neither checks the parent employee tenant. Self-read policies use is_live_session() and employee_for_auth_user(). | Address migration 20261021060748 replaces the global read with parent-employee tenant authorization and a restrictive read guard. Existing family migration 20261016171104 uses parent employee tenant membership, active role and permission checks. No duplicate family migration was added. | FAIL hosted; PASS in disposable PG17 |
| Address and family table ACLs | anon has no table privileges. authenticated has SELECT, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on each table; it lacks INSERT/UPDATE/DELETE. service_role retains full table privileges. | Address migration 20261021060748 now revokes all privileges from PUBLIC, anon and authenticated, then restores authenticated SELECT only. Existing family migration 20261016171104 already does the same. New PG17 fixtures recreate broad ACLs and verify client privileges are removed while service_role privileges remain. | FAIL hosted; PASS in disposable PG17 |
| leave_types ACL | anon and authenticated each have SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. Catalog policies are SELECT-only; RLS does not constrain TRUNCATE. service_role retains full privileges. | Migration 20261021084635 revokes PUBLIC/anon/authenticated privileges and grants authenticated SELECT only. Existing PG17 assertions reproduce the broad grants and confirm the read-only result. | FAIL hosted; PASS in exact-head PG17 |
| Candidate private-table ACLs | The 2026-10-21 12:26Z read-only inventory found broad anon and authenticated ACLs on private Candidate tables, including authenticated TRUNCATE, while RLS policies were SELECT-only. No data or mutation probe was run. | Source migration 20261013052128_hris_candidate_c1_revoke_direct_table_access.sql revokes all client/PUBLIC table privileges. It is absent from hosted migration history. | FAIL for hosted/source parity; runtime exposure NOT TESTED |
| Dashboard and Employee Profile | hris_get_my_dashboard_data(uuid) is SECURITY DEFINER with authenticated/service_role EXECUTE, anon denied, and the hosted definition checks a live session and requested tenant. Hosted Auth-session behavior is untested. | PR #52 uses this read RPC, Employee-only routing, tenant-keyed clearing and stale-response guards; edits and unverified private tabs stay unavailable. The UI workflow did not exercise browser races. | PASS for reviewed read-only source path; hosted runtime BLOCKED; browser stale-response test NOT TESTED |
| RPC authorization and contract parity | Hosted exact names include admin_save_leave_type(p_id uuid,p_payload jsonb), admin_schedule_interview(p_application_id uuid,p_payload jsonb), admin_update_interview(p_interview_id uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb), employee_save_my_addresses_v2(p_rows jsonb), employee_save_my_family_members_v2(p_rows jsonb), and employee_update_my_profile(p_payload jsonb). They are SECURITY DEFINER; authenticated/service_role EXECUTE is granted and anon EXECUTE denied, except the intentionally public Candidate function below. The admin_* bodies use has_permission in the fixed synesis-it tenant context and do not check is_live_session(). The three employee self-writers check is_live_session() and bind to employee_for_auth_user(). | Similar purpose is not parity. The source leave contract is hris_save_leave_type(p_tenant_id uuid,p_leave_type_id uuid,p_payload jsonb,p_expected jsonb DEFAULT NULL), with live-session and tenant-permission checks. No source UI/API contract was verified for the host-only employee self-writers. | BLOCKED; keep these mutations unavailable |
| HR01 contact RPCs | hris_get_tenant_employee_contact_details(uuid,uuid) and hris_update_tenant_employee_contact_details(uuid,uuid,jsonb) are absent from the hosted function inventory. | Source migration 20261014171952_employee_contact_details_editing.sql defines those exact tenant-scoped contracts. | BLOCKED; keep contact editing unavailable |
| Candidate recruitment/interview RPCs | Host admin_schedule_interview/admin_update_interview signatures differ from the source hris_* recruitment/interview contracts, including hris_schedule_candidate_interview. | Candidate PR #8 keeps Apply/Save and private recruiter/interview actions disabled. | BLOCKED; keep private Candidate views and mutations unavailable |
| Public Candidate vacancy source | candidate_public_jobs_source() is SECURITY DEFINER and callable by anon/authenticated/service_role. Its reviewed source body is intended for public published-vacancy browsing, filters to published/active/non-expired synesis-it jobs and masks salary unless published. Its output schema also contains tenant_id, required_documents, screening_questions and instructions; no anonymous row/HTTP response was inspected. | Candidate PR #8 disables Apply and Save and uses the public vacancy view. Only an approved public-field projection may be displayed; no private applicant data is authorized by this review. | PASS for source-intended public endpoint; payload allowlist and response scope NOT TESTED |
| Role, tenant-switch and unauthorized-operation acceptance | No authorized hosted Auth identities or populated second tenant exist in the available branch. | Address/family/leave PG17 checks exercise synthetic role membership, tenant isolation, stale/inactive session denial and direct ACL denial. They are disposable database acceptance, not real Supabase Auth acceptance. | PASS for listed disposable tests; BLOCKED for hosted acceptance |

## Exact-head PG17 ACL verification

Three PostgreSQL 17 ACL workflows triggered on report-only commit 39e217a68f064a8a5acfa4df7b0f3f6e4b266135 all completed **success**:

- Existing family migration tenant/ACL checks: [run 39635069404](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39635069404) — passed.
- Address tenant isolation and ACL checks: [run 39635069405](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39635069405) — passed.
- leave_types broad-ACL revocation and read-only checks: [run 39635069453](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39635069453) — passed.

Commit 39e217a is report-only after source fix b55ca3dd12a90557159f9eccc6b53310a4c6e94e; the tested SQL and fixtures are unchanged. The source code under test remains at b55ca3dd. These three ACL checks are separate from the disposable Auth/Postgres/browser workflow recorded below.

The earlier PG17 workflows on source code commit b55ca3dd also passed:

- Address tenant isolation and client ACL checks: [run 39634701893](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634701893).
- Family tenant isolation and broad-ACL revocation using the existing family migration: [run 39634701839](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634701839).
- leave_types broad-ACL revocation and tenant read checks: [run 39634701890](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634701890).

The address assertions deny anon/authenticated INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER; authenticated SELECT remains allowed. Service_role privileges are explicitly retained. The family fixture begins with broad PUBLIC/anon/authenticated privileges and verifies that the existing migration removes them while preserving service_role privileges. Tests contain synthetic records only.

## Separate disposable Auth/Postgres/browser run

The separate CI run [39634694092](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634694092) completed **success** on source code commit b55ca3dd12a90557159f9eccc6b53310a4c6e94e. The isolated-hris job completed successfully. Its TypeScript/contracts/build checks, standalone browser regressions with synthetic sessions, local Auth/RLS workflow acceptance, Phase 04 parity checks and disposable-database Advisor inspection all passed. The workflow started and stopped a fresh local-only Supabase environment.

This run is distinct from the three PG17 ACL checks above. It is source/disposable-environment evidence only; it does not exercise hosted Auth sessions or certify hosted two-tenant isolation. Hosted acceptance remains **BLOCKED** until the environment owner provides a persistent populated isolated setup and approved real Auth identities.

## Security Advisor classification

Read-only Advisor refresh at 2026-10-21 16:26Z reported:

| Finding | Assessment | Status |
|---|---|---|
| anon_security_definer_function_executable — 1: candidate_public_jobs_source() | Public vacancy browsing is documented source intent and the body has publication filters and salary masking. This is an intentional public endpoint, not a blanket suppression. Its output includes fields whose public approval has not been independently confirmed; inspect only a synthetic response and approve an explicit public field allowlist before release. | NOT TESTED for response scope |
| authenticated_security_definer_function_executable — 246 | Callable-function inventory, not proof that every function is vulnerable. Only the relevant dashboard/admin/self-write/public Candidate subset was reviewed. The rest need individual session, tenant, role, argument and output review. | BLOCKED for complete audit |
| rls_enabled_no_policy — 27 INFO | Direct client reads/writes fail closed on these RLS-enabled tables absent another access path. This finding does not evaluate SECURITY DEFINER functions or views. | PASS for direct table path; indirect API paths NOT TESTED |
| auth_leaked_password_protection — 1 WARN | Auth hardening setting is reported disabled. No Auth settings were changed. | FAIL until the authorized Auth owner resolves it |

## Migration and rollback instructions

Do not apply any migration to hosted main from this draft. For authorized testing, replay the checked-in source chain in a dedicated isolated project/branch using synthetic data. The family migration has an older source timestamp and is missing from hosted history; do not apply it out of order on main or create a duplicate. The environment/release owner must determine a reviewed forward-only reconciliation plan for hosted history before deployment.

These are forward security repairs. A rollback must not restore broad client DML or the global address/family policies. If a read path breaks in an isolated test, disable that view and revise the forward migration. Any compensating migration must retain tenant-scoped reads, authenticated SELECT only where required, and service_role access. Disposable CI databases are dropped after the run.

## One-time setup required for independent hosted acceptance

The environment owner must provide and approve a dedicated, persistent, isolated, populated test project or branch with two synthetic tenants and real Auth sessions before WS05 can clear the gate. The current ephemeral main is not suitable. Required pseudonymous test roles/accounts:

- Tenant A and Tenant B Employee accounts, each linked to a distinct synthetic employee.
- Tenant A HR-view and HR-manage accounts, plus a Tenant A Manager.
- Tenant B HR/Manager account to prove cross-tenant denial.
- A Super Admin account under the exact source-defined Super Admin semantics.
- A no-membership account and an inactive-membership account.
- An expired/revoked-session case and anonymous unauthenticated requests.

Owner setup should include only synthetic employee, address, family, leave-type and published-job rows; no production copies. WS05 must run authenticated allow/deny reads, cross-tenant direct reads, tenant switch with stale-response rejection, inactive/expired/anonymous denial, role tampering, direct mutation denial and exact approved-RPC name/signature/argument tests through real hosted Auth sessions. Record project ref, migration head, pseudonymous role mapping, request IDs and pass/fail output. Disposable PG17 results do not clear this requirement.

## PR reconciliation and workstation handoff

- **PR #39:** retained as historical hosted API/security evidence at migration head 20261020044145; it does not cover the current hosted ACL or address/family findings.
- **PRs #47/#48:** the proposed 20261020132112_revoke_client_administrative_table_privileges.sql removes maintenance-class privileges but leaves CRUD grants; its assertion preserves CRUD grants on tables including leave_types. PR #50 adds the later leave_types read-only ACL correction. #48 does not itself grant DML; hosted residual grants remain independently observed.
- **Main PRs #49/#43/#44:** keep views tenant-scoped and role-gated. Unverified leave-history, attendance mutation and HR01 contact actions remain unavailable. Do not use UI role state as authorization.
- **Employee PR #52:** keep the curated hris_get_my_dashboard_data read path. Education, experience, training, bank, family and all edits remain unavailable without exact reviewed contracts and hosted acceptance.
- **Candidate PR #8:** public vacancy browsing may expose only approved public fields. Keep Apply, Save, private candidate profiles, recruiter pipeline, interviews, panel notes and offers unavailable.
- **WS05 gate:** **BLOCKED** until the owner supplies the isolated populated hosted setup and approved real Auth accounts; the source/host ACL and policy migrations are separately reviewed and deployed under protected release authorization, Auth hardening is resolved, and hosted acceptance passes.

No private employee or Candidate data was used to complete a view.