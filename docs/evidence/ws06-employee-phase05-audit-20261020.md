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
| E02-02 | Update editable personal information | Blocked from implementation/certification pending source parity and isolated tests. WS02's latest report documents the hosted profile RPC, its fixed writable-field allowlist, grants, and own-linked-employee guard; none of the current development migrations defines it, and the disposable runner does not call it. See the current WS02 reconciliation below. |
| E02-03 | Request changes to protected HR-controlled fields | Implemented, not certified; `src/live/ProfileChangeRequests.tsx`, isolated profile-change browser evidence at `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5`; run `39147470480`. |
| E02-04 | Manage contact details | Blocked from certification pending source parity and isolated tests. WS02 documents phone, personal email, address, mailing address, and emergency-contact fields in the hosted employee profile RPC allowlist; there is no separate employee-self contact RPC. The separate manager contact RPC remains employees.manage-scoped. |
| E02-05 | Manage present and permanent addresses | Blocked pending source parity and isolated tests. WS02 documents employee_save_my_addresses_v2 with a fixed address-key allowlist and own-linked-employee binding; its defining source is absent from current development migrations. Direct authenticated child-table DML is not granted. |
| E02-06 | Manage emergency contacts | Blocked from certification pending source parity and isolated tests. Emergency-contact name, phone, and relation are included in the hosted employee profile RPC allowlist; no separate emergency-contact self RPC exists. |
| E02-07 | Manage dependent/family information | Blocked pending source parity and isolated tests. WS02 documents employee_save_my_family_members_v2 with a fixed family-key allowlist and own-linked-employee binding; its defining source is absent from current development migrations. The hosted admin-read policy lacks a parent-tenant predicate and the child ACL has excess privileges; see the WS02 reconciliation below. |
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
| E03-01 | View documents stored against the employee record | Implemented, not certified; current-head disposable run `39397073988` / job `118542325565` passed owner-only metadata reads and responsive employee document-browser acceptance at commit `4a7656325b9e8cc3a99e47535d937dc7ff1feba9`; see the exact run record below. |
| E03-02 | Upload documents HR allows the employee to provide | Blocked on an approved employee upload allowlist and write contract. |
| E03-03 | Replace an expired document | Blocked on E03-02 and approved replacement semantics. |
| E03-04 | See document verification status | Implemented, not certified; the self-service projection and current disposable Auth/RLS tests passed in run `39397073988`; independent story certification remains pending. |
| E03-05 | See document expiry dates | Implemented, not certified; the self-service projection and current disposable Auth/RLS tests passed in run `39397073988`; independent story certification remains pending. |
| E03-06 | Receive reminders for documents approaching expiry | Blocked on an approved trigger, threshold/schedule, and notification contract. |
| E03-07 | Download documents the employee may access | Implemented, not certified; current-head disposable browser acceptance passed the owner-authorized download path in run `39397073988`; Storage object access remains owner-only pending a tenant-safe path contract. |
| E03-08 | See the reason for a rejected document | Implemented, not certified; current-head disposable Auth/RLS tests confirmed correction reasons are returned only for rejected documents in run `39397073988`. |
| E04-01 | See employee ID | Implemented, not certified; current-head run `39397073988` has an exact story marker and own employee-number browser assertion. |
| E04-02 | Access a digital employee card where supported | Implemented, not certified; current-head run `39397073988` passed open, retry, close, and responsive card behavior. |
| E04-03 | See official designation and department | Implemented, not certified; current-head run `39397073988` passed same-employee designation/department projection and browser assertion. |
| E04-04 | Reflect active employment information | Implemented, not certified; current-head run `39397073988` passed active-status projection and browser assertion. |
| E04-05 | Handle expired or inactive status correctly | Partial: current-head run `39397073988` verified inactive/terminated handling; no approved employment-expiry field or policy exists. |
| E37-01 | Search employees | Implemented, not certified; current-head run `39397073988` passed persisted tenant-authorized search and foreign-tenant restrictions. |
| E37-02 | Filter by department/team/location where allowed | Partial: current-head run `39397073988` passed department/team filters; location remains unavailable in the approved projection. |
| E37-03 | See permitted contact information | Partial: employee-view directory projection omits personal/official contact fields. The existing contact RPC requires `employees.manage`; employee visibility requires a WS02 contract. |
| E37-04 | See designation and reporting relationships | Partial: designation and team are available. Reporting-line fields are absent from the current directory contract. |
| E37-05 | Keep sensitive data hidden | Implemented, not certified; private fields are omitted from the tenant directory projection and browser evidence in run `39025622956` at `01b20934a9a63e0f220eb30c9a65d55daf4010b4`. Current-page CSV exports only Employee, Employee number, Department, Designation, Team, and Employment status. |

## Story-to-source and prior evidence map

| Story IDs | Source file | Focused contract test | Prior disposable evidence |
| --- | --- | --- | --- |
| E02-01, E02-08 | `src/live/LiveHrisWorkspace.tsx` | `tests/contracts/employee-dashboard-profile-contact.test.mjs` | Run `39371994771`, source commit `6ff29e898aef54c2779e44cfdd5e465c79e6c11` |
| E02-03, E02-17 | `src/live/ProfileChangeRequests.tsx` | `tests/contracts/profile-change-requests.test.mjs` | Run `39147470480`, source commit `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5` |
| E02-12 (skills) | `src/live/MyLearning.tsx` | `tests/contracts/learning-self-service.test.mjs` | Run `39371994771`, source commit `6ff29e898aef54c2779e44cfdd5e465c79e6c11` |
| E03-01, E03-04, E03-05, E03-07, E03-08 | `src/live/EmployeeDocumentVault.tsx` | `tests/contracts/employee-document-self-service.test.mjs`, `tests/contracts/employee-documents-tenant-read.test.mjs` | Current exact-head run `39397073988`, job `118542325565`, commit `4a7656325b9e8cc3a99e47535d937dc7ff1feba9`; prior story overlay run `39018685182` |
| E04-01, E04-02, E04-03, E04-04 | `src/live/EmployeeIdentityCard.tsx` | `tests/contracts/employee-identity-card.test.mjs` | Current exact-head run `39397073988`, job `118542325565`, commit `4a7656325b9e8cc3a99e47535d937dc7ff1feba9` |
| E37-01 through E37-05 | `src/live/OrganizationEmployeeDirectory.tsx` | `tests/contracts/employee-directory.test.mjs`, `tests/contracts/employee-directory-story-reconciliation.test.mjs` | Current exact-head run `39397073988`, job `118542325565`; exact runtime markers cover E37-01/02; prior directory privacy browser run `39025622956` |

Blocked and partial IDs have no safe employee-write or projection contract beyond the gates described in the checklist. The focused tests above are also included in the full contract run for the WS06 checkpoint below.

## WS02 employee self-write reconciliation (read-only)

WS02's latest evidence report at PR #39 head `4282085312e1963e1fc90082677bbb89e43d35d1` supersedes the earlier catalog-only summary. It records exact hosted function definitions and allowlists, but also finds a source-parity failure: none of the 100 SQL migrations at development head `b262cade4175fc98cac56af05f88c3d16e68dc53` defines these three routines. The hosted definitions are therefore not in the reviewed source/test harness. Runs `39378140222`, `39395475832`, and `39397073988` do not call them; aggregate Auth/RLS totals are not evidence for E02 self-writes.

- `employee_update_my_profile(p_payload jsonb) RETURNS uuid` is SECURITY DEFINER, executable by authenticated/service_role and not anon. It uses `is_live_session()` and `employee_for_auth_user()` to bind the caller to their own active, non-resigned/non-terminated employee via an active admin_users row under tenant slug `synesis-it`. It accepts no employee or tenant target and does not check tenant_memberships. Its documented writable keys are `preferred_name`, `phone`, `gender`, `date_of_birth`, `address`, `mailing_address`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relation`, `father_name`, `mother_name`, `birthplace`, `blood_group`, `religion`, `nationality`, `marital_status`, and `personal_email`. Extra keys do not update protected columns; audit detail contains field names, not values. This is the hosted capability behind E02-02 and the profile/contact/emergency fields in E02-04/E02-06; there is no separate self-contact or self-emergency RPC.
- `employee_save_my_addresses_v2(p_rows jsonb) RETURNS integer` is SECURITY DEFINER with the same identity/default-tenant guard and grants. It accepts up to 100 rows with only `id`, `address_type`, `district`, `thana`, `post_code`, `city_village`, and `road_block_house`. Foreign row IDs are rejected with 42501; unknown keys, duplicate IDs, invalid values, or omitting an existing row are rejected with 22023.
- `employee_save_my_family_members_v2(p_rows jsonb) RETURNS integer` has the same identity/default-tenant guard and grants. It accepts up to 100 rows with only `id`, `name`, `phone`, `nid_number`, `date_of_birth`, `relationship`, `present_address`, `permanent_address`, `is_nominee`, `working_in_synesis`, `occupation`, `academic_qualification`, `blood_group`, and `gender`. Foreign row IDs are rejected with 42501; invalid/unknown/duplicate/omitted-row cases are rejected with 22023.

These signatures do not allow a caller to select another employee, but their fixed `synesis-it` identity context is not the generic active-tenant/membership contract used by other Employee APIs. The user-facing child tables grant no direct authenticated INSERT/UPDATE/DELETE; the RPCs are the only reported write path. Production child-table reads remain a separate concern: the address/family admin policies lack parent-employee tenant predicates, authenticated ACLs include SELECT plus TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, and production has only one active tenant for hosted cross-tenant proof. WS02's PR #39 report contains proposal-only remediation; no production change was requested or made.

## Latest WS06 checkpoint verification

- PR #42 remains open and draft at head `4a7656325b9e8cc3a99e47535d937dc7ff1feba9`. The live target `development/hris-checkpoints` is `b262cade4175fc98cac56af05f88c3d16e68dc53`; GitHub compare reports the WS06 branch 7 commits ahead and 3 behind, with merge base `1714a08e24f47999618b0127fc818a3d19eb187a`. The diff contains only the six WS06 workflow/evidence/contract files and has no application or shared-shell paths.
- On a clean detached worktree at the exact PR head, the scoped command covering employee profile/contact projection, profile change, learning/skills, document, document tenant read, identity card, directory, directory reconciliation, family privacy, and ownership contracts passed **48/48**. `git diff --check` is rerun after this evidence update.
- Exact-head disposable Auth/Postgres/browser run [39397073988](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39397073988), job `118542325565`, completed **PASS**. Its log reports 378/378 local Auth/RLS checks and 26/26 Phase 04 parity checks, then stopped only the disposable stack. It is not hosted acceptance.
- Exact story evidence in that job: E02-01 self-profile and E02-08 employment reads passed own-employee and cross-tenant checks; E03 metadata reads denied mismatched tenant, foreign employee, manager, and anonymous access; rejected correction reasons are exposed only on rejected records; employee document browser reads, recovers, downloads, localizes, and adapts responsively. E04-01 through E04-04 have exact runtime PASS records for employee number, card open/retry/close, designation/department, and active status. E04-05 remains partial: inactive/terminated states work, but no approved expiry rule exists. E37-01 search and E37-02 department/team filtering have current-head runtime PASS; location remains outside the approved projection. E37-03/04 remain partial and E37-05 is privacy-protected in source/contract evidence; they are not promoted to certification.
- Exact-head build/browser run [39397073999](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39397073999) passed TypeScript, full contracts, and production bundle build, then failed only at `Verify the branch-served Pages entry matches the production build`; Chromium/browser steps were skipped. Build output was `app-C4oUgMGJ.js` / `app-GpVcVTBs.css`, while unchanged `index.html` blob `d037342b643bae45f4adb040ec7e0c8d022e4d3a` references `app-2l-hdvDU.js` / `app-BWuIahKW.css`. WS06 changed no `index.html`, generated app asset, or app source. This is routed to WS01/WS05 to determine the approved source/repair path; the failure remains visible.
- WS02's current PR #39 report records exact hosted self-write definitions/allowlists but marks source parity FAIL and the corresponding disposable write tests NOT RUN. These findings are captured above; E02-02/E02-04..07 remain not certified. No hosted Employee role/tenant certification is claimed.

## Live base branch advance after the WS06 checkpoint

- Direct GitHub branch/ref lookup and `git ls-remote` verified that `development/hris-checkpoints` advanced to `f02ae03da438c88fc796163be7dc0880826b54e3` at 2026-10-20 08:51 UTC. It moved from `1714a08e24f47999618b0127fc818a3d19eb187a` through `ecdd61c7cb22596e091f938ff00ce5cd0d0e110a` and `f02ae03da438c88fc796163be7dc0880826b54e3`.
- WS06 head at this recheck remained `3384a77750c92499d9ea8e5069cda33e7f5d0683`, with merge-base `1714a08e24f47999618b0127fc818a3d19eb187a`. Diffing the live base against WS06 head still lists only the six WS06 workflow/evidence/contract files; there are no changed-path overlaps. No HR01 file was edited by WS06.
- The base advance changes `src/live/OrganizationEmployeeDirectory.tsx` only to show a fail-closed unavailable message when manager contact RPCs return `PGRST202`; its added browser/Auth evidence covers the manager contact flow. This is WS01-owned HR01 contact behavior, not an employee-self contact contract and not an E37-03 self-contact grant.
- Current base checks at 2026-10-20 08:56 UTC: runner probe `39396457633` **PASS**; Phase 2A tenant-provisioning Auth/RLS/browser run `39396457535` **PASS**; disposable Auth/Postgres/browser run `39396457586` **in progress**. The WS06 exact-head runs above are separate and do not include the later base commits.

## Implementation decision and required handoff

No profile, address, contact, family, document, migration, RLS, or shared-shell source was rewritten. The current solved Employee UI remains intact. E02-02/E02-04..07 remain blocked from changes/certification because the hosted behavior is not represented in tracked migrations and the isolated runner does not execute those routines; E02-04/E02-06 are covered by fields in the profile RPC, not absent functionality. Direct table DML is not an approved substitute.

WS02 follow-up: the exact hosted definitions, allowlists, grants, and reported validation rules are now recorded in PR #39; the remaining action is to restore the reviewed source/provenance in the development migration tree, confirm whether the default `synesis-it`/no-membership lifecycle is an approved contract, and run the report's synthetic own-row, protected-key, unlinked/foreign-ID, invalid-payload, inactive-membership, and direct-DML denial cases. The hosted family/address admin-read tenant policy and excess ACLs remain WS02-owned. No production write, schema/grant change, migration replay, or user change is requested.

Until source parity/tests and the document-reminder, location, reporting-line, and expiry policies are resolved, the remaining assigned gaps stay blocked or partial. No hosted production certification is claimed. The Pages asset-parity failure is a visible CI blocker for WS01/WS05; no shared shell or served asset was changed by WS06.
