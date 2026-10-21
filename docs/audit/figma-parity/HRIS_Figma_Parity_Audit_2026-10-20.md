# HRIS Main/Candidate Figma Route Parity Audit

**Audit date:** 20 October 2026  
**Scope:** Read-only route, role/state, and desktop/mobile audit of the current Main and Candidate public sites against approved Figma file [XEXLe9J1oATlITS9I5u1P9](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9). This audit is separate from the 1,047-ID story ledger; screen rows are not story IDs and are not added to story totals.  
**Result:** **4 PASS · 1 FAIL · 56 BLOCKED** across 61 screen evidence rows. PASS is limited to live shell geometry. No route-level Figma parity is certified.

## Observed production routes and role/state

- **Main:** [HRIS-v2 Pages](https://shihab-tech04.github.io/HRIS-v2/) renders System Workspace, Employee View, and Admin View under one authenticated session whose visible role label is `hr_admin`. The Employee/Admin controls are view selectors within that same session. Employee View is explicitly read-only and states that business write operations are not integrated. No independent employee identity or separate Admin account was available. The UI did not expose an immutable deployment SHA.
- **Candidate:** [HRIS-Candidate-v2 Pages](https://shihab-tech04.github.io/HRIS-Candidate-v2/) renders the Public vacancy preview. Direct `?view=dashboard` and `?view=applications` URLs still render that same public preview; the page says registration and applications are unavailable until security testing is complete. Candidate authenticated routes are not available in production for role/state comparison.

## Current source and test heads

| Surface | Ref | Exact-head evidence |
|---|---|---|
| Main production branch | `main` `cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7` | Live UI checked at desktop and mobile sizes; deployed artifact SHA is not exposed by the UI. |
| Main development | `development/hris-checkpoints` current docs-only tip `fe83696`; tested source `4cc2661`, exact full test tree `4cebe84` | Runs [39420943283](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39420943283) at source `4cc2661` and [39422238862](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39422238862) at test commit `4cebe84` passed, respectively, 348/348 and 349/349 contracts, 56/56 browser regressions, 384/384 isolated Auth/RLS assertions, Phase 04 parity 26/26, build, and disposable security review. `fe83696` only restores the master phase ledger after tested tree `4cebe84`; it has no workflow bound to its docs commit. HR01-01 is PARTIAL for the accepted-offer/submitted-packet activation path; general manual employee creation and hosted acceptance remain open. |
| Candidate production branch | `main` `38174c7b607999f951c7eea47aefaa443735080e` | Public-only page observed. |
| Candidate PR #6 | `work/candidate-phase06-07-20261020` `530c2de1ca12665051a3c617f593df1edba2d11b` | Latest run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) at exact PR head `9c61a3c` emitted CA10 5/5, CA12 4/4 and CA13 5/5, then failed CA11-04 on PDF text extraction. The run checked out Main at `3f6ea22`, behind current Main `4cc2661`. After `9c61a3c`, the current head adds one `InterviewsPage.tsx` change and later application/interview test edits; the latest `c2117b7` → `530c2de` commit changes only the application/interview test locator; CA10 parser/CVBuilder and CA12/13 source paths are unchanged, but current head has no workflow/status result. The earlier full pass at `04f1054` predates the `d410cf1` CVBuilder change. None of these disposable results is hosted acceptance or Figma certification. |

Main's passing exact-source and full regression runs supersede the earlier HR01-01 failure at `c095cfdb` (383/384). Candidate run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) still fails CA11-04 at `9c61a3c` after CA10 5/5, CA12 4/4, and CA13 5/5 markers; current Candidate head `530c2de` has no workflow/status result. The separate story ledger records Main HR01-01 as PARTIAL and Candidate CA11 retest gates. These results do not change the parity-row count.

## WS08 management route evidence

[WS08 PR #44](https://github.com/shihab-tech04/HRIS-v2/pull/44) is open as a draft at evidence head `d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db`. Its [final route audit report](https://github.com/shihab-tech04/HRIS-v2/blob/d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db/docs/evidence/ws08-management-figma-parity-audit-20261020.md) is scoped to management routes. The report records fetched development tip `4cc26610c2bd8fc339990cb433d64a6e9c24e15a` and API base `1714a08e24f47999618b0127fc818a3d19eb187a`; the discrepancy remains explicit. A read-only `git merge-tree` against the fetched target and PR head returned a clean tree. The audited Manager route source and three browser specs are unchanged; the only change among checked route/localization paths is an unrelated Bengali contact-edit fallback translation. The pinned WS08 register has 239 rows (M 90 / H 44 / A 24 / C 24 / SA 57): 232 `BLOCKED`, seven `IMPLEMENTED_NOT_CERTIFIED` (`SA01-01`–`SA01-04`, `SA12-01`–`SA12-03`), and none verified/certified. Its 239 rows remain separate from the 1,047-ID ledger below. All M01–M03 stories remain blocked; the frame links here are semantic candidates only.

| WS08 scope | Implemented route and candidate frames | Observed evidence and current status |
|---|---|---|
| M01 Team Dashboard | `dashboard` / Managerial Dashboard; Figma `9:22640`, filtered state `9:23429` | Historical synthetic desktop/mobile captures exist, but are not exact-head recaptures. The frame shows Dashboard header, Personal/Managerial tabs, and an attendance chart scaled 0–100%; current source uses daily attendance record counts with a 7/30-day range. Measure/denominator and role-state mapping remain open. **BLOCKED.** |
| M02 Team Attendance | `attendance` / `AttendanceReport`; Figma `17:28320` plus Requests, bulk, approval, and rejection states `17:29937`, `17:30342`, `17:30766`, `17:31148` | Figma uses `Attendance Information` and `Team Name`; the historical synthetic app capture uses `Attendance Report` and `Work hours`. `attendance.view` / `attendance.manage` share the route. Owner and approved fields are unresolved; no exact-head matched route capture. **BLOCKED.** |
| M03 Team Leave | `leave` / `LeaveWorkspace`; Figma `17:31769` plus bulk/approved/rejected states `17:32168`, `17:32584`, `17:32957` | Figma shows selection and Name / Applicable From / Applicable To / Leave Type / Applying Date / Remarks / Action. Current source shows Employee / Leave type / From / To / Days / Status / Evidence / Actions and also a team coverage calendar and tenant leave-policy UI. Preserve existing behaviors pending owner confirmation. **BLOCKED; next route audit candidate.** |

The reviewed WS08 frames are desktop compositions. No populated mobile counterpart was found. Existing M01/M02 screenshots are historical, while M03 has no current-head screenshot. Eight focused WS08 Playwright cases were blocked before page launch because Chromium was unavailable, so that audit has no fresh responsive capture. Separately, Main's exact disposable regression run [39422238862](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39422238862) at test tree `4cebe84` passed 56/56 browser regressions against source `4cc2661`; its synthetic-role flows exercise manager Team Report, manager leave review, employee attendance correction, employee dashboard/leave, and timesheets at responsive viewports. This is behavior evidence only: it adds no matched Figma capture, no hosted role proof, and no mobile Figma target. It does not change M01–M03 from BLOCKED or certify a story.

WS08 PR #44 is an independent screen audit at evidence head `d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db`. Its report records fetched development target `4cc26610c2bd8fc339990cb433d64a6e9c24e15a`, PR API base `1714a08e24f47999618b0127fc818a3d19eb187a`, and a clean read-only merge-tree result for those recorded inputs. Main later advanced through tested `4cebe84` to docs-only tip `fe83696`; no merge-tree result against that later tip is claimed. The base/target discrepancy remains open; no rebase or merge is claimed.

## Figma correspondence

The approved file exposes one page and 314 top-level frames. Reviewed candidates include the employee Dashboard frame `3:39433`, employee profile `66:72042`, attendance `66:43832`, personal leave `3:39880`, Employee Referral Form `86:36224` (with Upload Resume/CV child node `86:36267`), and employee self-service New Application `265:48972`. None has an exact canonical story-ID link. The referral and New Application frames are employee self-service and are not Candidate portal designs. No approved Candidate CV Builder/parser, My Applications, interview, offer, or preboarding screen mapping was found. No approved mobile mapping was found for the reviewed routes.

The Main development source enumerates role-gated `PageId` screens. The Candidate source enumerates 13 `?view=` screens. Those route lists and reviewed Figma frame records are itemized in the companion CSV. Main frame pairings, including the WS08 management frames and employee `my-dashboard` / `my-leave` frames, are plausible candidates only; they remain BLOCKED because the same deployed route, role/state, and approved viewport pair could not be established. Main's synthetic responsive browser flows are recorded separately from production and Figma parity.

## Desktop/mobile geometry

At `1280x900`, the live Main page document measured 1274px wide and Candidate measured 1265px. At `375x812`, Main measured 369px (including the workspace, Employee View, and Admin View samples) and Candidate measured 360px. Both rendered Poppins and showed no horizontal overflow. These PASS rows verify fit only; no matching Figma frame was available to determine visual parity.

## Confirmed mismatch

Figma's primary style reads `#08558B` (`rgb(8, 85, 139)`). Main and Candidate source tokens are `#085587`, and the live primary buttons resolve to `rgb(8, 85, 135)`. The exact token comparison **FAILS**. WS01 and WS03 should confirm the canonical value with the design owner and record the correction in their scoped design/source work. WS04 made no app changes.

## Status interpretation

- **PASS (4):** responsive width/overflow checks on the sampled live Main and Candidate pages only.
- **FAIL (1):** exact primary-color token mismatch.
- **BLOCKED (56):** no exact, approved route → role/state → Figma-frame match for the enumerated source routes/frames, WS08 M01–M03 have semantic mappings only and no fresh responsive proof, or Candidate production remains public-only. No route-level visual FAIL is asserted where the compared route/state could not be established.

## Owner routing and release readiness

- **WS01 Main:** confirm the primary token; resolve M01 chart measure/denominator and M02/M03 route ownership with WS02/WS07; map `my-dashboard`, attendance, leave, and other Main PageIds to approved frames and intended roles. Exact Main source `4cc2661` and test tree `4cebe84` now pass runs 39420943283/39422238862; keep HR01-01 PARTIAL for the verified activation slice only. General manual-create behavior and hosted acceptance remain open.
- **WS03 Candidate:** confirm primary token; map the 13 Candidate routes to approved frames or record a no-screen rationale; investigate CA11-04 failure at run 39419429848 on predecessor `9c61a3c`, preserve CA10 5/5 direct evidence from that same run, and verify the current PR #6 head `530c2de`, which has no workflow/status result and adds an InterviewsPage source change.
- **WS06 Employee:** Main's synthetic responsive regression flows now cover employee dashboard, attendance correction, and leave behavior on test tree `4cebe84`; keep those Figma rows BLOCKED until an independent employee identity/session, approved frame links, and matched desktop/mobile evidence are available.
- **WS07/WS01 management routes:** Main's disposable suite exercises manager Team Report and leave review behavior on test tree `4cebe84`. Confirm M02 attendance ownership/approved columns, M03 leave state and approved fields, and M01 chart measure/denominator before any UI change; preserve existing calendar and policy behavior pending the contract decision.
- **WS08:** keep M01–M03 blocked; after role/state and Figma links are approved, rerun the dashboard and attendance routes, then take M03 Team Leave as the next route audit candidate with matched desktop/mobile evidence.
- **WS05 release controller:** **NOT READY / HOLD.** Main source `4cc2661` and test tree `4cebe84` passed runs 39420943283/39422238862, with current development tip `fe83696` docs-only; these runs do not refresh frozen Main RC #38 or production. Candidate PR #6 `530c2de` has no workflow/status result; run 39419429848 at `9c61a3c` failed CA11-04 after CA10/12/13 markers. Candidate production remains public-only, hosted role/tenant acceptance is not established, and WS05 still lacks database snapshot/restore proof. PR #44 records target `4cc2661` versus API base `1714a08` and its clean merge-tree only for those recorded inputs. Keep Main PR #38 and Candidate PR #5 in DRAFT/HOLD; no merge or deploy follows from this audit.

This audit is docs-only. It performed no production writes, application changes, merges, or deployments. See [`HRIS_Figma_Parity_Matrix_2026-10-20.csv`](HRIS_Figma_Parity_Matrix_2026-10-20.csv) for each route/frame status, evidence pointer, owner, and next action.

## UX-00 live source-backed state inspection — 2026-10-21

**Provenance:** Read-only direct Figma Plugin API inspection of approved file `XEXLe9J1oATlITS9I5u1P9`, page `0:1`; source checked in current Main development branch `2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc`, file `src/live/LiveHrisWorkspace.tsx`. This is an **evidence update**, not UI implementation or visual certification.

| Verified Figma state/node | Source-visible canonical labels | Source mapping / next audit |
| --- | --- | --- |
| Attendance report `17:28320` (1920×1117) | Attendance Report, search, Download Report, Name, Team Name, From date, To date, Office Hour, Work Hour, Deviation | Candidate `PageId:attendance` through `LiveHrisWorkspace`. Compare signed-in manager route, data columns and responsive table. **UNMAPPED role/state/viewport, not a parity FAIL.** |
| Attendance request `17:29937`, bulk `17:30342`, approved `17:30766`, rejected `17:31148` (all 1920×1080) | Attendance Requests, Date, Applying Date, Remarks, Action, approved/rejected state | Match workflow state/authorization and selection/bulk behavior before design changes; do not invent approval API. **BLOCKED**. |
| Leave request `17:31769`, bulk `17:32168`, approved `17:32584`, rejected `17:32957` (all 1920×1080) | Leave Requests, Applicable From, Applicable To, Leave Type, Applying Date, Remarks, Action, approved/rejected state | Candidate `PageId:leave`. Source also contains calendar and leave policy, so **preserve** existing features while resolving exact role/state/fields. **BLOCKED**. |
| Employee application `265:48972` (1920×1080) | New Applications, Employee Requisition Requests, Employee Referral Requests, Personal Self Service History | **Main employee self-service** candidate, **not** approved Candidate portal `?view=apply` screen. Keep Candidate Figma correspondence **UNKNOWN**, not PASS or FAIL. |

**Important correction in the trace:** the visible heading inside node `17:28320` reads **Attendance Report**, despite its frame layer name being `attendance information`. Do not mark the implemented Attendance Report heading a Figma mismatch based only on the frame-layer name.

**Actionable UX-00 packets (non-overlapping):**
- **UXM-00-ATT (WS04 verifier; WS01+WS07 source owners):** extract exact Main `attendance` role/permission and each substate; screenshot 1920/1280/768/375; compare table columns, date filtering, bulk and approval state; record linked acceptance ID and missing API contract.
- **UXM-00-LEAVE (WS04 verifier; WS07+WS08 source owners):** compare leave request/bulk/approved/rejected state one at a time at matched viewport; preserve calendar and policy; no schema/API edits.
- **UXM-00-DASH (WS04 verifier; WS01+WS08 source owners):** map manager `9:22640` / `9:23429` to `PageId:dashboard`, resolve chart measure/denominator with WS02 **before** implementation.
- **WS05 gate:** no release from this evidence; keep Main PR #38 and all production change paths HOLD pending independent acceptance, backup/restore and role/tenant tests.

**Status:** source-backed screen/state candidate mapping progressed, exact visual/functional PASS count **unchanged** (4 geometry only); 1 token mismatch and 56 blocked comparisons remain as previously classified pending a new full matrix review. No screenshot or pixel match asserted.
