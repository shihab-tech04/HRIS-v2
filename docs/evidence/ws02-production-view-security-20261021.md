# WS02 production-view security handoff — 2026-10-21

## Decision

**Full production-view release remains blocked.** The read-only catalog evidence does not establish hosted HR/Admin or employee acceptance, and only one active production tenant is available for the deployed project. This packet fixes one source-backed address privacy policy defect in an isolated review branch. It makes no production database or deployment changes.

Source base: `development/hris-checkpoints` at `2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc`.

## Minimum security conditions for approved views

- A current authenticated session must be established before loading private data.
- Server-side RLS/RPC authorization must bind every employee or Candidate row to the caller's active tenant membership, active role, and exact view permission. A hidden or disabled client control is not an authorization boundary.
- Anonymous callers must not execute private read or write RPCs. Public vacancy browsing may expose only the published public vacancy projection.
- Employee self-service reads must bind to the authenticated employee identity. Managers may read only rows whose parent employee belongs to their authorized tenant.
- Release views may issue only reviewed read requests. Unsupported or absent mutation APIs remain unavailable; no direct-table fallback or client-only permission check is introduced.
- Acceptance must include two synthetic tenants, employee ownership, view-only versus manage roles, missing/inactive membership, stale session, anonymous access, cross-tenant denial, and direct-write denial.
- Real employee and Candidate values must not be used to populate unfinished screens.

## Hosted evidence, read-only

- Supabase project is healthy. The latest deployed migration head is `20261020044145` (`phase03_learning_context_authenticated_acl_20261020`). The current development tree contains later migrations, so it is not at hosted parity.
- The hosted permission helpers use a live session, active tenant membership, active role, and exact `role_permissions` entry. The legacy `user_roles` catalog is not an authorization fallback.
- The available hosted evidence includes one Super Admin session and one active tenant membership. No independent HR/Admin or employee sign-in and no second active tenant were available to this workstream. Hosted sign-in, employee ownership, role-restriction, anonymous HTTP, and two-tenant runtime acceptance therefore remain **NOT VERIFIED**.
- `employee_addresses` and `employee_family_members` have authenticated SELECT policies whose old administrator policies call the global permission helper without checking the parent employee tenant. The hosted family policy is still legacy; the tenant-scoped family migration `20261016171104_employee_family_tenant_scoped_read.sql` is in development but absent from deployed migration history.
- Hosted `leave_types` has full table ACLs for `anon` and `authenticated`, although its current row policies are SELECT-only. Source migration `20261016142000_hris_leave_type_policy_management.sql` says the RPC is the authenticated write path, revokes client INSERT/UPDATE/DELETE, and grants authenticated SELECT. That source migration is not recorded at the current hosted head.
- The three hosted employee self-write functions—`employee_update_my_profile(jsonb)`, `employee_save_my_addresses_v2(jsonb)`, and `employee_save_my_family_members_v2(jsonb)`—are SECURITY DEFINER with authenticated/service-role EXECUTE and anon denied. No checked-in development migration defines them. Their hosted identity-bound behavior cannot be reproduced or certified from this source tree, so they are not an approved generic employee or tenant contract.

## API dependencies and UI gates

| Area | Source/host evidence | Release disposition |
|---|---|---|
| HR01 contact read/write | Development migration `20261014171952_employee_contact_details_editing.sql` defines `hris_get_tenant_employee_contact_details(uuid,uuid)` and `hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)`. The live employee directory calls them. Both are absent from hosted `pg_proc`. | Keep the contact editor's existing missing-RPC safe failure. Do not substitute direct employee-table writes or invent a contract. |
| Recruiter/interview | Source-backed hosted preflight covers `hris_get_recruitment_pipeline`, `hris_update_candidate_application_stage`, `hris_issue_candidate_offer`, `hris_schedule_candidate_interview`, `hris_get_candidate_interview_responses`, `hris_save_candidate_interview_panel_notes`, and `hris_complete_candidate_interview`. The read-only hosted catalog returned none of these functions. | Keep recruitment/interview actions unavailable until the exact APIs, source migration history, and authorization tests are deployed and rechecked. |
| Candidate PR #8 | Current head `28260cdf73b0af312df4cf136b61942f5363b573` is limited to public vacancies, with Apply/Save disabled on public-only details; its exact-head UI run 8 passed. No approved Candidate self-service frames were found. It does not supply hosted private recruiter/interview APIs. | Keep public published vacancies on the public projection. Do not expose private applicant profiles, interview data, notes, or offer details. |
| Employee self-write | The three functions above exist in hosted catalog but not in checked-in migrations, and current development has no matching call sites. | Do not wire them into new screens until a reviewed source migration and disposable real-Auth tests establish exact ownership, tenant, validation, and audit behavior. |

The read-only hosted RPC probe in PR #48 confirms its nine required signatures (two HR01 and seven Candidate) are absent. PR #49's current UI head is `2e24564c837509e12b4cbc69f8b6295cda066c0b`; it preserves role gates and leaves unsupported attendance requests and unavailable personal leave history disabled. Its UI workflow passed, but this report does not certify hosted sign-in, pixel parity, or release behavior for that PR.

## Scoped source fix in this branch

Migration `20261021060748_employee_addresses_tenant_read_guard.sql` replaces the address table's global administrator policy with the existing tenant membership helpers and adds a restrictive guard. It preserves the existing employee self-read policy, ties manager reads to the parent employee tenant, and fails migration preflight when the source authorization helpers are missing. The fixture and acceptance checks use synthetic rows and a disposable PostgreSQL 17 runner only.

Local contract check: **354/354 passed**. The new address policy and two-tenant matrix passed in disposable PostgreSQL 17 on exact source commit `15b2284312d99c6e524cd36df3d43839b250874b`: [workflow run #5](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39554393758), job `119070649396`. Existing isolated family migration workflow passed at development commit `2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc`: [run #6](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39553132929). These checks are disposable evidence, not hosted acceptance.

## PR #48 reconciliation and WS05 blockers

PR #48's forward migration removes `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN` from selected client table ACLs. Its synthetic assertion deliberately preserves CRUD across all five tables. That is not sufficient evidence for `leave_types`: the source migration above requires client DML revocation and the hosted ACL still has it. WS05 should reconcile the table-specific contract and update the assertion/migration sequence before treating PR #48 as a complete least-privilege fix. This WS02 branch does not alter PR #48.

WS05 release handoff:

1. Review and sequence the address guard with the existing membership/permission migrations; only apply it through the approved controlled migration process after this branch's PostgreSQL 17 run passes.
2. Reconcile the hosted `leave_types` grants with the source RPC-only write contract. Keep the RLS SELECT path and approved `hris_save_leave_type` RPC; do not leave anon/authenticated direct DML grants merely to make a generic CRUD-preservation fixture pass.
3. Confirm why the family tenant-guard migration is absent from hosted migration history and restore hosted/source parity through the release controller.
4. Keep HR01 contact and recruiter/interview APIs gated until their exact source-backed migrations, hosted signatures/ACLs, and active/inactive/cross-tenant Auth tests pass.
5. Keep employee self-write APIs out of new screens until their hosted-only definitions have reviewed source provenance and two-tenant real-Auth tests.
6. Obtain an authorized second tenant plus independent HR/Admin and employee test sessions for hosted acceptance. Do not create memberships, accounts, or sample production records from WS02.
7. Review SECURITY DEFINER advisor findings by function and call path. The public Candidate jobs source is an intentional public projection; it must remain limited to published vacancy fields and must never return applicant-private data.

No production SQL, Auth, membership, role, or tenant writes; no merge; no deployment.
