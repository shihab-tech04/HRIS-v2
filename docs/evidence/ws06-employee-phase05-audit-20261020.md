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
| E02-02 | Update editable personal information | Blocked: no versioned/verified employee self-update API in the authoritative tree. A separate UI branch calls `employee_update_my_profile`, but no matching migration or Auth/RLS proof is present. WS02 must verify the deployed contract and allowed-field list. |
| E02-03 | Request changes to protected HR-controlled fields | Implemented, not certified; `src/live/ProfileChangeRequests.tsx`, isolated profile-change browser evidence at `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5`; run `39147470480`. |
| E02-04 | Manage contact details | Blocked: the existing contact update RPC is `employees.manage`-scoped and edits a target employee; it is not an employee self-service contract. Do not expose sign-in email or protected fields through it. |
| E02-05 | Manage present and permanent addresses | Blocked for writes: the development source adds an own-row SELECT policy in `20261016151101_employee_addresses_self_read_policy.sql` and drops the temporary getter in `20261016151112_employee_get_my_addresses_cleanup.sql`; no employee address insert/update/delete path is present. WS02 confirmation of deployed state is pending. |
| E02-06 | Manage emergency contacts | Blocked: emergency fields exist in the manager contact contract, which requires `employees.manage`; employee self-write authorization is not established. |
| E02-07 | Manage dependent/family information | Blocked for writes and production parity: development migration `20261016171104_employee_family_tenant_scoped_read.sql` grants authenticated `SELECT` only, but WS02's read-only production recheck reports that migration absent at head `20261020044145`; production ACL still includes `REFERENCES`, `SELECT`, `TRIGGER`, and `TRUNCATE`, and its admin policy lacks a row-tenant predicate. Do not treat the development test as production certification. |
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

## Latest WS06 checkpoint verification

- Current branch head before this report-only update: `46040714c5d828de696950832c842752c39dde2f`; authoritative base remains `1714a08e24f47999618b0127fc818a3d19eb187a`.
- Actions run `39390491713` passed typecheck, full contracts, production build, synthetic-session browser regressions, disposable Auth/RLS acceptance, Phase 04 parity, and disposable security-advisory checks.
- Employee runtime evidence in run `39390491713`:
  - E02-01 profile returned the linked employee's own identity and denied cross-tenant, global-only, and anonymous callers. E02-08 employment reads were self-scoped with cross-tenant denial.
  - E03 document browser acceptance covered self-record reads, recovery, download, localization, and responsiveness; Auth/RLS denied mismatched tenant, foreign employee, manager, and anonymous access.
  - E04 identity-card Auth/RLS denied wrong tenant, cross-employee identity, manager without employee link, and anonymous access. E04-02 opened, retried, and closed responsively.
  - E37 directory tests covered tenant-scoped search, department/team filtering, page/export limits, privacy-limited CSV fields, mobile/desktop browser acceptance, and foreign-tenant/no-permission denials. Location remains absent from the approved projection.
  - E02-03/E02-17 retain earlier isolated browser/Auth evidence in run `39147470480`, source commit `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5`.
- Local focused Employee Phase 05 contract command passed `48/48`; it includes profile, profile-change, skills, documents, identity card, directory, family privacy, and the WS06 ownership test.
- Actions run `39390491588` passed TypeScript, full contract checks, and production bundle build, then failed the Pages parity step. Build output used `app-C4oUgMGJ.js` / `app-GpVcVTBs.css`, while base and WS06 branch `index.html` share blob SHA `d037342b643bae45f4adb040ec7e0c8d022e4d3a` and reference `app-2l-hdvDU.js` / `app-BWuIahKW.css`. The workflow stops before its browser-smoke step. PR #42 changes only workflow files, evidence, and contracts; it does not change app source or static assets. The mismatch is routed to WS01/WS05.
- The WS02 contract request is posted in PR #39 comment `6286731239`. No response was present at the last recheck. WS02/WS05's latest production recheck (PR #39 comment `6286595825`) reports that the family read migration is absent from production and flags the deployed ACL/policy discrepancy above. This hosted finding is separate from passing synthetic development-source tests.
- Workflow YAML parsed successfully; `git diff --check` passed. No hosted production certification is claimed.

## Implementation decision and required handoff

The earliest unresolved story, E02-02, is not safe to implement against a UI-only RPC reference. The next employee-write stories (E02-04 through E02-07) also lack an authorized employee self-write contract. No profile, address, contact, family, document, migration, RLS, or shared-shell source was rewritten. The current solved profile, identity-card, document, and directory UI remains intact.

WS02 handoff: verify read-only against the deployed API at migration head `20261020044145` whether `employee_update_my_profile(p_payload jsonb)` exists; if it does, provide its exact signature, `authenticated`/`anon` grants, self/tenant checks, and allowlisted fields. Also specify an employee-self contact update contract distinct from `hris_update_tenant_employee_contact_details(... employees.manage ...)`, and confirm whether addresses or family rows have any approved write path. No production write, schema change, grant change, migration replay, or user change is requested by this handoff.

Until that handoff and the document-reminder, location, reporting-line, and expiry policies are sourced, the remaining assigned gaps stay blocked or partial. No hosted production certification is claimed. Local execution of the full contract set needed the adjacent Candidate checkout; the branch CI cloned Candidate read-only and passed the full contract suite. Disposable Auth/RLS and browser acceptance passed in Actions without a production deployment. The Pages asset-parity failure and exact build asset hashes are recorded above.
