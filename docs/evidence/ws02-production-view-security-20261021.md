# WS02 production-view security handoff — 2026-10-21

## Release decision

**BLOCKED for production view release.** Hosted authentication and catalog reads confirm several safe server-side controls, but hosted two-tenant and role acceptance was not possible. The deployed address/family read policies are not tenant-scoped, `leave_types` has excessive direct ACL grants, and Auth leaked-password protection is disabled. PR #50 contains source-backed forward migrations and disposable acceptance coverage; none of those changes has been applied to production.

No employee or Candidate rows were read for this review. No production schema, data, Auth, membership, role, or tenant writes were made. No merge or deployment was made.

Source base: `development/hris-checkpoints` at `2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc`. PR #50 was rechecked at `89dccad45c35eaee1f9a84f40ce3ec4acc124e80` before this update.

## Hosted versus source matrix

Hosted evidence was rechecked read-only on 2026-10-21 through the existing Supabase connection for project `hrmis-saas` (`oslgwxaqfbteqtwqvdzs`).

| Control | Hosted evidence | Source / isolated evidence | Status |
|---|---|---|---|
| Project and migration head | Project healthy, Postgres `17.11.0.002`; latest of 116 hosted migrations is `20261020044145 phase03_learning_context_authenticated_acl_20261020`. | Development base is later than hosted and includes family policy migration `20261016171104`; PR #50 adds address and `leave_types` migrations. | **PASS** for observation; **FAIL** for hosted/source parity |
| Auth configuration | Existing connection exposes no Auth provider configuration read API. Supabase Security Advisor reports leaked-password protection disabled. | No Auth configuration change proposed. | **BLOCKED** for full config verification; **FAIL** for the disabled protection finding |
| Live-session guard | Hosted `is_live_session()` requires `auth.uid()`, a matching `auth.sessions` row, and `not_after IS NULL OR > now()`. `hris_get_my_dashboard_data(uuid)` is executable by authenticated/service-role and denied to anon. | PR #50 adds disposable real-Auth expiry denial through the employee dashboard RPC. | **PASS** for catalog definition and grants; hosted runtime **NOT TESTED** |
| RLS baseline | All 96/96 public base tables have RLS enabled. No anon/public DML policy exists in `pg_policies`. Advisor reports 27 RLS-enabled/no-policy tables, which fail closed absent another access path. | Disposable workflows verify the scoped tables and APIs. | **PASS** for RLS enabled; whole-surface runtime **NOT TESTED** |
| Broad client table ACLs | `anon` has DML ACLs on 29 public tables; `authenticated` on 35. Those grants alone do not establish data access because RLS still applies. `leave_types` explicitly has anon/auth SELECT, DML, and MAINTAIN grants. | New `20261021084635_leave_types_authenticated_read_only_acl.sql` revokes client/PUBLIC grants, preserves authenticated SELECT, and leaves explicit service-role grants unchanged. Disposable tests exercise tenant SELECT and direct anon/auth mutation denial. | **FAIL** hosted least privilege; source fix awaits exact-head CI and controlled release |
| Employee address reads | RLS enabled and no client DML. Hosted `employee_addresses_admin_read` calls global `has_permission('employees.view' OR 'employees.manage')` with no parent employee tenant predicate; self read is live-session/identity bound. | PR #50 adds tenant membership/permission scoped administrator policy plus a restrictive parent-tenant guard; self read remains. Two-tenant fixture covers employee, HR manage, view-only, inactive membership/session, global-only permission, anon, and direct-write denial. | **FAIL** hosted; source fix awaits exact-head CI and controlled release |
| Employee family reads | RLS enabled and no client DML. Hosted admin policy has the same global permission check without the parent employee tenant predicate. | Development source migration `20261016171104_employee_family_tenant_scoped_read.sql` uses a parent employee lookup, active tenant, active membership/role, exact role permission, live session, and restrictive guard. | **FAIL** hosted; source migration exists; exact WS02 workflow pending |
| Attendance and leave readers | Hosted restrictive tenant-membership guards are present on attendance records/corrections and employee leave balances. | Main PR #49 and Manager PR #44 keep tenant-scoped reader paths and role-gated views. Disposable Auth acceptance is required to test cross-tenant and role behavior. | **PASS** for static guard presence; runtime **NOT TESTED** |
| Employee Profile, PR #52 | Hosted `hris_get_my_dashboard_data(uuid)` checks live session, active tenant, linked employee identity and requested tenant; anon EXECUTE is false. It projects profile fields plus the employee's own dashboard data. The helper does not explicitly check a tenant-membership row for the employee. | PR #52 calls this existing RPC, renders only curated own profile fields, exposes navigation only for Employee, has tenant-keyed state clearing and a stale-response cleanup guard, and keeps edit/private-data tabs unavailable. Its exact-head TypeScript/contracts/build workflow [passed](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39559940722); that workflow did not exercise browser stale responses. Role visibility is not an authorization boundary. | **PASS** for scoped read-only UI/source path; membership semantics and hosted runtime acceptance **BLOCKED**; browser stale-response behavior **NOT TESTED** |
| HR01 contact | Hosted `hris_get_tenant_employee_contact_details(uuid,uuid)` and `hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)` are absent. | Source migration exists; no replacement contract proposed. | **BLOCKED**; keep contact editing unavailable |
| Candidate recruiter/interview | Seven exact recruiter/interview RPCs are absent. Direct authenticated SELECT on key private recruiter tables such as applications/interviews is denied; some candidate-self tables remain owner-scoped. | Candidate PR #8 is limited to public published vacancies, with Apply/Save disabled. No candidate self-service or recruiter/interview contract is inferred. | **BLOCKED** for private Candidate views/actions; public vacancy source is statically bounded to published, active, in-deadline jobs |
| Employee self-write | Hosted-only `employee_update_my_profile(jsonb)`, `employee_save_my_addresses_v2(jsonb)`, and `employee_save_my_family_members_v2(jsonb)` exist with authenticated/service-role EXECUTE and anon denied; no checked-in source migration or call sites were found. | No use or speculative request fields/semantics added. | **BLOCKED**; keep employee mutation actions disabled |
| Leave type management | Hosted `hris_save_leave_type(uuid,uuid,jsonb,jsonb)` is absent. Direct DML is not an approved view contract. | Source contract is RPC-only; the isolated runner tests the approved RPC's active same-tenant permission, stale optimistic version, duplicate code, cross-tenant denial, and denied direct updates. | **BLOCKED** for hosted mutation; keep mutation disabled |
| Public Candidate vacancy endpoint | Advisor reports one anon-callable SECURITY DEFINER function, `candidate_public_jobs_source()`. Definition uses a fixed published-jobs source, active/published status and application-deadline checks; salary fields are nulled unless publication is enabled. `public` schema CREATE is false for anon/authenticated; published vacancy view uses `security_invoker=true`. | Candidate PR #8 consumes the public vacancy-only path and disables private apply/save actions. | **PASS** for the reviewed published-only source definition; anonymous HTTP behavior **NOT TESTED** |
| SECURITY DEFINER review | Advisor reports 246 authenticated-callable SECURITY DEFINER functions; only the release-relevant subset above was inspected. The single anon function is the public vacancy source. | Existing exact-contract and disposable auth workflows cover selected exposed readers/writers, not all 246 functions. | **BLOCKED** for a whole-project definer-function audit |
| Tenant and role acceptance | Hosted has one active tenant and no independent employee/HR test identities or second tenant available to WS02. No hosted runtime login, tenant switch, session-expiry, or role matrix was executed. | PR #50 adds two-tenant synthetic PG17 policy tests; the full local Auth/Postgres runner exercises synthetic employee, HR, Manager, administrator, inactive membership and RPC cases. | **BLOCKED** for required hosted acceptance; disposable checks are not production certification |

## Employee Profile PR #52 review

PR #52 head `62afa0edf224a7cb0b0e54a11fe408b71afb8322` uses the existing `hris_get_my_dashboard_data(p_tenant_id)` RPC. Its route is gated to Employee in the UI, its request uses the selected tenant, response parsing rejects malformed/mismatched profiles, tenant changes clear prior data, and effect cleanup ignores stale responses. The UI displays a constrained own-profile projection and leaves edit actions and unsupported tabs unavailable. Changing client role state cannot replace the server RPC checks.

The hosted RPC binds to the authenticated employee row and requested active tenant, but the source does not establish whether an active employee with an inactive or missing tenant-membership row should retain own-profile access. No contract was invented. WS05 must decide that source-level rule and add exact real-Auth denial/allowance coverage before calling the membership requirement complete. PR #52's browser stale-response behavior and hosted employee acceptance remain untested here.

## PR reconciliation and UI capability handoff

- **PR #39:** remains useful production API/security evidence for hosted head `20261020044145`; it predates this recheck and does not clear new ACL/address/family/Auth findings.
- **PR #48 / #47:** migration `20261020132112_revoke_client_administrative_table_privileges.sql` removes maintenance-class privileges but leaves CRUD grants untouched. Its PostgreSQL assertion requires CRUD grants on all five tables, which conflicts with source migration `20261016142000_hris_leave_type_policy_management.sql` for `leave_types`. PR #50 adds the later `20261021084635` forward migration to enforce authenticated SELECT-only and anon-denied access. The #48 migration does not itself grant DML; the broad grants are residual hosted ACLs that its assertion would preserve.
- **PR #49 (Main) and #43 (HR Operations):** keep role-gated, tenant-scoped views. Personal leave history and attendance requests without a verified hosted API remain unavailable. HR01 contact editing remains unavailable because its exact hosted RPCs are absent.
- **PR #44 (Management):** retain the existing tenant-scoped readers; do not infer manager permissions from client role state. Hosted role/cross-tenant runtime acceptance remains open.
- **PR #52 (Employee Profile):** keep read-only profile display on `hris_get_my_dashboard_data`; education, experience, training, bank, family and all edit/write capabilities remain unavailable where no reviewed read/write contract exists. Do not wire the hosted-only self-write RPCs.
- **Candidate PR #8** (head `7740b68824cf3ff5d2bd5d7ac19c1756826d0de1`): public published vacancies may remain viewable. Keep Apply, Save, private candidate profiles, recruiter pipeline, interviews, panel notes and offers unavailable until exact source-backed APIs and server authorization are verified.

## Source changes and verification

PR #50 proposes two forward migrations:

1. `20261021060748_employee_addresses_tenant_read_guard.sql` removes the broad address admin policy, adds a tenant-scoped read policy and restrictive parent-employee guard, and preserves self-read. It fails closed if the existing tenant helpers are missing.
2. `20261021084635_leave_types_authenticated_read_only_acl.sql` removes PUBLIC/anon/authenticated table grants and restores authenticated SELECT only. Explicit service-role grants are not revoked.

Tests added/updated include exact policy/ACL contract tests, two-tenant address and leave ACL PostgreSQL 17 fixtures, hosted-grant parity setup in the disposable Auth runner, anon/auth direct mutation denial, approved RPC authorization and argument/state checks, and expired-session RPC denial.

- Current security-source commit: `526cf8d55d74e1a86abdc9b3022f6c4efb9586cd`.
- Local `npm run test:contracts`: **358/358 passed**; `git diff --check`: **PASS**.
- Employee address PostgreSQL 17: **PASS** on current source commit, [run](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39574161662).
- `leave_types` ACL PostgreSQL 17: **PASS** on current source commit, [run](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39574161673).
- Employee family PostgreSQL 17: **PASS** on `b2e220d2397cad1cba9cb4678d40b85f1b37cd56`, [run](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39573664931); the migration and fixture/verify SQL were unchanged at current security-source commit `526cf8d`.
- Full disposable Auth/Postgres/browser acceptance: **IN PROGRESS** on current security-source commit, [run](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39574156134). It includes real synthetic Auth sessions and tenant/RPC acceptance, not hosted acceptance.
- Docker is unavailable in this work environment, so the local Auth/Postgres runner and PG17 disposable services were not run here. GitHub Actions provide the disposable results above.
- Local `npm run lint` cannot run because `tsc` is not installed; offline dependency installation fails because the lockfile lacks platform-optional entries. The lockfile was not changed. CI must provide the authoritative lint/build result.

## Migration and rollback guidance

Apply neither migration to production from this PR. After release authorization, apply each only through the protected release controller and verify catalog ACLs/policies immediately afterward. Both migrations are transactional; a failed migration rolls back atomically.

For a non-production rehearsal, reset the disposable database to the pre-migration fixture. If a post-apply application rollback is required, keep the stricter `leave_types` ACL and tenant guards in place; reverting code must not restore broad client DML or global address/family reads. Any deliberate policy replacement must preserve authenticated self-read and an explicit parent-tenant restrictive guard. Do not use a reverse migration that grants anon/authenticated DML or reinstates the global address/family policies.

## WS05 definitive release gate and blockers

**WS05 gate: BLOCKED — not safe to release the full view set yet.** Minimum visible views can be considered only after all of the following are cleared:

1. Run exact PR #50 PG17/address/family/leave ACL and disposable real-Auth workflows; attach exact commit and passing CI evidence.
2. Reconcile source migrations with hosted state under protected release authorization; verify the new migration head and resulting policies/ACLs read-only afterward.
3. Obtain authorized independent employee, HR, Manager, Super Admin and inactive-membership identities plus two isolated hosted tenants. Run positive/negative tenant, role, expiry, tenant-switch and unauthorized direct-access acceptance.
4. Resolve whether employee self-profile requires active tenant membership, then prove the chosen source contract with real-Auth positive/negative cases.
5. Keep HR01 contacts, private Candidate/recruiter/interview actions, leave-type mutations, employee writes and other unsupported operations disabled until their exact APIs, arguments, source migrations and server authorization tests exist and are hosted.
6. Enable/review the Auth leaked-password protection setting through the separately authorized Auth configuration process; this task made no Auth changes.
7. Review the remaining 246 authenticated SECURITY DEFINER functions by exposed API and permission path before claiming whole-project security acceptance.

No production writes, merges, permission bypasses or deployments were made by WS02.
