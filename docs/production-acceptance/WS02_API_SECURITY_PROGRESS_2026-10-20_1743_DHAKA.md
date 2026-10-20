# WS02 API/Security exact-head progress — 2026-10-20 17:43 Dhaka

This is a delta to the existing [PR #39 production acceptance report](https://github.com/shihab-tech04/HRIS-v2/blob/evidence/hris-prod-api-acceptance-20261020-1226dhaka/docs/production-acceptance/HRIS_Production_API_Security_Acceptance_2026-10-20.md). It continues that evidence; it does not restart the audit or certify stories. The report remains **PARTIAL / NOT ACCEPTED** as a production release gate.

## Exact refs checked

| Scope | Live ref at check |
|---|---|
| Production Supabase project `oslgwxaqfbteqtwqvdzs` | Latest migration `20261020044145` |
| HRIS `main` | `cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7` |
| HRIS `development/hris-checkpoints` | `b262cade4175fc98cac56af05f88c3d16e68dc53` |
| PR #39 evidence branch, before this doc commit | `4282085312e1963e1fc90082677bbb89e43d35d1` |
| PR #38 release candidate (WS01/WS05) | `686eec7016ec831e9b679500f28f553b8f93b14f` |
| Candidate PR #6 (WS03) | `3427678feb72e61e17420509e3eb4980cc68a672` |
| PR #42 Employee (WS06) | `4a7656325b9e8cc3a99e47535d937dc7ff1feba9` |
| PR #43 HR Operations (WS07) | `779c8130e09281e60af94713de250edeca3703ea` |
| PR #44 Management/Admin (WS08) | `f4c44bf52c4041232d591746651ee409ccf8c120` |
| PR #41 Release ledger (WS05) | `1ccd0f588805f656c2b7ac83defc9ddb5e824eeb` |

PRs #42–44 still target development base `1714a08e24f47999618b0127fc818a3d19eb187a`, behind current development head `b262cade…`. Rebase and acceptance remain with the owning workstations and WS05.

## Latest read-only hosted catalog result

The read-only migration listing still ends at `20261020044145`. A catalog query checked the deployed signatures and EXECUTE ACLs for the permission helpers, HR01 contact calls, three employee self-write calls, and all seven new Candidate/interview calls.

Present:

- `has_permission(p_permission_id text) RETURNS boolean` and `has_tenant_permission(p_tenant_id uuid, p_permission_id text) RETURNS boolean`
- `employee_update_my_profile(p_payload jsonb) RETURNS uuid`
- `employee_save_my_addresses_v2(p_rows jsonb) RETURNS integer`
- `employee_save_my_family_members_v2(p_rows jsonb) RETURNS integer`

Each present function is SECURITY DEFINER; `authenticated` and `service_role` have EXECUTE, while `anon` does not.

Absent:

- `hris_get_tenant_employee_contact_details(uuid, uuid)`
- `hris_update_tenant_employee_contact_details(uuid, uuid, jsonb)`
- All seven `hris_*candidate/interview*` functions listed in the main PR #39 report.

A separate read-only catalog lookup returned NULL for `public.legal_entities` and both HR01 contact RPC signatures. No DDL, DML, Auth, membership, role, tenant, setting, or migration-history write was made. No migration was replayed.

## Contract and acceptance status

| Area | Result | What is established / remaining |
|---|---|---|
| `has_permission(text)` and the separate System Administrator | **PASS — expected denial** | The deployed helper routes through active tenant membership, active tenant role, and exact `role_permissions`; it does not read legacy `user_roles`. The System Administrator has legacy permissions but no active tenant membership. Do not add a global-role fallback or another Super Admin. If tenant HR/Admin access is intended, the owner must authorize a least-privilege membership and role through the normal process. |
| HR01 employee contact APIs | **FAIL — hosted parity** | Source signatures are `hris_get_tenant_employee_contact_details(p_tenant_id uuid, p_employee_id uuid) RETURNS jsonb` and `hris_update_tenant_employee_contact_details(p_tenant_id uuid, p_employee_id uuid, p_contact_details jsonb) RETURNS jsonb`. Both are SECURITY DEFINER; source grants EXECUTE to `authenticated` only (revoke PUBLIC, anon, service_role). Bodies require `has_tenant_permission(p_tenant_id, 'employees.manage')` and constrain employee ID plus tenant ID. The synthetic two-tenant CI run passed positive, invalid-payload, duplicate-email, insufficient-role, inactive/global-only, anonymous, direct-write, and foreign-tenant cases. The production signatures are absent; keep any new UI path gated until a reviewed migration is released and hosted parity is checked. |
| Employee E02-02 / E02-04..07 self-write RPCs | **PASS — hosted catalog; FAIL — source parity; BLOCKED — targeted runtime tests** | The hosted APIs bind to the caller through `is_live_session()` and `employee_for_auth_user()`; the helper resolves the caller’s own active employee in default tenant slug `synesis-it`. The calls take no tenant or employee ID and do not check tenant membership. Three functions are absent from all 100 migrations in development `b262cade…`. The earlier 378/378 WS06 aggregate did not invoke them. Do not invent or silently change their multi-tenant contract. Restore reviewed source, then run the exact own-row, protected-field, cross-employee ID, validation, omitted-row, audit-redaction, and direct-table denial cases in the main PR #39 report. |
| Employee address/family admin reads | **FAIL — tenant policy and ACL** | Prior PR #39 evidence records admin-read policies authorized only by employee permission without a parent-employee tenant predicate. Authenticated also has `SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`; direct DML is absent. Smallest proposal: make each manager policy use an `EXISTS` join from child `employee_id` to `employees.id` and call `has_tenant_permission(e.tenant_id, 'employees.view'|'employees.manage')`; revoke all public-role table privileges then grant `SELECT` to authenticated. Retain identity-bound self-read and SECURITY DEFINER write paths. Validate both tenants, owner rows, no-permission, inactive membership, anon, and direct write denials. This is proposal-only. |
| `leave_types` | **FAIL — excess ACL** | Prior PR #39 catalog evidence records RLS with SELECT-only policies but full `arwdDxtm` privileges for `anon` and `authenticated`. No mutation probe was sent. Proposed only after confirming no approved direct-table writer: revoke all from PUBLIC/anon/authenticated, grant SELECT to authenticated, preserve service_role ACL; verify signed-out and signed-in read paths plus DML denial in disposable CI. |
| WS03 new Candidate/interview RPCs | **FAIL — hosted parity** | All seven are absent. Exact signatures, grants and source call sites are in [the Candidate section of PR #39](https://github.com/shihab-tech04/HRIS-v2/blob/evidence/hris-prod-api-acceptance-20261020-1226dhaka/docs/production-acceptance/HRIS_Production_API_Security_Acceptance_2026-10-20.md#ws03-candidateinterview-rpc-contract-and-release-gate). `hris_get_recruitment_pipeline` and `hris_update_candidate_application_stage` are required before enabling the new page and stage workflow. Schedule, responses, panel notes, completion and offer actions can remain gated. Six functions passed synthetic two-tenant tests; `hris_issue_candidate_offer` has no positive/negative test yet. |
| HR03 legal entities / SA06 platform master data | **BLOCKED — contract unspecified** | Production has no legal-entity relation or API and no platform-global master-data writer. Cardinality, fields, lifecycle, ownership, duplication, history, and employee linkage are not approved. Existing organization readers, leave-type editor, and Super Admin tenant-list RPC are not substitutes. No schema or endpoint proposal is promoted to implementation. |
| Production signed-in acceptance | **PARTIAL / BLOCKED** | The earlier PR #39 report contains the one signed-in Super Admin read-only results. No separate HR/Admin or linked employee session is available in the current acceptance evidence. Production has one active tenant, so real foreign-tenant acceptance remains blocked. No password, recovery code, or OTP was requested or accessed. |
| Disposable two-tenant run | **PASS for previously covered scope; remaining cases blocked** | Run [39378140222 / job 118480812801](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140222/job/118480812801) ran on the current PR #38 source head `686eec7016ec831e9b679500f28f553b8f93b14f`, passed 342/342 contract checks and 375/375 Auth/RLS checks, then stopped the local-only stack. It covers HR01 and six Candidate/interview paths. It does not call the three hosted employee self-write RPCs and does not cover offer issuance. No new cloud project or production test tenant was created. |

## Exact isolated cases to close

Use the existing disposable local Supabase/Auth/Postgres harness, synthetic rows in two tenants, and real signed-in Auth claims. Do not point the harness at hosted production.

1. **Employee self-write positive:** employee A updates only the linked employee profile; the function returns A’s UUID. Assert changed values are on A only and audit records field names without values. Include protected keys (`employee_id`, `tenant_id`, `employment_status`, `role`) and assert they do not change protected columns.
2. **Employee self-write denial:** employee B linked only to tenant B, an unlinked manager, and a no-permission user cannot modify A. Address/family IDs owned by B must fail with SQLSTATE `42501`; unknown keys, duplicate IDs, invalid values and omitted existing rows must fail with `22023`; all failed requests leave fixtures unchanged.
3. **Employee child-table RLS/ACL:** tenant A HR can read only A child rows; tenant B HR can read only B; employees see only their own children; inactive membership, global-only, anonymous and cross-tenant reads fail or return no rows according to the endpoint contract. Direct INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN remain denied to client roles; authenticated SELECT remains RLS-filtered.
4. **Candidate offer:** test an authorized valid issuance plus no-permission/view-only and foreign-tenant denials. Include other payload or state cases only where the approved RPC contract defines them. Keep offer UI gated until this test and hosted API parity pass.
5. **HR01 contact:** keep the already-passing source tests and add hosted catalog parity to the release gate; do not substitute direct employee table writes or `admin_save_employee`.

The previous harness command sequence and exact assertions are documented in the main PR #39 report. This executor has Node/npm but no Docker, Supabase CLI, or psql, so it cannot start another local disposable stack. Existing CI evidence is reused only for the exact source commit and cases listed above; uncovered cases remain **BLOCKED**, not inferred from aggregate totals.

## Owner handoffs

- **WS01 — PR #38, head `686eec7016ec…`:** keep the new HR01 contact path and new Candidate pipeline gated until hosted APIs match. Keep `has_permission` tenant-scoped; do not use legacy global roles as fallback. Render a clear authorization/no-linked-employee state when the API returns the expected denial. Review the E02 profile-change RPC arguments against the required tenant parameter in the PR #39 report.
- **WS03 — Candidate PR #6, head `3427678feb72…`:** preserve API-side tenant and role checks. Treat pipeline read and stage update as the minimum hosted parity gate. Leave all offer/interview actions gated; add authorized offer issuance plus no-permission/view-only and foreign-tenant denial tests before enabling offers. Derive additional cases only from the approved RPC contract. Do not count the intercepted-browser test as hosted API evidence.
- **WS06 — PR #42, head `4a7656325b9e…`:** restore only reviewed source for the three hosted employee self-write functions; add targeted synthetic two-tenant cases in the checklist above. Apply the address/family tenant-parent policy and least-privilege ACL proposal only in the owned migration workflow after review. Do not claim E02 story certification from hosted catalog or aggregate tests.
- **WS07 — PR #43, head `779c8130e092…`:** keep HR03 blocked pending approved product contract. Review the `leave_types` ACL proposal with its owning release path and confirm the application does not rely on anon reads before narrowing privileges.
- **WS08 — PR #44, head `f4c44bf52c40…`:** keep SA06 blocked; obtain approved catalog and authorization scope before proposing API/schema. Tenant leave types and platform tenant listing are not SA06.
- **WS05 — PR #41, head `1ccd0f588805…`, and release PR #38:** retain release HOLD for hosted API/source parity, tenant RLS, and uncovered tests. Track that PRs #42–44 need owner-managed rebase from `1714a08e…` onto current development `b262cade…`. WS05 remains sole merge/deploy owner.

No E02, HR03, SA06, Candidate/interview, or full production security story is certified by this progress note. Production stayed read-only; no application code, production migration, merge, or deployment was performed.
