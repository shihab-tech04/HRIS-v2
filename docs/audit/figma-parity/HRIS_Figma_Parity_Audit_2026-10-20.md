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
| Main development | `development/hris-checkpoints` `3f6ea22eb0b7f0e4b4424552694e92652116c196` | Current-head disposable run [39418704906](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418704906) failed 2 of 384 HR01-01 checks; 382/384 passed. Runner probe [39418704923](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418704923) and Phase 2A [39418705013](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39418705013) passed. The diff from prior app checkpoint `f02ae03` contains docs/tests only; no `src/` files changed. |
| Candidate production branch | `main` `38174c7b607999f951c7eea47aefaa443735080e` | Public-only page observed. |
| Candidate PR #6 | `work/candidate-phase06-07-20261020` `709760cc5bc91e6d5c62179f62dfe32e92a1fac6` | Latest run [39418609374](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39418609374) failed at CA11-04 PDF text extraction. CA10 5/5, CA12 4/4 and CA13 5/5 markers emitted before failure. Prior full pass [39396693408](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39396693408) ran on `04f1054`; the two later commits changed tests only. Neither disposable run is hosted acceptance or Figma certification. |

The latest Main exact-head failures concern synthetic disposable setup for HR01-01: authorization and activation checks failed their expected outcomes. The Candidate failure is in the CA11-04 PDF text assertion: extracted text contains profile content but with split fragments, so the app-vs-extractor outcome requires WS03 review. These are routed in the story audit ledger; they do not change the parity-row count.

## WS08 management route evidence

[WS08 PR #44](https://github.com/shihab-tech04/HRIS-v2/pull/44) is open as a draft at evidence head `d07c2ebedade943f39482cc6bc603c417d797c0c`. Its [route audit report](https://github.com/shihab-tech04/HRIS-v2/blob/d07c2ebedade943f39482cc6bc603c417d797c0c/docs/evidence/ws08-management-figma-parity-audit-20261020.md) is scoped to management routes. The pinned WS08 register has 239 rows (M 90 / H 44 / A 24 / C 24 / SA 57): 232 `BLOCKED`, seven `IMPLEMENTED_NOT_CERTIFIED` (`SA01-01`–`SA01-04`, `SA12-01`–`SA12-03`), and none verified/certified. Its 239 rows remain separate from the 1,047-ID ledger below. All M01–M03 stories remain blocked; the frame links here are semantic candidates only.

| WS08 scope | Implemented route and candidate frames | Observed evidence and current status |
|---|---|---|
| M01 Team Dashboard | `dashboard` / Managerial Dashboard; Figma `9:22640`, filtered state `9:23429` | Historical synthetic desktop/mobile captures exist, but are not exact-head recaptures. The frame shows Dashboard header, Personal/Managerial tabs, and an attendance chart scaled 0–100%; current source uses daily attendance record counts with a 7/30-day range. Measure/denominator and role-state mapping remain open. **BLOCKED.** |
| M02 Team Attendance | `attendance` / `AttendanceReport`; Figma `17:28320` plus Requests, bulk, approval, and rejection states `17:29937`, `17:30342`, `17:30766`, `17:31148` | Figma uses `Attendance Information` and `Team Name`; the historical synthetic app capture uses `Attendance Report` and `Work hours`. `attendance.view` / `attendance.manage` share the route. Owner and approved fields are unresolved; no exact-head matched route capture. **BLOCKED.** |
| M03 Team Leave | `leave` / `LeaveWorkspace`; Figma `17:31769` plus bulk/approved/rejected states `17:32168`, `17:32584`, `17:32957` | Figma shows selection and Name / Applicable From / Applicable To / Leave Type / Applying Date / Remarks / Action. Current source shows Employee / Leave type / From / To / Days / Status / Evidence / Actions and also a team coverage calendar and tenant leave-policy UI. Preserve existing behaviors pending owner confirmation. **BLOCKED; next route audit candidate.** |

The reviewed WS08 frames are desktop compositions. No populated mobile counterpart was found. Existing M01/M02 screenshots are historical, while M03 has no current-head screenshot. Eight focused Playwright cases were blocked before page launch because Chromium was unavailable, so WS08 has no fresh responsive proof for these routes. Local lint and 33/33 focused contracts passed on the unchanged app/test tree; the current PR head has no GitHub workflow/status checks. These results do not establish route behavior, mobile parity, or story certification.

WS08 reports a remote `development/hris-checkpoints` target of `3f6ea22eb0b7f0e4b4424552694e92652116c196` and a PR API base of `1714a08e24f47999618b0127fc818a3d19eb187a`. The checkpoint discrepancy remains open; no rebase or merge is claimed.

## Figma correspondence

The approved file exposes one page and 314 top-level frames. Reviewed candidates include the employee Dashboard frame `3:39433`, employee profile `66:72042`, attendance `66:43832`, personal leave `3:39880`, Employee Referral Form `86:36224` (with Upload Resume/CV child node `86:36267`), and employee self-service New Application `265:48972`. None has an exact canonical story-ID link. The referral and New Application frames are employee self-service and are not Candidate portal designs. No approved Candidate CV Builder/parser, My Applications, interview, offer, or preboarding screen mapping was found. No approved mobile mapping was found for the reviewed routes.

The Main development source enumerates role-gated `PageId` screens. The Candidate source enumerates 13 `?view=` screens. Those route lists and reviewed Figma frame records are itemized in the companion CSV. Main frame pairings, including the WS08 management frames and employee `my-dashboard` / `my-leave` frames, are plausible candidates only; they remain BLOCKED because the same deployed route, role/state, and approved viewport pair could not be established.

## Desktop/mobile geometry

At `1280x900`, the live Main page document measured 1274px wide and Candidate measured 1265px. At `375x812`, Main measured 369px (including the workspace, Employee View, and Admin View samples) and Candidate measured 360px. Both rendered Poppins and showed no horizontal overflow. These PASS rows verify fit only; no matching Figma frame was available to determine visual parity.

## Confirmed mismatch

Figma's primary style reads `#08558B` (`rgb(8, 85, 139)`). Main and Candidate source tokens are `#085587`, and the live primary buttons resolve to `rgb(8, 85, 135)`. The exact token comparison **FAILS**. WS01 and WS03 should confirm the canonical value with the design owner and record the correction in their scoped design/source work. WS04 made no app changes.

## Status interpretation

- **PASS (4):** responsive width/overflow checks on the sampled live Main and Candidate pages only.
- **FAIL (1):** exact primary-color token mismatch.
- **BLOCKED (56):** no exact, approved route → role/state → Figma-frame match for the enumerated source routes/frames, WS08 M01–M03 have semantic mappings only and no fresh responsive proof, or Candidate production remains public-only. No route-level visual FAIL is asserted where the compared route/state could not be established.

## Owner routing and release readiness

- **WS01 Main:** confirm primary token; map `my-dashboard`, attendance, leave and other Main PageIds to approved frames and the intended roles; investigate the current HR01-01 test blocker in run 39418704906.
- **WS03 Candidate:** confirm primary token; map the 13 Candidate routes to approved frames or record a no-screen rationale; investigate CA11-04 at exact PR #6 head `709760c` after run 39418609374 failed.
- **WS06 Employee:** validate employee-profile, attendance, and personal-leave frame assignments after a true employee identity/session is available.
- **WS07/WS01 management routes:** confirm M02 attendance ownership/approved columns, M03 leave state and approved fields, and M01 chart measure/denominator before any UI change; preserve existing calendar and policy behavior pending the contract decision.
- **WS08:** keep M01–M03 blocked; after role/state and Figma links are approved, rerun the dashboard and attendance routes, then take M03 Team Leave as the next route audit candidate with matched desktop/mobile evidence.
- **WS05 release controller:** **NOT READY / HOLD.** Main exact-head disposable workflow fails 2/384 HR01-01 checks, Candidate exact-head disposable workflow fails CA11-04, Candidate production remains public-only, production role/tenant acceptance is still not established, and the WS05 ledger still lacks database snapshot/restore proof. Keep Main PR #38 and Candidate PR #5 in DRAFT/HOLD; do not merge or deploy based on this audit.

This audit is docs-only. It performed no production writes, application changes, merges, or deployments. See [`HRIS_Figma_Parity_Matrix_2026-10-20.csv`](HRIS_Figma_Parity_Matrix_2026-10-20.csv) for each route/frame status, evidence pointer, owner, and next action.
