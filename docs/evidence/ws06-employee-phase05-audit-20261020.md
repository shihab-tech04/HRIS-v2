# WS06 Employee Phase 05 ownership and source audit

## Verified source and branch

- Repository: `shihab-tech04/HRIS-v2`.
- Current authoritative base at audit time: `development/hris-checkpoints` — `1714a08e24f47999618b0127fc818a3d19eb187a` (verified against GitHub; not the handoff snapshot by assumption).
- Work branch: `work/ws06-employee-phase05-20261020`, created from that exact base.
- Canonical ownership source: `docs/audit/HRIS_1047_Story_Classification_Register_2026-10-20.csv` at read-only commit `dcdd89ba140cd92ace71130b4eab439525e07594` (GitHub blob `a1e52ca9c6fab5226532525cf1faf73dd60ed6de`). It contains 362 distinct `role_name=Employee` story IDs. The repo's recovered matrix used for the executable scope check has SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The full Employee ID list is compiled in [ws06-employee-story-ownership-20261020.csv](ws06-employee-story-ownership-20261020.csv). The contract test compares every row with the hash-pinned recovered matrix and checks the exact Phase 05 assignment.
- Base commit checks at audit time: `isolated-hris`, `tenant-provisioning`, and `probe` all completed successfully on `1714a08e24f47999618b0127fc818a3d19eb187a` (Actions runs `39386413561`, `39386413562`, and `39386413577`). These are base-branch checks, not new WS06 results.

## Exact Phase 05 checklist

Status wording reflects the canonical audit overlay plus code and prior disposable evidence review. `IMPLEMENTED_NOT_CERTIFIED` means source/disposable evidence exists; it does not mean hosted or production acceptance. `BLOCKED` for traceability means story-level certification is missing and does not establish that the feature is absent.

| Source audit summary | Count |
| --- | ---: |
| Implemented, not certified | 16 |
| Partial | 4 |
| Blocked | 16 |
| Assigned Phase 05 stories | 36 |

| ID | Canonical requirement | Audit disposition and current evidence/gate |
| --- | --- | --- |
| E02-01 | View personal information | Implemented, not certified; self-only profile projection and browser evidence at `6ff29e898aef54c2779e44cfdd5e465c79e6c11`; run `39371994771`. |
| E02-02 | Update editable personal information | Blocked pending source-backed contract: WS05's read-only production catalog recheck reports `employee_update_my_profile(p_payload jsonb)` exists and is executable by `authenticated`/`service_role`; it binds `auth.uid()` to an employee and checks an active admin row plus `synesis_tenant_id()`. The defining source is not in the current development migration tree, and exact JSON keys, grants/source provenance, source-to-production parity, and two-tenant denial evidence are pending from WS02. Do not infer writable fields from the JSON payload. |
| E02-03 | Request changes to protected HR-controlled fields | Implemented, not certified; `src/live/ProfileChangeRequests.tsx`, isolated profile-change browser evidence at `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5`; run `39147470480`. |
| E02-04 | Manage contact details | Blocked: WS05's production catalog recheck found no employee-self contact routine; the development contact editor RPC is `employees.manage`-scoped and targets an employee record. Do not route self writes through it or expose sign-in email/protected fields. |
| E02-05 | Manage present and permanent addresses | Blocked pending source-backed contract: development adds an own-row SELECT policy in `20261016151101_employee_addresses_self_read_policy.sql` and drops the temporary getter in `20261016151112_employee_get_my_addresses_cleanup.sql`; no address write path is present in that source. WS05 reports production `employee_save_my_addresses_v2(p_rows jsonb)` exists, but its defining source, exact fields/grants, source parity, and two-tenant tests are pending from WS02. |
| E02-06 | Manage emergency contacts | Blocked: WS05's production catalog recheck found no emergency-contact update routine. Emergency fields exist in the development manager contact contract, which requires `employees.manage`; no employee self-write authorization is established. |
| E02-07 | Manage dependent/family information | Blocked pending source-backed contract and read-policy repair: development migration `20261016171104_employee_family_tenant_scoped_read.sql` grants authenticated `SELECT` only and is absent from production at `20261020044145`. WS05 reports production `employee_save_my_family_members_v2(p_rows jsonb)` exists, but its defining source, exact fields/grants, source parity, and two-tenant tests are pending from WS02. Separately, production family-table ACL still includes `REFERENCES`, `SELECT`, `TRIGGER`, and `TRUNCATE`, and its admin policy lacks a row-tenant predicate. Do not treat the development test as production certification. |
| E02-08 | View employment information | Implemented, not certified; self-only identity projection and browser evidence at `6ff29e898aef54c2779e44cfdd5e465c79e6c11`; run `39371994771`. |
| E02-09 | See designation, department, manager, location, grade, and employment type | Blocked for certification: current identity evidence covers employee number, designation, department, and status only; remaining fields lack an approved employee projection/evidence mapping. |
| E02-10 | Add and update education records | Blocked for certification: no ID-level source evidence in the canonical overlay. Feature absence is not inferred. |
| E02-11 | Add and update previous employment | Blocked for certification: no ID-level source evidence in the canonical overlay. Feature absence is not inferred. |
| E02-12 | Manage skills | Implemented, not certified; employee-owned skill journey at `6ff29e898aef54c2779e44cfdd5e465c79e6c11`; run `39371994771`. |
| E02-13 | Manage certifications | Blocked for certification: no ID-level source evidence in the canonical overlay. Feature absence is not inferred. |
| E02-14 | Manage professional links | Blocked for certification: no ID-level source evidence in the canonical overlay. Feature absence is not inferred. |
| E02-15 | Upload and replace profile photo | Blocked for certification: no ID-level source evidence or approved private-storage write contract is mapped. Feature absence is not inferred. |
| E02-16 | See which fields are verified or HR-controlled | Blocked for certification: no ID-level source evidence in the canonical overlay. Feature absence is not inferred. |
| E02-17 | See profile change request status | Implemented, not certified; `src/live/ProfileChangeRequests.tsx`, isolated profile-change browser evidence at `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5`; run `39147470480`. |
| E02-18 | Preserve historical employment records where required | Blocked for certification: no ID-level source evidence or employee history projection is mapped. Feature absence is not inferred. |
| E03-01 | View documents stored against the employee record | Implemented, not certified; `src/live/EmployeeDocumentVault.tsx`; disposable Auth/RLS/browser run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E03-02 | Upload documents HR allows the employee to provide | Blocked on an approved employee upload allowlist and write contract. |
| E03-03 | Replace an expired document | Blocked on E03-02 and approved replacement semantics. |
| E03-04 | See document verification status | Implemented, not certified; self-record projection and browser evidence in run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E03-05 | See document expiry dates | Implemented, not certified; self-record projection and browser evidence in run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E03-06 | Receive reminders for documents approaching expiry | Blocked on an approved trigger, threshold/schedule, and notification contract. |
| E03-07 | Download documents the employee may access | Implemented, not certified; private employee-owned Storage path checks in run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E03-08 | See the reason for a rejected document | Implemented, not certified; rejected-only review note checks in run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E04-01 | See employee ID | Implemented, not certified; self-only identity card evidence in run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E04-02 | Access a digital employee card where supported | Implemented, not certified; open/retry/refresh/close and responsive browser evidence in run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E04-03 | See official designation and department | Implemented, not certified; same-tenant card projection and browser evidence in run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E04-04 | Reflect active employment information | Implemented, not certified; active status refresh evidence in run `39018685182` at `426527fd45a983e6958a0ca5ef063305d69bd48a`. |
| E04-05 | Handle expired or inactive status correctly | Partial: inactive/terminated handling is covered, but no approved employment-expiry field or policy exists in the current employee contract. |
| E37-01 | Search employees | Implemented, not certified; tenant-scoped directory browser evidence in run `39025622956` at `01b20934a9a63e0f220eb30c9a65d55daf4010b4`. |
| E37-02 | Filter by department/team/location where allowed | Partial: department and team filters are implemented and tested. The approved directory projection has no location field; no location data was added. |
| E37-03 | See permitted contact information | Partial: employee-view directory projection omits personal/official contact fields. The existing contact RPC requires `employees.manage`; employee visibility requires a WS02 contract. |
| E37-04 | See designation and reporting relationships | Partial: designation and team are available. Reporting-line fields are absent from the current directory contract. |
| E37-05 | Keep sensitive data hidden | Implemented, not certified; private fields are omitted from the tenant directory projection and browser evidence in run `39025622956` at `01b20934a9a63e0f220eb30c9a65d55daf4010b4`. Current-page CSV exports only Employee, Employee number, Department, Designation, Team, and Employment status. |

## Story-to-source and prior evidence map

| Story IDs | Source file | Focused contract test | Prior disposable evidence |
| --- | --- | --- | --- |
| E02-01, E02-08 | `src/live/LiveHrisWorkspace.tsx` | `tests/contracts/employee-dashboard-profile-contact.test.mjs` | Run `39371994771`, source commit `6ff29e898aef54c2779e44cfdd5e465c79e6c11` |
| E02-03, E02-17 | `src/live/ProfileChangeRequests.tsx` | `tests/contracts/profile-change-requests.test.mjs` | Run `39147470480`, source commit `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5` |
| E02-12 (skills) | `src/live/MyLearning.tsx` | `tests/contracts/learning-self-service.test.mjs` | Run `39371994771`, source commit `6ff29e898aef54c2779e44cfdd5e465c79e6c11` |
| E03-01, E03-04, E03-05, E03-07, E03-08 | `src/live/EmployeeDocumentVault.tsx` | `tests/contracts/employee-document-self-service.test.mjs`, `tests/contracts/employee-documents-tenant-read.test.mjs` | Run `39018685182`, source commit `426527fd45a983e6958a0ca5ef063305d69bd48a` |
| E04-01, E04-02, E04-03, E04-04 | `src/live/EmployeeIdentityCard.tsx` | `tests/contracts/employee-identity-card.test.mjs` | Run `39018685182`, source commit `426527fd45a983e6958a0ca5ef063305d69bd48a` |
| E37-01 through E37-05 | `src/live/OrganizationEmployeeDirectory.tsx` | `tests/contracts/employee-directory.test.mjs`, `tests/contracts/employee-directory-story-reconciliation.test.mjs` | Run `39025622956`, source commit `01b20934a9a63e0f220eb30c9a65d55daf4010b4` |

Blocked and partial IDs have no safe employee-write or projection contract beyond the gates described in the checklist. The focused tests above are also included in the full contract run for the WS06 checkpoint below.

## Production catalog delta (read-only; not source parity)

WS05's read-only production catalog recheck in PR #39 comment `6286977559` reports three deployed self-write routines: `employee_update_my_profile(p_payload jsonb)`, `employee_save_my_addresses_v2(p_rows jsonb)`, and `employee_save_my_family_members_v2(p_rows jsonb)`. The profile routine is executable by `authenticated` and `service_role`; the recheck summarizes its live-session/employee binding and a fixed personal-field update set, but does not provide the exact JSON key allowlist or source definition. The address and family routine grants, function bodies, field allowlists, and migration/source provenance were not provided. The recheck says these routines use a helper that binds the authenticated user to an employee and resolves `synesis_tenant_id()` to the active `synesis-it` slug; production currently has one active tenant and one active tenant membership. This is catalog evidence, not a source-to-hosted contract or two-tenant proof.

The same recheck reports no employee-self contact routine, no emergency-contact update routine, and no production `hris_get_tenant_employee_contact_details` / `hris_update_tenant_employee_contact_details` routine. It also reports the production family table's permissive admin SELECT policy has no row-tenant predicate and its authenticated ACL includes `REFERENCES`, `SELECT`, `TRIGGER`, and `TRUNCATE`. These findings do not authorize a new UI/API write path. WS06 requested exact deployed definitions, source provenance, grants, allowlists, tenant checks, and disposable two-tenant tests from WS02 in PR #39 comment `6287017158`.

## Latest WS06 checkpoint verification

- This report refresh was based on WS06 head `3384a77750c92499d9ea8e5069cda33e7f5d0683`; at that checkpoint the verified authoritative base was `1714a08e24f47999618b0127fc818a3d19eb187a`.
- Exact-head Actions run `39395475832` passed typecheck, full contracts, production build, synthetic-session browser regressions, disposable Auth/RLS acceptance, Phase 04 parity, and disposable security-advisory checks. It is isolated evidence, not hosted acceptance.
- Employee runtime evidence in run `39395475832`:
  - E02-01 profile returned the linked employee's own identity and denied cross-tenant, global-only, and anonymous callers. E02-08 employment reads were self-scoped with cross-tenant denial.
  - E03 document browser acceptance covered self-record reads, recovery, download, localization, and responsiveness; Auth/RLS denied mismatched tenant, foreign employee, manager, and anonymous access.
  - E04 identity-card Auth/RLS denied wrong tenant, cross-employee identity, manager without employee link, and anonymous access. E04-02 opened, retried, and closed responsively.
  - E37 directory tests covered tenant-scoped search, department/team filtering, page/export limits, privacy-limited CSV fields, mobile/desktop browser acceptance, and foreign-tenant/no-permission denials. Location remains absent from the approved projection.
  - E02-03/E02-17 retain earlier isolated browser/Auth evidence in run `39147470480`, source commit `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5`.
- The focused local Phase 05 Employee contracts passed `48/48` at the report's code tree (same as head `3384a77750c92499d9ea8e5069cda33e7f5d0683`); `git diff --check` passed. This command covers profile/contact projections, profile-change requests, skills, documents, identity card, directory, family privacy, and WS06 ownership.
- Exact-head Actions run `39395475728` passed TypeScript, full contract checks, and production bundle build, then failed only `Verify the branch-served Pages entry matches the production build`. Generated assets were `app-C4oUgMGJ.js` / `app-GpVcVTBs.css`; unchanged base and WS06 `index.html` share blob SHA `d037342b643bae45f4adb040ec7e0c8d022e4d3a` and reference `app-2l-hdvDU.js` / `app-BWuIahKW.css`. The workflow skipped its browser-smoke step. PR #42 changes workflow wiring, evidence, and contracts only; app source and assets are unchanged. The mismatch is routed to WS01/WS05.
- WS02 contract request and follow-up are posted on PR #39 as comments `6286731239` and `6287017158`. Latest WS05 read-only catalog findings are recorded in comment `6286977559`; exact function source/allowlist/grant parity and two-tenant tests are still pending. No hosted Employee role/tenant certification is claimed.

## Live base branch advance after the WS06 checkpoint

- Direct GitHub branch/ref lookup and `git ls-remote` verified that `development/hris-checkpoints` advanced to `f02ae03da438c88fc796163be7dc0880826b54e3` at 2026-10-20 08:51 UTC. It moved from `1714a08e24f47999618b0127fc818a3d19eb187a` through `ecdd61c7cb22596e091f938ff00ce5cd0d0e110a` and `f02ae03da438c88fc796163be7dc0880826b54e3`.
- WS06 head at this recheck remained `3384a77750c92499d9ea8e5069cda33e7f5d0683`, with merge-base `1714a08e24f47999618b0127fc818a3d19eb187a`. Diffing the live base against WS06 head still lists only the six WS06 workflow/evidence/contract files; there are no changed-path overlaps. No HR01 file was edited by WS06.
- The base advance changes `src/live/OrganizationEmployeeDirectory.tsx` only to show a fail-closed unavailable message when manager contact RPCs return `PGRST202`; its added browser/Auth evidence covers the manager contact flow. This is WS01-owned HR01 contact behavior, not an employee-self contact contract and not an E37-03 self-contact grant.
- Current base checks at 2026-10-20 08:56 UTC: runner probe `39396457633` **PASS**; Phase 2A tenant-provisioning Auth/RLS/browser run `39396457535` **PASS**; disposable Auth/Postgres/browser run `39396457586` **in progress**. The WS06 exact-head runs above are separate and do not include the later base commits.

## Implementation decision and required handoff

The earliest unresolved story, E02-02, is not safe to implement from a production catalog name alone: its defining versioned source, exact field allowlist, parity evidence, and two-tenant tests are still missing. E02-05/E02-07 have production routines reported by catalog but the same contract evidence is missing; E02-04/E02-06 have no employee-self routines reported. No profile, address, contact, family, document, migration, RLS, or shared-shell source was rewritten. The current solved profile, identity-card, document, and directory UI remains intact.

WS02 handoff: map the three catalog-reported self-write routines to their exact versioned source/provenance and provide each function definition, overload/return type, security mode/search path, EXECUTE grants, allowed JSON keys/columns, validation, employee binding, tenant resolution, audit behavior, and source-to-production parity. Confirm direct address/family table write privileges separately; confirm the absent self-contact/emergency routines; and provide disposable two-tenant positive and foreign-tenant denial tests where source permits. No production write, schema change, grant change, migration replay, or user change is requested.

Until that handoff and the document-reminder, location, reporting-line, and expiry policies are sourced, the remaining assigned gaps stay blocked or partial. No hosted production certification is claimed. Local execution of the full contract set needed the adjacent Candidate checkout; the branch CI cloned Candidate read-only and passed the full contract suite. Disposable Auth/RLS and browser acceptance passed in Actions without a production deployment. The Pages asset-parity failure and exact build asset hashes are recorded above.
