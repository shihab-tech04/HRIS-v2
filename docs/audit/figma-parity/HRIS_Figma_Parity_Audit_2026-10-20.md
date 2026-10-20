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
| Main development | `development/hris-checkpoints` `4cc26610c2bd8fc339990cb433d64a6e9c24e15a` | Latest completed disposable run [39419736772](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39419736772) at predecessor `c095cfdb` failed one HR01-01 activation check (383/384 passed; SQLSTATE 23502 because `employees.id` was null). Earlier run 39418704906 at `3f6ea22` failed two HR01-01 checks. Current `4cc2661` adds a candidate-activation employee-ID migration and contract/runner changes; no workflow/status checks exist at the current head. |
| Candidate production branch | `main` `38174c7b607999f951c7eea47aefaa443735080e` | Public-only page observed. |
| Candidate PR #6 | `work/candidate-phase06-07-20261020` `530c2de1ca12665051a3c617f593df1edba2d11b` | Latest run [39419429848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39419429848) at exact PR head `9c61a3c` emitted CA10 5/5, CA12 4/4 and CA13 5/5, then failed CA11-04 on PDF text extraction. The run checked out Main at `3f6ea22`, behind current Main `4cc2661`. After `9c61a3c`, the current head adds one `InterviewsPage.tsx` change and later application/interview test edits; the latest `c2117b7` → `530c2de` commit changes only the application/interview test locator; CA10 parser/CVBuilder and CA12/13 source paths are unchanged, but current head has no workflow/status result. The earlier full pass at `04f1054` predates the `d410cf1` CVBuilder change. None of these disposable results is hosted acceptance or Figma certification. |

The latest completed predecessor runs failed HR01-01 at Main `c095cfdb` (383/384 passed) and CA11-04 at Candidate `9c61a3c`; current heads Main `4cc2661` and Candidate `530c2de` have no workflow/status result. Main `4cc2661` adds an unrun candidate-activation employee-ID migration. Candidate run `39419429848` emitted direct CA10 5/5, CA12 4/4 and CA13 5/5 markers before CA11-04 failed. These findings are routed in the separate story ledger; they do not change the parity-row count.

## WS08 management route evidence

[WS08 PR #44](https://github.com/shihab-tech04/HRIS-v2/pull/44) is open as a draft at evidence head `d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db`. Its [final route audit report](https://github.com/shihab-tech04/HRIS-v2/blob/d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db/docs/evidence/ws08-management-figma-parity-audit-20261020.md) is scoped to management routes. The report records fetched development tip `4cc26610c2bd8fc339990cb433d64a6e9c24e15a` and API base `1714a08e24f47999618b0127fc818a3d19eb187a`; the discrepancy remains explicit. A read-only `git merge-tree` against the fetched target and PR head returned a clean tree. The audited Manager route source and three browser specs are unchanged; the only change among checked route/localization paths is an unrelated Bengali contact-edit fallback translation. The pinned WS08 register has 239 rows (M 90 / H 44 / A 24 / C 24 / SA 57): 232 `BLOCKED`, seven `IMPLEMENTED_NOT_CERTIFIED` (`SA01-01`–`SA01-04`, `SA12-01`–`SA12-03`), and none verified/certified. Its 239 rows remain separate from the 1,047-ID ledger below. All M01–M03 stories remain blocked; the frame links here are semantic candidates only.

| WS08 scope | Implemented route and candidate frames | Observed evidence and current status |
|---|---|---|
| M01 Team Dashboard | `dashboard` / Managerial Dashboard; Figma `9:22640`, filtered state `9:23429` | Historical synthetic desktop/mobile captures exist, but are not exact-head recaptures. The frame shows Dashboard header, Personal/Managerial tabs, and an attendance chart scaled 0–100%; current source uses daily attendance record counts with a 7/30-day range. Measure/denominator and role-state mapping remain open. **BLOCKED.** |
| M02 Team Attendance | `attendance` / `AttendanceReport`; Figma `17:28320` plus Requests, bulk, approval, and rejection states `17:29937`, `17:30342`, `17:30766`, `17:31148` | Figma uses `Attendance Information` and `Team Name`; the historical synthetic app capture uses `Attendance Report` and `Work hours`. `attendance.view` / `attendance.manage` share the route. Owner and approved fields are unresolved; no exact-head matched route capture. **BLOCKED.** |
| M03 Team Leave | `leave` / `LeaveWorkspace`; Figma `17:31769` plus bulk/approved/rejected states `17:32168`, `17:32584`, `17:32957` | Figma shows selection and Name / Applicable From / Applicable To / Leave Type / Applying Date / Remarks / Action. Current source shows Employee / Leave type / From / To / Days / Status / Evidence / Actions and also a team coverage calendar and tenant leave-policy UI. Preserve existing behaviors pending owner confirmation. **BLOCKED; next route audit candidate.** |

The reviewed WS08 frames are desktop compositions. No populated mobile counterpart was found. Existing M01/M02 screenshots are historical, while M03 has no current-head screenshot. Eight focused Playwright cases were blocked before page launch because Chromium was unavailable, so WS08 has no fresh responsive proof for these routes. Local lint and 33/33 focused contracts passed on the unchanged app/test tree; the current PR head has no GitHub workflow/status checks. These results do not establish route behavior, mobile parity, or story certification.

WS08 reports fetched live development target `4cc26610c2bd8fc339990cb433d64a6e9c24e15a` and PR API base `1714a08e24f47999618b0127fc818a3d19eb187a`. Its read-only merge-tree check is clean, while the reference discrepancy remains open; no rebase or merge is claimed.

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

- **WS01 Main:** confirm primary token; map `my-dashboard`, attendance, leave and other Main PageIds to approved frames and intended roles; investigate HR01-01 activation failure in predecessor run 39419736772 at `c095cfdb` (383/384 pass) and rerun current Main head `4cc2661` after its untested migration.
- **WS03 Candidate:** confirm primary token; map the 13 Candidate routes to approved frames or record a no-screen rationale; investigate CA11-04 failure at run 39419429848 on predecessor `9c61a3c`, preserve CA10 5/5 direct evidence from that same run, and verify the current PR #6 head `530c2de`, which has no workflow/status result and adds an InterviewsPage source change.
- **WS06 Employee:** validate employee-profile, attendance, and personal-leave frame assignments after a true employee identity/session is available.
- **WS07/WS01 management routes:** confirm M02 attendance ownership/approved columns, M03 leave state and approved fields, and M01 chart measure/denominator before any UI change; preserve existing calendar and policy behavior pending the contract decision.
- **WS08:** keep M01–M03 blocked; after role/state and Figma links are approved, rerun the dashboard and attendance routes, then take M03 Team Leave as the next route audit candidate with matched desktop/mobile evidence.
- **WS05 release controller:** **NOT READY / HOLD.** Current Main `4cc2661` and Candidate PR #6 `530c2de` have no workflow/status results. Latest completed predecessor runs failed HR01-01 activation at `c095cfdb` (383/384 passed) and CA11-04 at `9c61a3c`; the latter emitted CA10 5/5, CA12 4/4 and CA13 5/5 markers. Main adds an unrun candidate-activation migration; Candidate production remains public-only; hosted role/tenant acceptance is not established; and the WS05 ledger lacks database snapshot/restore proof. Keep Main PR #38 and Candidate PR #5 in DRAFT/HOLD; do not merge or deploy based on this audit.

This audit is docs-only. It performed no production writes, application changes, merges, or deployments. See [`HRIS_Figma_Parity_Matrix_2026-10-20.csv`](HRIS_Figma_Parity_Matrix_2026-10-20.csv) for each route/frame status, evidence pointer, owner, and next action.
