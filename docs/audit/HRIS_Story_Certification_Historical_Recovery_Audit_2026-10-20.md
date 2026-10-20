# Synesis HRIS 360° Story Certification and Historical Recovery Audit

**Audit snapshot:** 20 October 2026, after live refresh of branch/PR heads and exact-head Actions runs  
**Repositories:** [HRIS-v2](https://github.com/shihab-tech04/HRIS-v2) · [HRIS-Candidate-v2](https://github.com/shihab-tech04/HRIS-Candidate-v2)  
**Approved Figma source:** [XEXLe9J1oATlITS9I5u1P9](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)  
**Audit PR:** [HRIS-v2 PR #40](https://github.com/shihab-tech04/HRIS-v2/pull/40) — docs-only, kept draft.  
**Scope:** story evidence, history and release-state reconciliation. No product code, approved UI, production SQL/data, main branch, backup, merge or deployment was changed by this audit.

## Latest exact-head refresh

The current 1,047-ID ledger is **0 CERTIFIED · 105 IMPLEMENTED_NOT_CERTIFIED · 16 PARTIAL · 0 NOT_STARTED · 926 BLOCKED**. The blocked rows comprise 23 named product-contract gaps, five Candidate verification/retest blocks (four retests still required after the CVBuilder change and one known prior-head CA11-04 failure), and 898 remaining story-ID traceability gaps. The historical 82 verified aggregate remains separate because its story-ID membership is not recorded; it is not added to the current ledger.

- Main `development/hris-checkpoints` currently points to docs-only commit [`fe83696`](https://github.com/shihab-tech04/HRIS-v2/commit/fe83696d8bc142b3c3f7cc28962062d82d1e1745). Its application source is the `4cc2661` candidate-activation fix; the exact full suite [39420943283](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39420943283) at `4cc2661` passed 348/348 contracts, 56/56 browser regressions, 384/384 isolated Auth/RLS assertions, Phase 04 parity 26/26, build, and disposable security review. The direct `HR01-01_PARTIAL_CANDIDATE_ACTIVATION_BROWSER_PASS` covers a verified accepted-offer/submitted-packet path only. The later suite [39422238862](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39422238862) at exact test commit `4cebe84` passed 349/349 contracts with the same 56/56 browser, 384/384 Auth/RLS, Phase 04 26/26, build, and security checks. The only commit after `4cebe84` is `fe83696`, which restores `docs/programme/MASTER_PHASE_LEDGER.md`; no app/test paths changed. Thus `fe83696` has no workflow bound to its docs commit, while the app and test tree is unchanged from the passing `4cebe84`. HR01-01 is **PARTIAL**, not blocked or certified: general manual employee creation and hosted acceptance remain unverified. The forward migration `20261020121500_hris_candidate_activation_employee_id.sql` remains development-only; production migration head is `20261020044145`.
- Candidate PR #6 is now `530c2de1ca12665051a3c617f593df1edba2d11b`. The latest completed run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) ran at exact PR head `9c61a3c1a83ea0b2b2b13063c1adef7fcecd25d4`: CA10 emitted 5/5, CA12 4/4 and CA13 5/5 story markers, then CA11-04 failed because extracted PDF text did not contain the selected profile data. This run checked out Main `3f6ea22`, which is behind current Main `4cc2661`. The CVBuilder source change at `d410cf1` preceded this run. Current PR head `530c2de` is five commits ahead of `9c61a3c`; the latest `c2117b7` → `530c2de` commit changes only the application/interview test locator; the diff changes `InterviewsPage.tsx` and later application/interview test paths, not the CA10 parser/CVBuilder or saved-job/alert source paths. No workflow/status result exists at `530c2de`. CA10-01…05 are IMPLEMENTED_NOT_CERTIFIED based on direct behavior at `9c61a3c`, with hosted/Figma gates still open. CA11-04 remains blocked by the known failure; CA11-01/02/03/05 require post-change direct markers. The earlier full pass [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) at `04f1054` predates the source change.
- WS08 PR #44 is an independent screen audit at evidence head `d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db`. Its final [route audit report](https://github.com/shihab-tech04/HRIS-v2/blob/d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db/docs/evidence/ws08-management-figma-parity-audit-20261020.md) records the fetched Main tip `4cc2661`, PR API base `1714a08`, and a clean read-only merge-tree result for those recorded inputs. Main later advanced through tested `4cebe84` to docs-only `fe83696`; no new merge-tree result against `fe83696` is claimed. The 239-row WS08 register (M90/H44/A24/C24/SA57) remains 232 BLOCKED, seven IMPLEMENTED_NOT_CERTIFIED, and zero verified/certified. All M01–M03 remain blocked. The separate [Main/Candidate route parity audit](https://github.com/shihab-tech04/HRIS-v2/pull/45) carries screen evidence and is not added to this story ledger.

No story was certified by either passing test markers or a screen-level semantic match. WS05 remains the release controller; this refresh authorizes no merge or deployment.

## Executive result

The canonical register contains **1,047 unique user stories across 153 modules and 22 operational phases**. The recovered immutable story matrix has 0 validation anomalies. The current audit ledger classifies every canonical ID:

| Classification | Count | Meaning |
|---|---:|---|
| CERTIFIED | **0** | No story has an independent story-ID chain through implementation, exact test, approved design correspondence and hosted acceptance. |
| IMPLEMENTED_NOT_CERTIFIED | **105** | Exact story IDs have implementation evidence on Main/Candidate/open branches; isolated and browser behavior is linked per ID. Hosted certification remains open. |
| PARTIAL | **16** | A mapped, tested slice exists, while the full story contract or acceptance scope remains open. |
| NOT_STARTED | **0** | The reviewed material cannot prove absence, so no story is labeled not started. |
| BLOCKED | **926** | 23 product-contract blockers, five Candidate verification/retest blocks (four current-head retests and one known prior-head failure), and 898 remaining ID-level traceability gaps. A traceability block is not evidence of absent functionality. |
| **Total** | **1,047** | Every canonical ID appears once. |

The level columns added to the 1,047-row CSV separately record implementation, test, and hosted certification status. The latest Main run adds exact-ID behavior evidence but no certification: hosted role/tenant acceptance and approved Figma mapping remain separate gates. No aggregate assertion count, checkpoint owner assignment, proposed contract, or audit-only test is treated as a certified story.

## Canonical source and counting rules

- The recovered source is **HRIS Feature → User Story Master Inventory — v1**, reconstructed from 1,855 source lines. Original inventory SHA-256: `d68449755a0ad821921f566d9cb3a3183ddfe6c194e1ffc8e08346a71cf7d5be`.
- The immutable matrix is [`CANONICAL_USER_STORY_MATRIX.json`](https://github.com/shihab-tech04/HRIS-v2/blob/development/hris-checkpoints/docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json), SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. It has 1,047 unique IDs, 153 modules, and 0 validation anomalies. The matrix's status fields remain `NOT TESTED`; the operational phase map assigns each module once.
- Role totals are Employee 362, Manager 90, HOD 44, HR 252, Admin 24, CEO 24, Super Admin 57, Candidate 137, Cross-system 57.
- The ledger adds four audit fields: `implementation_level`, `test_level`, `hosted_certification_level`, and `unblock_action`. It retains the canonical verbatim requirement, module, role, phase and source-line provenance.
- **CERTIFIED** requires independently traceable canonical ID → source component/API/data path → exact-ID test pass at the candidate SHA → approved Figma node/visual check (or accepted no-screen rationale) → hosted acceptance with intended roles and tenant boundaries. A run can support one story only when the ID and behavior are directly evidenced.
- `BLOCKED`/traceability rows mean the audit did not locate direct evidence for that ID or that the current exact-head evidence failed. They do not assert that the feature is absent. All 898 remaining trace rows have a per-ID next action in the ledger. `NOT_STARTED` is reserved for direct evidence of no work, which was not available for any row.

## Historical 82, prior 39 and new evidence reconciliation

The 17 October checkpoint reports **82 VERIFIED**, 13 partial, 13 blocked, 0 broken within the tested scope and 939 not yet classified. The 82 is a story aggregate, **not 82 test runs or assertions**. `verified_story_id_membership` is `NOT_RECORDED`, so its overlap with the later exact IDs is unknown.

The source-linked overlay at the live Main development checkpoint records **39 distinct individually evidenced IDs**; the frozen Main RC #38 overlay recorded 38, with HR01-04 added on Main development after the freeze. The 39 prior IDs are retained exactly once. The refreshed ledger adds **20 further direct story IDs** from open, unmerged branches:

| Added direct story evidence | Exact IDs | Source | Exact-head test evidence | Result |
|---|---|---|---|---|
| Employee employment information | E02-09 | HRIS PR #35, `11d3ecd99f40da416caf32e73bee76554fd152dd` | `tests/sql/employment-info/verify.sql`; `tests/browser/employee-attendance.spec.ts`; runs [38929115130](https://github.com/shihab-tech04/HRIS-v2/actions/runs/38929115130) and [38929115082](https://github.com/shihab-tech04/HRIS-v2/actions/runs/38929115082), both success | Implemented, not certified; branch is not in main/#38. |
| CV parsing and review | CA10-01…CA10-05 | Candidate PR #6, current head `530c2de1ca12665051a3c617f593df1edba2d11b` | Run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) at exact PR head `9c61a3c` emitted CA10 5/5 after the `d410cf1` CVBuilder source change. Current `530c2de` has no workflow/status result, but the compared delta does not touch the CA10 parser/CVBuilder source path or CA10 steps. | Five IDs are IMPLEMENTED_NOT_CERTIFIED from direct disposable behavior; hosted role/tenant and approved Figma evidence remain open. |
| CV builder | CA11-01…CA11-05 | Candidate PR #6, current head `530c2de1ca12665051a3c617f593df1edba2d11b` | Prior full CA11 pass [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) at `04f1054` predates the `d410cf1` source change. Latest run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) at exact predecessor `9c61a3c` fails CA11-04; the other four CA11 rows were not reached. Current head `530c2de` has no workflow/status result. | All five remain BLOCKED: CA11-04 has a known failure at `9c61a3c`; CA11-01/02/03/05 need direct post-change markers. No CA11 story is certified. |
| Saved Jobs | CA12-01…CA12-04 | Candidate PR #6, current head `530c2de1ca12665051a3c617f593df1edba2d11b` | Run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) at exact PR head `9c61a3c` emitted CA12 4/4; current diff does not touch saved-job source/test paths. | Direct source/test evidence at `9c61a3c` remains IMPLEMENTED_NOT_CERTIFIED; hosted acceptance and Figma/no-screen evidence are separate gates. |
| Job Alerts | CA13-01…CA13-05 | Candidate PR #6, current head `530c2de1ca12665051a3c617f593df1edba2d11b` | Run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) at exact PR head `9c61a3c` emitted CA13 5/5; current diff does not touch alert source/test paths. | Direct source/test evidence at `9c61a3c` remains IMPLEMENTED_NOT_CERTIFIED; hosted acceptance and Figma/no-screen evidence are separate gates. |
Before the latest Main suite, the ledger contained 54 IMPLEMENTED_NOT_CERTIFIED IDs from 39 prior exact IDs plus 20 distinct IDs with duplicate-safe exclusions for CA11-04 and CA11-01/02/03/05. The new Main evidence adds 51 independently linked IDs and seven partial IDs; HR01-01 separately becomes PARTIAL. The current deduplicated totals are 105 IMPLEMENTED_NOT_CERTIFIED, 16 PARTIAL and 926 BLOCKED. The historical 82 remains separate and unadded: neither 82 + 39 nor 82 + 105 is a valid deduplicated total. Its ID overlap cannot be calculated until the original 82 IDs are recovered from existing saved artifacts. The historical 13 partial membership is also unknown and cannot be reconciled to the current 16 exact partial IDs.

The latest Main exact-source reconciliation uses run `39420943283` at `4cc2661` and full regression run `39422238862` at `4cebe84`. The current development branch tip `fe83696` is docs-only over the tested app/test tree. The new Main suite supplies **58 previously unmapped exact story IDs**: 51 move from traceability BLOCKED to IMPLEMENTED_NOT_CERTIFIED and seven to PARTIAL. HR01-01 separately moves from a current-head retest block to PARTIAL for the accepted-offer/submitted-packet activation path; manual employee creation and hosted acceptance remain open. The Candidate run `39419429848` at `9c61a3c` emitted CA10 5/5, CA12 4/4 and CA13 5/5 markers, then failed CA11-04; current Candidate head `530c2de` has no workflow/status result. CA10-01…05 therefore remain IMPLEMENTED_NOT_CERTIFIED; CA11-01/02/03/05 remain current-head retest blockers after the `d410cf1` CVBuilder change, while CA11-04 retains the known failure. The current 926 blocked rows comprise **23** product-contract gaps, **5** Candidate verification/retest blocks, and **898** remaining story-ID traceability gaps. The historical 82 aggregate and WS08 239-row register remain separate. No story was certified by the new test markers.

### New Main exact-ID behavior reconciliation

Runs [39420943283](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39420943283) at exact source commit `4cc2661` and [39422238862](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39422238862) at exact test commit `4cebe84` passed their isolated suites. I compared the story-tagged passing records in `tests/sql/isolated-auth/run-local.mjs` against each canonical ID rather than counting the aggregate 384 assertions as stories. The latest test run completed 349/349 contracts, 56/56 standalone browser regressions, 384/384 isolated Auth/RLS assertions, Phase 04 parity 26/26, build and disposable security checks. Main's application route files are unchanged after `4cc2661`; commit `4cebe84` changes docs/contracts/tests, and the later branch-tip commit `fe83696` changes only the master phase ledger.

| Main behavior family | Newly traced IDs | Result and boundary |
|---|---|---|
| Employee dashboard | E01-02/03/04/05/07/08 | Six IMPLEMENTED_NOT_CERTIFIED. E01-01/06/10 are PARTIAL. E01-09 remains traceability-blocked because no passing exact-ID behavior record was found. |
| Attendance and corrections | E05-01…05; E06-01/02/03/05/07/08/09 | Twelve IMPLEMENTED_NOT_CERTIFIED. E06-04/06 are PARTIAL because evidence and pending-edit/cancel policies remain unresolved. |
| Leave balances, requests and calendar | E07-01/02/03/04/08; E08-01…14/17/18; E09-01/02/04 | Twenty-four IMPLEMENTED_NOT_CERTIFIED. E08-15/16 remain contract-blocked; E09-03/05 remain untraced. |
| Timesheets | E15-01…09 | Nine IMPLEMENTED_NOT_CERTIFIED. E15-10/11 are PARTIAL: approval-lock scope is unresolved for non-project hours, and the current evidence returns tenant-scoped history data but does not directly test its rendered history UI. |

The 51 implemented IDs and seven partial IDs are distinct from the 54 earlier IMPLEMENTED_NOT_CERTIFIED IDs and eight earlier partial IDs; HR01-01 is an additional partial update. Every new row remains **not certified** because hosted role/tenant acceptance and approved Figma mapping or an accepted no-screen rationale remain open. The exact app route may pass locally while its design parity remains BLOCKED in the separate screen matrix.

### Prior 39 exact IDs retained once

| Evidence group | IDs | Count | Prior tested source/run |
|---|---|---:|---|
| Candidate application journey | CA14-01…CA14-12 | 12 | Candidate `e3cb9c1`; run 39025809497 |
| Employee documents and digital ID | E03-01/04/05/07/08; E04-01…04 | 9 | Main `426527f`; run 39018685182 |
| Employee profile-change requests | E02-03, E02-17 | 2 | Main `445feef`; run 39147470480 |
| Manager shift change/history and directory privacy | E13-04/05; E37-01/05 | 4 | Main `01b2093`; run 39025622956 |
| Tenant provisioning/optional modules | SA01-01…04; SA12-01…03 | 7 | Main `214ccbc`; run 39203699646 |
| Employee information and skill profile | E02-01, E02-08, E02-12 | 3 | Main `6ff29e8`; run 39371994771 |
| HR workforce search/status visibility | HR01-03, HR01-04 | 2 | Main `81eb677`, run 39373694520; `d22de67`, run 39377300851 |
| **Total prior exact IDs** |  | **39** | Source/disposable evidence only. |

### Current partial IDs

- `E01-01`: the employee dashboard renders the persisted current attendance status and work mode; the broader late/absent/remote story is not fully established.
- `E01-06`: confirmed upcoming training and appraisal deadlines are covered; interviews and company events remain open.
- `E01-10`: tenant-linked dashboard identity and inactive/terminated card states are covered; the complete permission/employment-state contract is open.
- `E04-05`: active/employment information exists; approved expiry semantics and transition coverage remain open.
- `E06-04`: an evidence-path field exists, but no approved rule says when correction evidence is required.
- `E06-06`: cancel closes an unsent form; pending-request edit/cancel policy remains undefined.
- `E15-10`: submitted and project-reviewed timesheets are protected, but non-project hours remain submitted because approval authority is undefined.
- `E15-11`: a tenant-scoped context RPC returns linked employee timesheet rows, but rendered historical-timesheet UI behavior was not directly tested.
- `E37-02`, `E37-03`, `E37-04`: location normalization, contact visibility and reporting-line source/behavior remain unresolved.
- `HR01-01`: verified accepted-offer/submitted-packet activation creates a tenant employee with generated ID, linked Auth identity, hired stage, verified handoff, one audit event and safe retry. A general manual HR create flow and hosted acceptance remain unverified.
- `HR01-02`: current HR directory editing covers nine allowlisted contact fields only. Hosted contact RPCs are absent at migration head `20261020044145`. Exact-head disposable run [39395048458](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39395048458) passed its story-level contract guard and related browser checks; no hosted pass is claimed.
- `HR01-06`: limited redacted audit evidence for supported contact/profile-request changes; full sensitive-data inventory and hosted behavior remain open.
- `HR01-07`: safe current-page export with six non-contact columns is covered; bulk write/import scope is not.
- `HR01-08`: tenant-unique employee number/email constraints are covered; duplicate-person matching and create-flow warning behavior are not.

### Explicit contract blockers (23 IDs)

- Historical 13 preserved: `E03-02`, `E03-03`, `E03-06`; `E07-05..07`; `E08-15..16`; `E12-06..09`; `E35-04`.
- WS06 employee self-write/API contract gaps: `E02-02`, `E02-04`, `E02-05`, `E02-06`, `E02-07`.
- WS07 legal-entity contract gap: `HR03-01`.
- WS08 master-data contract gaps: `SA06-01..04`.

WS06/#42, WS07/#43 and WS08/#44 provide ownership, requirements, contract proposals/readiness guards and blocker evidence. Those PRs add **no product functionality**. Their assertions are audit tests; they do not change these stories to implemented.

## Live repository and release state

| Repository/ref | Live head | State and consequence |
|---|---|---|
| HRIS `main` | `cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7` | Production branch remains behind development; no changes from this audit. |
| HRIS `development/hris-checkpoints` | `fe83696d8bc142b3c3f7cc28962062d82d1e1745` (docs-only tip; application source `4cc2661`) | Run [39420943283](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39420943283) at exact code commit `4cc2661` passed 348/348 contracts, 56/56 browser regressions, 384/384 isolated Auth/RLS, Phase 04 parity 26/26, build and security review. Run [39422238862](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39422238862) at exact test commit `4cebe84` passed 349/349 contracts and the same browser/Auth/RLS/Phase04/build/security checks. `4cebe84` and `fe83696` add no application source after `4cc2661`; `fe83696` changes only `docs/programme/MASTER_PHASE_LEDGER.md`. HR01-01 is PARTIAL on the exact candidate-activation path; production migration head remains `20261020044145`, and hosted RPC parity remains open. |
| Main frozen RC PR #38 | `686eec7016ec831e9b679500f28f553b8f93b14f` | Draft/HOLD; 516 commits ahead of main, 651 changed files. Current development is 10 commits ahead. |
| HRIS PR #35 (E02-09) | `11d3ecd99f40da416caf32e73bee76554fd152dd` | Open, non-draft, unmerged feature branch. Tests pass, but E02-09 is absent from main and RC #38. |
| HRIS WS05 control PR #41 | `1c7a8e5436c583ce18fd834647ebaa1605e8be1e` | Draft release ledger; refresh with Main source `4cc2661`, passing exact-source/full regression runs `39420943283`/`39422238862`, current docs-only dev tip `fe83696`, and HR01-01 PARTIAL (not in frozen RC #38 or production). Candidate PR #6 `530c2de` still has no checks and retains CA11-04 failure at `9c61a3c`; WS08 PR #44 remains a separate `d6b00e5` snapshot. Production remains at migration head `20261020044145`; database snapshot/restore proof and hosted acceptance remain open. WS05 remains the exclusive release controller. |
| Candidate `main` | `38174c7b607999f951c7eea47aefaa443735080e` | Production branch; unchanged by audit. |
| Candidate development and frozen PR #5 RC | `e3cb9c178cbfb66eb611c640f885a13581b50f51` | Draft/HOLD, 95 commits ahead of main. Candidate deployment remains public-only gated. |
| Candidate PR #6 | `530c2de1ca12665051a3c617f593df1edba2d11b` | Open draft; latest completed run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) at predecessor `9c61a3c` emitted CA10 5/5, CA12 4/4 and CA13 5/5, then failed CA11-04. Current `530c2de` has no workflow/status result; its diff contains an InterviewsPage source change and later application/interview test edits, not the CA10 parser/CVBuilder or CA12/13 source paths. Prior full CA11 pass [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) at `04f1054` predates the CVBuilder change. No hosted Candidate acceptance. |

### Eight workstation checkpoint recheck

| WS | Live checkpoint | Reverified result | Required follow-up |
|---|---|---|---|
| WS01 | Main development app source `4cc2661`; latest branch tip `fe83696` | Runs 39420943283 at `4cc2661` and 39422238862 at `4cebe84` pass the scoped activation and full disposable suites. HR01-01 is PARTIAL only for verified accepted-offer/submitted-packet activation; current test/source tree remains unchanged by the later docs-only `fe83696`. No general manual employee-create or hosted acceptance is established. | Keep HR01-01 PARTIAL; clarify/test any general manual-create contract and complete hosted role/tenant acceptance at a WS05-approved release SHA. |
| WS02 | HRIS PR #39 `c92838b` | One signed-in production Super Admin read-only session; tenant/departments reads, employee RLS filtering, recruiter denial and unlinked self-service denial. Result **PARTIAL / NOT ACCEPTED**. Only one active tenant; no independent HR/Admin or employee session; production cross-tenant and anonymous HTTP rejection not established; seven Candidate/interview RPCs absent; offer issuance untested. | WS02/WS05 close exact hosted gates with authorized identities and deployed API parity. No story IDs certified by the current one-session check. |
| WS03 | HRIS PR #37 `a14a1f9` | Draft migration-recovery evidence. Two migrations are already in production; hosted records are at `20261020044145`; prior checks report 26/26 schema/API parity, 20/20 security, 9/9 anon/sessionless DB-role denial. No migration replay was performed in this audit; no signed-in hosted journey is claimed. | Keep production migration history unchanged; close signed-in API and application acceptance through WS02/WS05. |
| WS04 | HRIS PR #40 audit branch | Docs-only PR #40 carries the refreshed 1,047-ID ledger and unblock matrix. A separate docs-only route/Figma parity PR #45 reports 4 geometry PASS, 1 token FAIL, and 56 route/frame BLOCKED; it does not add screen rows to story totals. | Review the separate evidence tracks; no product or release action. |
| WS05 | HRIS PR #38 `686eec7`; control PR #41 `1c7a8e5`; Candidate PR #5 `e3cb9c1` | Main code `4cc2661` passed runs 39420943283 and 39422238862; branch tip `fe83696` is docs-only after the tested tree. HR01-01 remains PARTIAL and is not in frozen RC #38. Candidate PR #6 `530c2de` has no workflow/status result; run `39419429848` at `9c61a3c` failed CA11-04 after CA10/12/13 markers. Candidate production remains public-only. Hosted role/tenant acceptance and database snapshot/restore proof remain missing. | WS05 alone decides branch reconciliation, backup/recovery acceptance, merge and deployment. Preserve sole Super Admin and production migration head. |
| WS06 | HRIS PR #42 `340fb92` | Audit-only Employee Phase 05 report: 16 implemented/4 partial/16 blocked within its 36-ID scope; these rows overlap existing story entries. The earlier browser build smoke remains blocked by Pages asset parity. | Keep its audit scope separate; confirm employee-frame mappings only after an independent employee identity and current route proof are available. |
| WS07 | HRIS PR #43 `779c813` | Audit-only HR ownership and HR03 proposal; nine HR03 IDs. Readiness guards pass, while proposed isolation tests are not executed and HR03-01 has no approved/deployed legal-entity contract. | Confirm attendance/leave management route ownership and approved fields with WS01; retain the HR03 contract blocker. |
| WS08 | HRIS PR #44 `d6b00e5` | Audit-only route/Figma report and SA06 contract review. Register: M90/H44/A24/C24/SA57; 232 blocked, seven implemented-not-certified, none verified/certified. Lint and 33/33 focused contracts pass; eight browser cases stop before launch because Chromium is missing; no fresh responsive route proof. | Keep all M01–M03 blocked. M03 Team Leave is next route audit candidate; route/frame mappings are semantic only. |

The WS08 PR #44 API base is `1714a08`, while its final report records fetched remote target `development/hris-checkpoints` at `4cc2661` and a clean read-only merge-tree result for those exact inputs. Main later advanced through `4cebe84` to docs-only tip `fe83696`; this audit does not claim a merge-tree result against the later tip. The base/target discrepancy remains explicit, and no rebase or merge is claimed. The audited Manager route source and three browser specs are unchanged; the checked paths had only an unrelated Bengali contact-edit fallback translation change. Eight focused WS08 Playwright cases did not launch because Chromium was missing. Main’s separate full suite now provides responsive synthetic-role route behavior for the dashboard Team Report and attendance-correction form, plus manager leave review, but it does not supply approved matched Figma captures or populate mobile Figma frames. See [the final WS08 report](https://github.com/shihab-tech04/HRIS-v2/blob/d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db/docs/evidence/ws08-management-figma-parity-audit-20261020.md). PR #41 remains the release controller; WS04 does not take release control.

### Missing from current production/release candidates

- Main `main` does not contain key integrated development paths such as `src/live/EmployeeDocumentVault.tsx`, `EmployeeIdentityCard.tsx`, `ProfileChangeRequests.tsx`, `MyEmployeeRoster.tsx`, `OrganizationEmployeeDirectory.tsx`, `MyLearning.tsx`, `LearningRequests.tsx`, and `PlatformTenantWorkspace.tsx`. Most are present in held RC #38, not in production.
- E02-09 employment-information implementation/test evidence is only on open PR #35; it is not in Main main or frozen RC #38.
- The current development contact-RPC fail-closed behavior in `src/live/OrganizationEmployeeDirectory.tsx` and localized messages in `src/live/project-locale.ts` are not in frozen RC #38. The current exact-head disposable run 39395048458 passes; hosted RPC parity remains unverified.
- Candidate CA10 browser parser/review functionality and exact CA10/CA11 story coverage are on open PR #6, not Candidate main, development or frozen RC #5. The base Candidate release already has a basic CV Builder; this audit does not claim that all CA11 product code is absent from #5.
- The latest completed Candidate PR #6 run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) at exact head `9c61a3c` passed direct CA10 5/5, CA12 4/4 and CA13 5/5 markers, then failed CA11-04 because extracted PDF text did not contain the selected profile data. The CVBuilder change at `d410cf1` preceded that run. Current head `530c2de` has no workflow/status result; its intervening diff changes `InterviewsPage.tsx` and later application/interview test paths, not CA10 parser/CVBuilder or CA12/13 source paths. The prior full CA11 pass [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) at `04f1054` predates the CVBuilder change. WS03 should resolve the PDF failure and rerun the remaining affected story behavior at a current approved head.

## Production and recovery boundaries

The live read-only checkpoints continue to report production migration head **`20261020044145`** with 116 migration-history rows. This audit did not query or write production business rows, did not run migrations, and did not alter schema, roles, Auth identities, tenant membership, settings or deployment. Sole Super Admin and the existing release backups were left untouched. WS05’s current PR #41 records verified source-bundle readback hashes but also states that database snapshot/restore proof is missing; a source-bundle hash is not database recovery proof.

No separate Mac desktop transcript or uncommitted Mac filesystem was available to inspect. The evidence proves that substantial source, tests, docs and backups survive in GitHub/development/open branches; it does **not** prove every four-day Mac edit was saved. In particular, PR #35 and PR #6 contain distinct unmerged work, and the release candidates do not include those branches.

## Figma correspondence

The approved file was inspected read-only. It exposes one page (`Page 1`, node `0:1`) and has no canonical story-ID links. Reviewed references include Employee profile/contact frames `66:72042`, `139:40250`, `139:40294`, employee card `66:51454`, attendance `66:43832`, node `86:36267` (Upload Resume/CV label inside Employee Referral Form `86:36224`) and `New Application` frame `265:48972` (Employee Self Service). WS08 separately reviewed Managerial Dashboard `9:22640`/filtered state `9:23429`, Attendance Information/Requests `17:28320` and related states, and Leave Requests `17:31769` and related states. Those remain semantic candidates without canonical story links. Current Main source tests now exercise synthetic role/state behavior and responsive browser flows for selected employee and manager paths, but no approved story-to-frame links, hosted source build mapping, or matched Figma/mobile captures exist; M01–M03 remain blocked. The [separate route parity audit](https://github.com/shihab-tech04/HRIS-v2/pull/45) records shell geometry PASS, primary-color FAIL, and route/frame BLOCKED findings. No exact CA10 parser/review, CA11 Candidate CV Builder, HR03 legal-entity or SA06 master-data story mapping was found.

## Phase-by-phase completion

Status totals are derived from the updated 1,047-row CSV. Each story appears in its primary operational phase. Cross-cutting phases 00–02, 18, 20 and 21 have no exclusive story modules; they are included as zero-story process rows and do not change the 1,047 total.

| Phase | Scope | Modules | Stories | Implemented, not certified | Partial | Blocked | Certified | Not started | Notes |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 00 | Source inventory and scope | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting inventory and scope; no exclusive module assignment. |
| 01 | Source integration | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting source integration; no exclusive module assignment. |
| 02 | Design foundation | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting design foundation; no exclusive module assignment. |
| 03 | Tenant platform | 2 | 7 | 7 | 0 | 0 | 0 | 0 | Seven exact IDs have disposable tenant/module evidence; hosted tenant API acceptance remains open. |
| 04 | Auth, permissions and RLS | 6 | 32 | 0 | 0 | 32 | 0 | 0 | 32 stories; no story-level hosted role/two-tenant acceptance linked. |
| 05 | People and org | 7 | 57 | 19 | 9 | 29 | 0 | 0 | 19 exact implementations (18 in current Main checkpoint plus E02-09 on open PR #35), nine partial, 13 contract blockers and 16 traceability gaps. HR01-01 is PARTIAL only for exact accepted-offer/submitted-packet activation at Main `4cc2661`; a general manual-create flow and hosted acceptance remain open. |
| 06 | Recruiting and Candidate | 33 | 226 | 26 | 0 | 200 | 0 | 0 | 26 exact Candidate IDs are implemented-not-certified: CA10-01…05 now have direct 5/5 behavior markers at `9c61a3c`, plus CA12-01…04, CA13-01…05 and CA14-01…12. CA11-04 retains the known PDF assertion failure at `9c61a3c`; CA11-01/02/03/05 need post-`d410cf1` markers. Current PR #6 head `530c2de` has no workflow/status result. No Candidate story is hosted-certified. |
| 07 | Onboarding and conversion | 6 | 46 | 0 | 0 | 46 | 0 | 0 | No exact story-level implementation evidence located. |
| 08 | Attendance and time | 16 | 115 | 23 | 4 | 88 | 0 | 0 | Direct Main suite evidence now covers employee check-in/out, daily/monthly attendance, correction selection/submission/status/reason/approved update, and timesheet create/submit/correction/status paths. E06-04/06 and E15-10/11 remain partial; Candidate and contract blockers remain distinct. |
| 09 | Leave and absence | 8 | 65 | 24 | 0 | 41 | 0 | 0 | Exact Main suite markers cover employee leave types/balances, requests, half-day/rules, duplicate handling, private evidence, manager review, calendar dates and privacy. Five contract blockers (E07-05..07 and E08-15/16) remain; other rows are separately traceability-blocked. |
| 10 | Projects and allocation | 2 | 8 | 0 | 0 | 8 | 0 | 0 | No exact story-level implementation evidence located. |
| 11 | Performance | 15 | 105 | 0 | 0 | 105 | 0 | 0 | No exact story-level implementation evidence located. |
| 12 | Learning and career | 6 | 38 | 0 | 0 | 38 | 0 | 0 | No exact story-level implementation evidence located; employee skill story E02-12 is in Phase 05. |
| 13 | Payroll, compensation and benefits | 12 | 80 | 0 | 0 | 80 | 0 | 0 | No exact story-level implementation evidence located; authority/contract remains open. |
| 14 | Expenses and travel | 2 | 22 | 0 | 0 | 22 | 0 | 0 | No exact story-level implementation evidence located. |
| 15 | Employee lifecycle and services | 23 | 149 | 0 | 0 | 149 | 0 | 0 | No exact story-level implementation evidence located. |
| 16 | Communications and tasks | 6 | 31 | 0 | 0 | 31 | 0 | 0 | E35-04 is an explicit contract blocker; the remaining 30 are traceability gaps. |
| 17 | Dashboards and reporting | 8 | 61 | 6 | 3 | 52 | 0 | 0 | Exact Main employee dashboard markers cover check-in/out, balances, pending requests, holidays, tasks/goals and announcements; E01-01/06/10 remain partial, E01-09 has no direct story test and other IDs remain traceability-blocked. |
| 18 | Cross-cutting quality and Figma | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting visual/accessibility/locale checks; no exclusive module assignment. |
| 19 | Cross-system migration and security | 1 | 5 | 0 | 0 | 5 | 0 | 0 | Five stories remain unclassified at ID level; hosted migration/security gates remain open. |
| 20 | Story-by-story certification | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting certification audit; stories are counted in their primary module phase. |
| 21 | Release, backup and dual deployment | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Release, backup and deployment controls; stories are counted in their primary module phase. |

## Prioritized gap register

| Priority | Gap | Evidence and scope | Reproducible closure |
|---|---|---|---|
| P0 | Hosted production role/API acceptance | PR #39: one SA session only, one active tenant, missing independent HR/Admin and employee sessions, no production cross-tenant test, seven Candidate/interview RPCs absent, offer path untested; production migration head 20261020044145. | WS02 coordinates authorized identities and role permissions; verify exact signatures/grants read-only, positive/denied tenant cases, anonymous HTTP denial, and exact story IDs; WS05 controls any release decision. |
| P0 | Release candidate freshness | Main app code `4cc2661` and exact test tree `4cebe84` pass runs 39420943283 and 39422238862; current development tip `fe83696` is docs-only. Main PR #38 and Candidate PR #5 remain frozen drafts, while PR #6 and PR #35 are outside their RCs. Candidate `530c2de` has no workflow/status checks; run `39419429848` at `9c61a3c` failed CA11-04 after CA10/12/13 markers. Candidate production remains public-only. | WS05 compares exact trees, preserves backups and sole Super Admin, records an approved RC SHA, then runs full exact-head checks. No merge/deploy from WS04. |
| P1 | Recover historical 82 IDs | Historical membership is `NOT_RECORDED`; cannot compute overlap/union with 105 current IMPLEMENTED_NOT_CERTIFIED IDs. | Recover IDs from existing saved files/history and compute exact set intersection/union. Do not add aggregate counts. |
| P1 | Resolve remaining Candidate retests | Main HR01-01 now has a passing exact-source partial journey at `4cc2661` and remains PARTIAL for the supported activation path only. Candidate `CA11-04` failed PDF extraction at `9c61a3c`; `CA11-01/02/03/05` were not reached after the `d410cf1` CVBuilder source change; current Candidate `530c2de` has no workflow/status result. | WS03 resolves the PDF failure and runs the remaining CA11 stories on a current approved exact head. Hosted acceptance and Figma gates remain separate. |
| P1 | Close 898 story traceability gaps | Exact canonical IDs remain without individual component/test/hosted mapping. | Filter CSV by `classification_status=BLOCKED AND blocker_category=TRACEABILITY_GAP_NOT_EVIDENCE_OF_ABSENCE`; for each row add an independently verifiable ID-to-code/test/host/Figma chain. |
| P1 | Approve 23 product contracts | Exact IDs are listed above and in the CSV; WS06/07/08 docs do not implement them. | Resolve owner/product scope, API/security, permissions, fields, validation, lifecycle and audit behavior before implementation; then test exact ID in isolated environment. |
| P1 | Close 16 partial stories | E01-01/06/10, E04-05, E06-04/06, E15-10/11, E37-02/03/04, HR01-01/02/06/07/08. | Close each listed behavior/policy scope at the approved release SHA, then obtain hosted acceptance and approved Figma mapping. |
| P1 | Refresh WS06–08/WS05 checkpoint evidence | WS08 PR #44 API base `1714a08` differs from its final report’s fetched remote target `4cc2661`; the read-only merge-tree was clean, but its focused browser cases were blocked before launch. | Owners record the intended base and rerun scoped behavior at a current approved head; no test-only result changes story status. |
| P2 | Candidate release acceptance and PR #6 promotion | Latest completed PR #6 run at `9c61a3c` fails CA11-04 after CA10 5/5, CA12 4/4 and CA13 5/5. Current head `530c2de` has no workflow/status result. Candidate hosted auth/RLS remains unaccepted and public-only mode remains. | WS05/WS02 complete authenticated hosted role/tenant journey and review the PR #6 diff before any Candidate RC change. |
| P2 | Figma mapping and responsive proof | The independent screen audit records semantic WS08 candidates, no populated mobile frames, and no fresh exact-head role/state recaptures for M01–M03. | WS01/WS06/WS07/WS03 confirm route ownership and frame links, then supply matched desktop/mobile evidence or accepted no-screen rationale. |
| P2 | Database recovery proof | Existing source-bundle readback is recorded; database snapshot/restore proof is missing. | WS05 documents a controlled restore/readback while leaving production unchanged. |

## Reproducible evidence/unblock matrix

The companion [`HRIS_Certification_Unblock_Matrix_2026-10-20.csv`](HRIS_Certification_Unblock_Matrix_2026-10-20.csv) has one row for each of 105 implemented-not-certified IDs, 16 partial IDs, 23 product-contract blockers, and five Candidate verification/retest blockers (four pending retests and one known prior-head failure), plus reproducible selectors/gates for the 898 traceability rows, historical 82, hosted production, release hold, Figma and backup proof. The per-story ledger includes exact test/source/reference and a concrete next action. Verify core totals by filtering classification/status fields and confirm the sum remains 1,047.

## Source checkpoints

- Main development tip [`fe83696`](https://github.com/shihab-tech04/HRIS-v2/commit/fe83696d8bc142b3c3f7cc28962062d82d1e1745) (docs-only over tested app/test tree `4cebe84`); activation source commit [`4cc2661`](https://github.com/shihab-tech04/HRIS-v2/commit/4cc26610c2bd8fc339990cb433d64a6e9c24e15a)
- [Main frozen RC PR #38](https://github.com/shihab-tech04/HRIS-v2/pull/38) · [WS05 ledger PR #41](https://github.com/shihab-tech04/HRIS-v2/pull/41)
- [WS02 PR #39](https://github.com/shihab-tech04/HRIS-v2/pull/39) · [WS06 PR #42](https://github.com/shihab-tech04/HRIS-v2/pull/42) · [WS07 PR #43](https://github.com/shihab-tech04/HRIS-v2/pull/43) · [WS08 PR #44](https://github.com/shihab-tech04/HRIS-v2/pull/44) · [WS04 screen parity PR #45](https://github.com/shihab-tech04/HRIS-v2/pull/45)
- [E02-09 PR #35](https://github.com/shihab-tech04/HRIS-v2/pull/35) · [Candidate RC PR #5](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/5) · [Candidate PR #6](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/6)
- [Historical acceptance snapshot](https://github.com/shihab-tech04/HRIS-v2/blob/development/hris-checkpoints/docs/evidence/acceptance-and-story-snapshot-20261017.md) · [Story acceptance overlay at current Main development](https://github.com/shihab-tech04/HRIS-v2/blob/development/hris-checkpoints/docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json)

---

**Certification statement:** 105 stories have direct, story-ID-level implementation evidence and passing disposable behavior; 16 have direct partial evidence; 23 are blocked by named product-contract gaps; four Candidate CA11 stories need current-head retest, one CA11-04 story retains a known prior-head PDF assertion failure, and 898 remain without per-ID source/test mapping. Zero are 360° certified. Passing tests and Figma semantic matches alone do not certify any story. WS05 remains the exclusive release controller.
