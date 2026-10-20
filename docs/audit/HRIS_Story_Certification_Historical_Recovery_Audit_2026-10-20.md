# Synesis HRIS 360° Story Certification and Historical Recovery Audit

**Audit snapshot:** 20 October 2026, after live refresh of branch/PR heads and exact-head Actions runs  
**Repositories:** [HRIS-v2](https://github.com/shihab-tech04/HRIS-v2) · [HRIS-Candidate-v2](https://github.com/shihab-tech04/HRIS-Candidate-v2)  
**Approved Figma source:** [XEXLe9J1oATlITS9I5u1P9](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)  
**Audit PR:** [HRIS-v2 PR #40](https://github.com/shihab-tech04/HRIS-v2/pull/40) — docs-only, kept draft.  
**Scope:** story evidence, history and release-state reconciliation. No product code, approved UI, production SQL/data, main branch, backup, merge or deployment was changed by this audit.

## Latest exact-head refresh

The current 1,047-ID ledger is **0 CERTIFIED · 58 IMPLEMENTED_NOT_CERTIFIED · 8 PARTIAL · 0 NOT_STARTED · 981 BLOCKED**. The blocked rows comprise 23 named product-contract gaps, two current exact-head test failures (`HR01-01`, `CA11-04`), and 956 story-ID traceability gaps. The historical 82 verified aggregate remains separate because its story-ID membership is not recorded; it is not added to the current ledger.

- Main `development/hris-checkpoints` exact head `3f6ea22eb0b7f0e4b4424552694e92652116c196`: disposable run [39418704906](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418704906) reports 382/384 checks passing and fails the `HR01-01` authorization/activation journey. Invalid/unverified and future-date probes returned `42501` rather than expected `22023`/`55000`; activation returned HTTP 400 and created no employee row. Runner probe [39418704923](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418704923) and Phase 2A [39418705013](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418705013) passed. The app source is unchanged from `f02ae03`; WS01 owns the fixture/RPC/source diagnosis.
- Candidate PR #6 exact head `709760cc5bc91e6d5c62179f62dfe32e92a1fac6`: disposable run [39418609374](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39418609374) stops at `CA11-04`, where PDF text extraction splits selected CV profile text and the assertion cannot match it. CA10 (5/5), CA12 (4/4), and CA13 (5/5) markers emitted before the failure. The prior full pass [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) is at `04f1054`; the later commits changed tests only. The current failure is retained as a blocker pending WS03 review; test markers alone do not certify stories.
- WS08 PR #44 is an independent screen audit at evidence head `d07c2ebedade943f39482cc6bc603c417d797c0c`. Its pinned 239-row register (M90/H44/A24/C24/SA57) remains 232 BLOCKED, seven IMPLEMENTED_NOT_CERTIFIED, and zero verified/certified. All M01–M03 remain blocked. The separate [Main/Candidate route parity audit](https://github.com/shihab-tech04/HRIS-v2/pull/45) carries screen evidence and is not added to this story ledger.

No story was certified by either passing test markers or a screen-level semantic match. WS05 remains the release controller; this refresh authorizes no merge or deployment.

## Executive result

The canonical register contains **1,047 unique user stories across 153 modules and 22 operational phases**. The recovered immutable story matrix has 0 validation anomalies. The current audit ledger classifies every canonical ID:

| Classification | Count | Meaning |
|---|---:|---|
| CERTIFIED | **0** | No story has an independent story-ID chain through implementation, exact test, approved design correspondence and hosted acceptance. |
| IMPLEMENTED_NOT_CERTIFIED | **58** | Exact story IDs have implementation evidence; disposable results are linked per ID, with current-head exceptions retained as BLOCKED. Hosted certification remains open. |
| PARTIAL | **8** | A mapped, tested slice exists, while the full story contract or acceptance scope remains open. |
| NOT_STARTED | **0** | The reviewed material cannot prove absence, so no story is labeled not started. |
| BLOCKED | **981** | 23 product-contract blockers, two current exact-head test failures, and 956 ID-level traceability gaps. A traceability block is not evidence of absent functionality. |
| **Total** | **1,047** | Every canonical ID appears once. |

The level columns added to the 1,047-row CSV separately record **implementation**, **test**, and **hosted certification** status. No disposable assertion count, checkpoint owner assignment, proposed contract, or audit-only test is treated as completed product functionality.

## Canonical source and counting rules

- The recovered source is **HRIS Feature → User Story Master Inventory — v1**, reconstructed from 1,855 source lines. Original inventory SHA-256: `d68449755a0ad821921f566d9cb3a3183ddfe6c194e1ffc8e08346a71cf7d5be`.
- The immutable matrix is [`CANONICAL_USER_STORY_MATRIX.json`](https://github.com/shihab-tech04/HRIS-v2/blob/development/hris-checkpoints/docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json), SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. It has 1,047 unique IDs, 153 modules, and 0 validation anomalies. The matrix's status fields remain `NOT TESTED`; the operational phase map assigns each module once.
- Role totals are Employee 362, Manager 90, HOD 44, HR 252, Admin 24, CEO 24, Super Admin 57, Candidate 137, Cross-system 57.
- The ledger adds four audit fields: `implementation_level`, `test_level`, `hosted_certification_level`, and `unblock_action`. It retains the canonical verbatim requirement, module, role, phase and source-line provenance.
- **CERTIFIED** requires independently traceable canonical ID → source component/API/data path → exact-ID test pass at the candidate SHA → approved Figma node/visual check (or accepted no-screen rationale) → hosted acceptance with intended roles and tenant boundaries. A run can support one story only when the ID and behavior are directly evidenced.
- `BLOCKED`/traceability rows mean the audit did not locate direct evidence for that ID or that the current exact-head evidence failed. They do not assert that the feature is absent. All 956 trace rows have a per-ID next action in the ledger. `NOT_STARTED` is reserved for direct evidence of no work, which was not available for any row.

## Historical 82, prior 39 and new evidence reconciliation

The 17 October checkpoint reports **82 VERIFIED**, 13 partial, 13 blocked, 0 broken within the tested scope and 939 not yet classified. The 82 is a story aggregate, **not 82 test runs or assertions**. `verified_story_id_membership` is `NOT_RECORDED`, so its overlap with the later exact IDs is unknown.

The source-linked overlay at the live Main development checkpoint records **39 distinct individually evidenced IDs**; the frozen Main RC #38 overlay recorded 38, with HR01-04 added on Main development after the freeze. The 39 prior IDs are retained exactly once. The refreshed ledger adds **20 further direct story IDs** from open, unmerged branches:

| Added direct story evidence | Exact IDs | Source | Exact-head test evidence | Result |
|---|---|---|---|---|
| Employee employment information | E02-09 | HRIS PR #35, `11d3ecd99f40da416caf32e73bee76554fd152dd` | `tests/sql/employment-info/verify.sql`; `tests/browser/employee-attendance.spec.ts`; runs [38929115130](https://github.com/shihab-tech04/HRIS-v2/actions/runs/38929115130) and [38929115082](https://github.com/shihab-tech04/HRIS-v2/actions/runs/38929115082), both success | Implemented, not certified; branch is not in main/#38. |
| CV parsing and review | CA10-01…CA10-05 | Candidate PR #6, exact head `709760cc5bc91e6d5c62179f62dfe32e92a1fac6` | `tests/candidate-application-local-e2e.mjs`; run [39418609374](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39418609374), marker `CANDIDATE_CA10_STORY_EVIDENCE PASS=5 FAIL=0` | 5/5 direct IDs emitted a current-head pass marker before the later CA11-04 failure; not hosted-certified. |
| CV builder | CA11-01…CA11-05 | Candidate PR #6, exact head `709760cc5bc91e6d5c62179f62dfe32e92a1fac6` | Run [39418609374](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39418609374) stops at CA11-04 PDF text extraction; prior full pass [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) is at `04f1054` | CA11-04 is BLOCKED on current evidence; the prior pass is historical. No CA11 story is certified. |

| Saved Jobs | CA12-01…CA12-04 | Candidate PR #6, exact head `709760cc5bc91e6d5c62179f62dfe32e92a1fac6` | `tests/candidate-application-local-e2e.mjs`; run [39418609374](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39418609374), marker `CANDIDATE_CA12_STORY_EVIDENCE PASS=4 FAIL=0` | 4/4 direct IDs emitted a current-head pass marker before the CA11-04 failure; not hosted-certified. |
| Job Alerts | CA13-01…CA13-05 | Candidate PR #6, exact head `709760cc5bc91e6d5c62179f62dfe32e92a1fac6` | `tests/candidate-application-local-e2e.mjs`; run [39418609374](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39418609374), marker `CANDIDATE_CA13_STORY_EVIDENCE PASS=5 FAIL=0` | 5/5 direct IDs emitted a current-head pass marker before the CA11-04 failure; hosted acceptance remains open. |

Thus the **current individually evidenced exact-ID set is 58 = prior 39 ∪ these 20 − current-head CA11-04 failure**, with duplicates removed by ID. The historical 82 remains separate and unadded: neither `82 + 39` nor `82 + 58` is a valid deduplicated total. Its ID overlap cannot be calculated until the original 82 IDs are recovered from existing saved artifacts. The historical 13 partial membership is also unknown and cannot be reconciled to the current eight exact partial IDs.

The latest exact-head refresh moves `CA11-04` from implementation evidence to a current-head test blocker and promotes `HR01-01` from an unmapped traceability row to a specific current-head test blocker. The current 981 blocked rows comprise **23** product-contract gaps, **two** test failures, and **956** remaining story-ID traceability gaps. Historical aggregate membership and the WS08 239-row register are not added.

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

- `E04-05`: active/employment information exists; approved expiry semantics and transition coverage remain open.
- `E37-02`, `E37-03`, `E37-04`: location normalization, contact visibility and reporting-line source/behavior remain unresolved.
- `HR01-02`: current HR directory editing covers nine allowlisted contact fields only. The broader employee-record update story is partial; its hosted contact RPCs are absent at migration head `20261020044145`. Exact-head disposable run [39395048458](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39395048458) passed. Its story-level contract guard and related contact editor/Auth/Postgres browser checks passed; a distinct HR01-02 partial browser marker now passes. The broader story remains partial, and no hosted pass is claimed.
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
| HRIS `development/hris-checkpoints` | `3f6ea22eb0b7f0e4b4424552694e92652116c196` | Exact-head disposable run [39418704906](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418704906) fails two HR01-01 assertions (382/384 pass); Phase 2A [39418705013](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418705013) and runner probe [39418704923](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418704923) pass. App source is unchanged from `f02ae03`; hosted RPC parity remains open. |
| Main frozen RC PR #38 | `686eec7016ec831e9b679500f28f553b8f93b14f` | Draft/HOLD; 516 commits ahead of main, 651 changed files. Current development is 10 commits ahead. |
| HRIS PR #35 (E02-09) | `11d3ecd99f40da416caf32e73bee76554fd152dd` | Open, non-draft, unmerged feature branch. Tests pass, but E02-09 is absent from main and RC #38. |
| HRIS WS05 control PR #41 | `fe1c497a01ea4d21befa7ee13d1af32dcf581fab` | Draft release ledger; it needs this exact-head failure and the PR #44/route parity evidence in its readiness snapshot. WS05 remains the exclusive release controller. |
| Candidate `main` | `38174c7b607999f951c7eea47aefaa443735080e` | Production branch; unchanged by audit. |
| Candidate development and frozen PR #5 RC | `e3cb9c178cbfb66eb611c640f885a13581b50f51` | Draft/HOLD, 95 commits ahead of main. Candidate deployment remains public-only gated. |
| Candidate PR #6 | `709760cc5bc91e6d5c62179f62dfe32e92a1fac6` | Open draft; current run [39418609374](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39418609374) fails at CA11-04 after CA10 5/5, CA12 4/4, CA13 5/5 markers. Prior full pass [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) is at `04f1054`; later commits are test-only. No hosted Candidate acceptance. |

### Eight workstation checkpoint recheck

| WS | Live checkpoint | Reverified result | Required follow-up |
|---|---|---|---|
| WS01 | Current Main development `3f6ea22` | Exact-head run 39418704906 fails two HR01-01 authorization/activation checks (382/384 pass); Phase 2A and runner probe pass. The app tree is unchanged from `f02ae03`. | Investigate HR01-01 disposable fixture vs actual RPC/UI behavior, then rerun the full exact head; keep HR01-01 blocked until it passes and hosted acceptance is supplied. |
| WS02 | HRIS PR #39 `c92838b` | One signed-in production Super Admin read-only session; tenant/departments reads, employee RLS filtering, recruiter denial and unlinked self-service denial. Result **PARTIAL / NOT ACCEPTED**. Only one active tenant; no independent HR/Admin or employee session; production cross-tenant and anonymous HTTP rejection not established; seven Candidate/interview RPCs absent; offer issuance untested. | WS02/WS05 close exact hosted gates with authorized identities and deployed API parity. No story IDs certified by the current one-session check. |
| WS03 | HRIS PR #37 `a14a1f9` | Draft migration-recovery evidence. Two migrations are already in production; hosted records are at `20261020044145`; prior checks report 26/26 schema/API parity, 20/20 security, 9/9 anon/sessionless DB-role denial. No migration replay was performed in this audit; no signed-in hosted journey is claimed. | Keep production migration history unchanged; close signed-in API and application acceptance through WS02/WS05. |
| WS04 | HRIS PR #40 audit branch | Docs-only PR #40 carries the refreshed 1,047-ID ledger and unblock matrix. A separate docs-only route/Figma parity PR #45 reports 4 geometry PASS, 1 token FAIL, and 56 route/frame BLOCKED; it does not add screen rows to story totals. | Review the separate evidence tracks; no product or release action. |
| WS05 | HRIS PR #38 `686eec7`; control PR #41 `fe1c497`; Candidate PR #5 `e3cb9c1` | Main and Candidate remain DRAFT/HOLD. Current Main and Candidate exact-head checks fail; database snapshot/restore proof is still missing. | WS05 alone decides branch reconciliation, backup/recovery acceptance, merge and deployment. Preserve sole Super Admin and migration head. |
| WS06 | HRIS PR #42 `340fb92` | Audit-only Employee Phase 05 report: 16 implemented/4 partial/16 blocked within its 36-ID scope; these rows overlap existing story entries. The earlier browser build smoke remains blocked by Pages asset parity. | Keep its audit scope separate; confirm employee-frame mappings only after an independent employee identity and current route proof are available. |
| WS07 | HRIS PR #43 `779c813` | Audit-only HR ownership and HR03 proposal; nine HR03 IDs. Readiness guards pass, while proposed isolation tests are not executed and HR03-01 has no approved/deployed legal-entity contract. | Confirm attendance/leave management route ownership and approved fields with WS01; retain the HR03 contract blocker. |
| WS08 | HRIS PR #44 `d07c2eb` | Audit-only route/Figma report and SA06 contract review. Register: M90/H44/A24/C24/SA57; 232 blocked, seven implemented-not-certified, none verified/certified. Lint and 33/33 focused contracts pass; eight browser cases stop before launch because Chromium is missing; no fresh responsive route proof. | Keep all M01–M03 blocked. M03 Team Leave is next route audit candidate; route/frame mappings are semantic only. |

The WS08 PR #44 API base is `1714a08`, while its report records the fetched remote target `development/hris-checkpoints` at `3f6ea22`; the disagreement remains an explicit limitation. Its reviewed route source paths are reported unchanged against the fetched target, but its eight focused Playwright cases did not launch and provide no fresh route/responsive proof. PR #41’s release snapshot must include the latest exact-head failures and parity report; WS04 does not take release control.

### Missing from current production/release candidates

- Main `main` does not contain key integrated development paths such as `src/live/EmployeeDocumentVault.tsx`, `EmployeeIdentityCard.tsx`, `ProfileChangeRequests.tsx`, `MyEmployeeRoster.tsx`, `OrganizationEmployeeDirectory.tsx`, `MyLearning.tsx`, `LearningRequests.tsx`, and `PlatformTenantWorkspace.tsx`. Most are present in held RC #38, not in production.
- E02-09 employment-information implementation/test evidence is only on open PR #35; it is not in Main main or frozen RC #38.
- The current development contact-RPC fail-closed behavior in `src/live/OrganizationEmployeeDirectory.tsx` and localized messages in `src/live/project-locale.ts` are not in frozen RC #38. The current exact-head disposable run 39395048458 passes; hosted RPC parity remains unverified.
- Candidate CA10 browser parser/review functionality and exact CA10/CA11 story coverage are on open PR #6, not Candidate main, development or frozen RC #5. The base Candidate release already has a basic CV Builder; this audit does not claim that all CA11 product code is absent from #5.
- Current Candidate PR #6 run [39418609374](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39418609374) at `709760c` fails CA11-04 because the PDF text assertion cannot match profile text split by extraction. The prior full run [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) at `04f1054` passed CA10–CA14; the intervening changes are test-only. WS03 must determine whether the assertion or extracted output needs correction and rerun the current head.

## Production and recovery boundaries

The live read-only checkpoints continue to report production migration head **`20261020044145`** with 116 migration-history rows. This audit did not query or write production business rows, did not run migrations, and did not alter schema, roles, Auth identities, tenant membership, settings or deployment. Sole Super Admin and the existing release backups were left untouched. WS05’s current PR #41 records verified source-bundle readback hashes but also states that database snapshot/restore proof is missing; a source-bundle hash is not database recovery proof.

No separate Mac desktop transcript or uncommitted Mac filesystem was available to inspect. The evidence proves that substantial source, tests, docs and backups survive in GitHub/development/open branches; it does **not** prove every four-day Mac edit was saved. In particular, PR #35 and PR #6 contain distinct unmerged work, and the release candidates do not include those branches.

## Figma correspondence

The approved file was inspected read-only. It exposes one page (`Page 1`, node `0:1`) and has no canonical story-ID links. Reviewed references include Employee profile/contact frames `66:72042`, `139:40250`, `139:40294`, employee card `66:51454`, attendance `66:43832`, node `86:36267` (Upload Resume/CV label inside Employee Referral Form `86:36224`) and `New Application` frame `265:48972` (Employee Self Service). WS08 separately reviewed Managerial Dashboard `9:22640`/filtered state `9:23429`, Attendance Information/Requests `17:28320` and related states, and Leave Requests `17:31769` and related states. Those remain semantic candidates without canonical story links or current-head role/state/mobile captures; M01–M03 are blocked. The [separate route parity audit](https://github.com/shihab-tech04/HRIS-v2/pull/45) records shell geometry PASS, primary-color FAIL, and route/frame BLOCKED findings. No exact CA10 parser/review, CA11 Candidate CV Builder, HR03 legal-entity or SA06 master-data story mapping was found.

## Phase-by-phase completion

Status totals are derived from the updated 1,047-row CSV. Each story appears in its primary operational phase. Cross-cutting phases 00–02, 18, 20 and 21 have no exclusive story modules; they are included as zero-story process rows and do not change the 1,047 total.

| Phase | Scope | Modules | Stories | Implemented, not certified | Partial | Blocked | Certified | Not started | Notes |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 00 | Source inventory and scope | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting inventory and scope; no exclusive module assignment. |
| 01 | Source integration | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting source integration; no exclusive module assignment. |
| 02 | Design foundation | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting design foundation; no exclusive module assignment. |
| 03 | Tenant platform | 2 | 7 | 7 | 0 | 0 | 0 | 0 | Seven exact IDs have disposable tenant/module evidence; hosted tenant API acceptance remains open. |
| 04 | Auth, permissions and RLS | 6 | 32 | 0 | 0 | 32 | 0 | 0 | 32 stories; no story-level hosted role/two-tenant acceptance linked. |
| 05 | People and org | 7 | 57 | 19 | 8 | 30 | 0 | 0 | 19 exact implementations (18 in current Main checkpoint plus E02-09 on open PR #35), 8 partial, 13 contract blockers, 17 trace gaps; HR01-01 is now a current-head failure blocker within the blocked count. |
| 06 | Recruiting and Candidate | 33 | 226 | 30 | 0 | 196 | 0 | 0 | 30 exact Candidate IDs remain implemented-not-certified; CA11-04 is blocked by the current exact-head test failure. No Candidate story is hosted-certified. |
| 07 | Onboarding and conversion | 6 | 46 | 0 | 0 | 46 | 0 | 0 | No exact story-level implementation evidence located. |
| 08 | Attendance and time | 16 | 115 | 2 | 0 | 113 | 0 | 0 | Two exact manager shift stories have disposable evidence; other stories lack ID-level evidence or have explicit blockers in other phases. |
| 09 | Leave and absence | 8 | 65 | 0 | 0 | 65 | 0 | 0 | Five contract blockers (E07-05..07 and E08-15/16); remaining rows are traceability gaps. |
| 10 | Projects and allocation | 2 | 8 | 0 | 0 | 8 | 0 | 0 | No exact story-level implementation evidence located. |
| 11 | Performance | 15 | 105 | 0 | 0 | 105 | 0 | 0 | No exact story-level implementation evidence located. |
| 12 | Learning and career | 6 | 38 | 0 | 0 | 38 | 0 | 0 | No exact story-level implementation evidence located; employee skill story E02-12 is in Phase 05. |
| 13 | Payroll, compensation and benefits | 12 | 80 | 0 | 0 | 80 | 0 | 0 | No exact story-level implementation evidence located; authority/contract remains open. |
| 14 | Expenses and travel | 2 | 22 | 0 | 0 | 22 | 0 | 0 | No exact story-level implementation evidence located. |
| 15 | Employee lifecycle and services | 23 | 149 | 0 | 0 | 149 | 0 | 0 | No exact story-level implementation evidence located. |
| 16 | Communications and tasks | 6 | 31 | 0 | 0 | 31 | 0 | 0 | E35-04 is an explicit contract blocker; the remaining 30 are traceability gaps. |
| 17 | Dashboards and reporting | 8 | 61 | 0 | 0 | 61 | 0 | 0 | No exact story-level implementation evidence located. |
| 18 | Cross-cutting quality and Figma | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting visual/accessibility/locale checks; no exclusive module assignment. |
| 19 | Cross-system migration and security | 1 | 5 | 0 | 0 | 5 | 0 | 0 | Five stories remain unclassified at ID level; hosted migration/security gates remain open. |
| 20 | Story-by-story certification | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Cross-cutting certification audit; stories are counted in their primary module phase. |
| 21 | Release, backup and dual deployment | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Release, backup and deployment controls; stories are counted in their primary module phase. |

## Prioritized gap register

| Priority | Gap | Evidence and scope | Reproducible closure |
|---|---|---|---|
| P0 | Hosted production role/API acceptance | PR #39: one SA session only, one active tenant, missing independent HR/Admin and employee sessions, no production cross-tenant test, seven Candidate/interview RPCs absent, offer path untested; production migration head 20261020044145. | WS02 coordinates authorized identities and role permissions; verify exact signatures/grants read-only, positive/denied tenant cases, anonymous HTTP denial, and exact story IDs; WS05 controls any release decision. |
| P0 | Release candidate freshness | Main dev is at `3f6ea22`; Main PR #38 and Candidate PR #5 remain frozen drafts, while PR #6 and PR #35 are outside their RCs. Current exact-head Main/Candidate runs have failures. | WS05 compares exact trees, preserves backups and sole Super Admin, records an approved RC SHA, then runs full exact-head checks. No merge/deploy from WS04. |
| P1 | Recover historical 82 IDs | Historical membership is `NOT_RECORDED`; cannot compute overlap/union with 58 current exact IDs. | Recover IDs from existing saved files/history and compute exact set intersection/union. Do not add aggregate counts. |
| P1 | Resolve two current exact-head failures | `HR01-01` fails two of 384 Main checks; `CA11-04` fails the Candidate PDF text assertion. | WS01 and WS03 inspect their scoped source/test behavior and rerun the exact current head. Keep both rows BLOCKED until direct evidence is green. |
| P1 | Close 956 story traceability gaps | Exact canonical IDs remain without individual component/test/hosted mapping. | Filter CSV by `classification_status=BLOCKED AND blocker_category=TRACEABILITY_GAP_NOT_EVIDENCE_OF_ABSENCE`; for each row add an independently verifiable ID-to-code/test/host/Figma chain. |
| P1 | Approve 23 product contracts | Exact IDs are listed above and in the CSV; WS06/07/08 docs do not implement them. | Resolve owner/product scope, API/security, permissions, fields, validation, lifecycle and audit behavior before implementation; then test exact ID in isolated environment. |
| P1 | Close 8 partial stories | E04-05, E37-02/03/04, HR01-02/06/07/08. | Use the per-ID acceptance action and test path in the CSV/matrix; include hosted evidence after local behavior is complete. |
| P1 | Refresh WS06–08/WS05 checkpoint evidence | WS08 PR #44 API base `1714a08` differs from the fetched remote target `3f6ea22`; its focused browser cases were blocked before launch. | Owners record the intended base and rerun scoped behavior at a current approved head; no test-only result changes story status. |
| P2 | Candidate release acceptance and PR #6 promotion | PR #6 exact-head run fails CA11-04; Candidate hosted auth/RLS remains unaccepted and public-only mode remains. | WS05/WS02 complete authenticated hosted role/tenant journey and review the PR #6 diff before any Candidate RC change. |
| P2 | Figma mapping and responsive proof | The independent screen audit records semantic WS08 candidates, no populated mobile frames, and no fresh exact-head role/state recaptures for M01–M03. | WS01/WS06/WS07/WS03 confirm route ownership and frame links, then supply matched desktop/mobile evidence or accepted no-screen rationale. |
| P2 | Database recovery proof | Existing source-bundle readback is recorded; database snapshot/restore proof is missing. | WS05 documents a controlled restore/readback while leaving production unchanged. |

## Reproducible evidence/unblock matrix

The companion [`HRIS_Certification_Unblock_Matrix_2026-10-20.csv`](HRIS_Certification_Unblock_Matrix_2026-10-20.csv) has one row per each of the 58 implemented-not-certified IDs, eight partial IDs, 23 product-contract blockers and two current-head failure blockers, plus reproducible selectors/gates for the 956 traceability rows, historical 82, hosted production, release hold, Figma and backup proof. The per-story ledger includes exact test/source/reference and a concrete next action. Verify core totals by filtering classification/status fields and confirm the sum remains 1,047.

## Source checkpoints

- [Main development head `3f6ea22`](https://github.com/shihab-tech04/HRIS-v2/commit/3f6ea22eb0b7f0e4b4424552694e92652116c196)
- [Main frozen RC PR #38](https://github.com/shihab-tech04/HRIS-v2/pull/38) · [WS05 ledger PR #41](https://github.com/shihab-tech04/HRIS-v2/pull/41)
- [WS02 PR #39](https://github.com/shihab-tech04/HRIS-v2/pull/39) · [WS06 PR #42](https://github.com/shihab-tech04/HRIS-v2/pull/42) · [WS07 PR #43](https://github.com/shihab-tech04/HRIS-v2/pull/43) · [WS08 PR #44](https://github.com/shihab-tech04/HRIS-v2/pull/44) · [WS04 screen parity PR #45](https://github.com/shihab-tech04/HRIS-v2/pull/45)
- [E02-09 PR #35](https://github.com/shihab-tech04/HRIS-v2/pull/35) · [Candidate RC PR #5](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/5) · [Candidate PR #6](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/6)
- [Historical acceptance snapshot](https://github.com/shihab-tech04/HRIS-v2/blob/development/hris-checkpoints/docs/evidence/acceptance-and-story-snapshot-20261017.md) · [Story acceptance overlay at current Main development](https://github.com/shihab-tech04/HRIS-v2/blob/development/hris-checkpoints/docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json)

---

**Certification statement:** 58 stories have direct, story-ID-level implementation and passing disposable evidence, eight have direct partial evidence, 23 are blocked by named product-contract gaps, two fail current exact-head tests, 956 have no per-ID evidence mapping, and zero are 360° certified. WS05 remains the exclusive release controller.
