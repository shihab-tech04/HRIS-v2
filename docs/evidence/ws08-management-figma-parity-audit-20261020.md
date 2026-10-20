# WS08 Management/Admin Figma route audit — 2026-10-20

**Result: PARTIAL / release evidence hold.** This is a screen-level audit of the implemented Manager routes with the clearest Figma targets. It does not certify any individual story or claim 100% parity. No application, shared-shell, SQL, API, authorization, or SA06 files were changed.

## Audited heads and sources

- PR #44 route audit source code: `work/ws08-management-phase05-20261020` at `f4c44bf52c4041232d591746651ee409ccf8c120`; this report is docs-only evidence on the same branch.
- The fetched Git remote target ref is `development/hris-checkpoints` at `4cc26610c2bd8fc339990cb433d64a6e9c24e15a`. The GitHub PR API separately reports base SHA `1714a08e24f47999618b0127fc818a3d19eb187a`; these checkpoints disagree, so both are recorded. A read-only `git merge-tree` against the fetched target and PR head returned a clean tree. Between the audited source and fetched target, `src/live/LiveHrisWorkspace.tsx` and the three audited browser specs are unchanged. The only change among the checked route/localization paths is one Bengali contact-edit fallback translation in `src/live/project-locale.ts`, unrelated to M/H/A/C/SA. No rebase or merge was performed.
- Canonical register: [`HRIS_1047_Story_Classification_Register_2026-10-20.csv`](https://github.com/shihab-tech04/HRIS-v2/blob/dcdd89ba140cd92ace71130b4eab439525e07594/docs/audit/HRIS_1047_Story_Classification_Register_2026-10-20.csv), pinned at `dcdd89ba140cd92ace71130b4eab439525e07594`.

The pinned register contains 239 WS08 role-scope rows: Manager 90, Head of Department 44, Admin 24, CEO 24, and Super Admin 57. Of these, 232 are `BLOCKED` and seven (`SA01-01`–`SA01-04`, `SA12-01`–`SA12-03`) are `IMPLEMENTED_NOT_CERTIFIED`; none is verified or certified. All `M01`–`M03` rows are blocked with `NO_STORY_LEVEL_EVIDENCE_LOCATED`, and their individual Figma correspondence is unverified. `M03` Team Leave is the next route audit candidate after the dashboard and attendance screens, not an approved story-to-frame certification.
- Approved design file: [Synesis HRIS Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9).

The canonical register marks all `M01`, `M02`, and `M03` story rows `BLOCKED` with `NO_STORY_LEVEL_EVIDENCE_LOCATED`; it also says their individual Figma correspondence is unverified. The frame associations below are therefore **semantic screen candidates**, based on visible screen names and content, not canonical story-to-frame certification.

## Screen/route-to-frame register

| Implemented route and source | Candidate story IDs | Figma target nodes | Desktop evidence | Mobile evidence | Audit status |
|---|---|---|---|---|---|
| `dashboard` → Managerial Dashboard in `src/live/LiveHrisWorkspace.tsx` | `M01-01`–`M01-07` — Team Dashboard | `9:22640` Managerial Dashboard, 1920×1080; `9:23429` filtered state, 1920×1080 | Existing synthetic capture: [`managerial-dashboard-desktop-20261015.png`](managerial-dashboard-desktop-20261015.png), 1440×1853 full page | Existing synthetic capture: [`managerial-dashboard-mobile-20261015.png`](managerial-dashboard-mobile-20261015.png), 375×2520 full page | Semantic match. Historical screenshots are not an exact-PR-head, matched-viewport recapture. See observed differences below. |
| `attendance` → `AttendanceReport` in `src/live/LiveHrisWorkspace.tsx` | `M02-01`–`M02-06` — Team Attendance | `17:28320` Attendance Information, 1920×1117; `17:29937` Attendance Requests; `17:30342` bulk state; `17:30766` approval state; `17:31148` rejection state (the latter four 1920×1080) | Existing synthetic capture: [`attendance-information-desktop-20261016.png`](attendance-information-desktop-20261016.png), 1440×1000 | Existing synthetic capture: [`attendance-information-mobile-20261016.png`](attendance-information-mobile-20261016.png), 375×1189 | Candidate match only. The source route is permission-shared (`attendance.view` / `attendance.manage`), and the Figma screen is presented inside the wider Attendance & Leave management area. Story ownership and individual mapping remain unverified. |
| `leave` → `LeaveWorkspace` in `src/live/LiveHrisWorkspace.tsx` | `M03-01`–`M03-07` — Team Leave | `17:31769` Leave Requests; `17:32168` bulk state; `17:32584` approved state; `17:32957` rejected state (all 1920×1080) | **No current-head app screenshot.** The synthetic browser test exists at `tests/browser/manager-leave.spec.ts`, but could not launch in this executor. | **No current-head app screenshot.** The Figma file has no populated mobile counterpart for this route. | Source-level comparison only; runtime and visual parity are blocked. Route is permission-shared (`leave.view` / `leave.manage`). |

The inspected Figma page contains no clearly named HOD, Admin, CEO, or Super Admin screen target. This is an **unmapped design/traceability state**, not proof that those features are absent or defective. Node `377:37834` is an empty 416×2321 frame; its screenshot is blank and its metadata has no child content. It is not a mobile design target. Other portrait nodes are small components, not screen layouts.

## Verified differences and ownership boundaries

These are observed screen differences against semantic candidate frames. Because individual story-to-frame correspondence is unverified in the canonical register, they are not promoted to confirmed story defects.

| Screen | Observed difference | Boundary / next owner |
|---|---|---|
| Managerial Dashboard | Figma node `9:22640` shows a Dashboard header, Personal/Managerial tabs, and an attendance chart scaled 0–100%. Current source renders the workspace-level Managerial Dashboard route and `AttendanceTrend` from daily attendance record counts with a 7/30-day range. The chart's measure and denominator are a data-contract question, not a safe presentation-only edit. | Shared workspace shell/navigation: WS01. Chart measure and server payload: WS01/WS02 review. WS08 made no change. |
| Attendance Information | Figma `17:28320` shows `Team Name` and no `Work hours` column. The existing synthetic screen capture shows `Work hours` and no `Team Name`; the app heading is `Attendance Report` rather than `Attendance Information`. | `AttendanceReport` is permission-shared and overlaps HR Operations. WS07/WS01 should confirm route ownership, role variant, and exact approved fields before any UI edit. |
| Leave Requests | Figma `17:31769` shows Name, Applicable From, Applicable To, Leave Type, Applying Date, Remarks, and Action, with row selection; the approval state is separately shown at `17:32584`. Current `LeaveWorkspace` source renders Employee, Leave type, From, To, Days, Status, optional Evidence, and Actions, with no row-selection control. It also includes a team leave-coverage calendar and tenant leave-policy UI. | Permission-shared `leave.view` / `leave.manage` route. Preserve the implemented calendar, decision notes, and policy behavior. WS07/WS01 should confirm whether the Figma frame is the applicable manager state and settle the approved table fields before edits. |

The current Managerial Dashboard and Attendance captures show responsive layouts at 375 px, but Figma does not provide corresponding mobile screens. Existing tests assert mobile overflow/scroll behavior; those browser assertions were not re-run in this audit. No mobile parity claim is made.

## Next route audit candidate and exact story evidence

The next in-scope screen sequence is `M03` Team Leave. Source and existing tests show implementation paths related to:

- `M03-01` see team leave requests — `LeaveWorkspace` loads and renders the authorized request list.
- `M03-02` assess coverage — the route contains an approved-absence calendar; no fresh browser evidence was produced for manager coverage decisions.
- `M03-03` approve leave — the route gates actions on `leave.manage` and calls the existing leave-decision RPC.
- `M03-04` reject with a reason — the route has a reason-entry decision flow.
- `M03-05` forward/escalate — no such control was located in this route; this is not a finding that the feature is absent elsewhere.
- `M03-06` approved team leave calendar — the route renders a calendar from approved absence data.
- `M03-07` restrict confidential supporting data — not certified here; role-specific access and evidence-download denial require isolated authorization tests.

The focused browser suite could not execute any page assertions: Playwright's Chromium executable is missing at `/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`. The eight selected browser cases stopped at launch, so they are **blocked**, not application test failures or passes. No browser screenshot is claimed from this run.

## Verification and release disposition

- `npm run lint`: **PASS**.
- Focused contract tests (SA06 readiness, live workspace, attendance report, leave decision notifications): **33/33 PASS**. These are source/contract checks and do not establish visual parity or hosted role acceptance.
- `git diff --check`: **PASS** for this evidence change.
- Manager dashboard, attendance, and leave Playwright cases: **BLOCKED before page launch** by missing Chromium; fresh desktop/mobile proof unavailable.
- Production data/schema writes: none. Merge and deployment: none. SA06 evidence and blocked status remain unchanged.

**WS04:** use this as an evidence matrix and keep M01–M03 story certification blocked pending exact-head, role/state, and responsive runtime evidence plus confirmed story-to-frame correspondence.

**WS05:** retain release hold for this scope. The report documents unresolved design/route ownership and data-contract differences; no 100% parity or release-readiness claim is supported.
