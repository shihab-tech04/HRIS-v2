# WS04 independent Figma parity report — attendance, leave, and workstation updates — 21 October 2026

## Executive result

Current Main source: PR #49 at 2e24564c837509e12b4cbc69f8b6295cda066c0b. Its exact-head browser workflow 39553849299 passed and produced current screenshot evidence.

| Exact target | Current result | Scope |
|---|---|---|
| Attendance Information root [17:28320](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-28320) | **FAIL** | Main screenshot is at the matching 1920×1117 viewport and selected Attendance Information state. The main content adds a correction-request panel, changes the attendance table fields, and adds a Search action button. |
| Aggregate Attendance Report child [17:28321](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-28321) | **PASS, limited** | Measured child-state geometry, controls, nine column labels, header typography, and row spacing match the stated checks. This does not certify the root frame. |
| Leave Requests [17:31769](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31769) | **FAIL, table structure** | The screenshot shows a different set of leave-request columns and surrounding panels. The capture is scrolled to the table, so full-page vertical placement is not certified. |
| Attendance request states [17:29937, 17:30342, 17:30766, 17:31148] | **BLOCKED** | Attendance Requests remains disabled pending accepted mapping/API state; there is no matched screenshot for these states. |
| Leave workflow states [17:32168, 17:32584, 17:32957] | **BLOCKED** | No approved state-to-frame mapping or exact-head state screenshots. |
| Main mobile/tablet pixel parity | **NOT_APPLICABLE** | No approved mobile/tablet Figma counterparts are verified. Main responsive behavior is checked separately below. |
| Candidate public Careers | **NOT_APPLICABLE** | Current Candidate register says no approved Candidate frame exists. The latest Candidate source has no verified exact-head screenshot artifact yet. |

Two visual failures are confirmed in the mapped Main routes. Role-specific navigation, fixture content, and unavailable Candidate frames/data are recorded separately; they are not treated as design defects.

## Source and screenshot provenance

Approved design file: [Synesis HRIS Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9).

| Work | Latest verified source |
|---|---|
| WS04 branch before this report update | PR #45, head be185fef98bc2191b454e738731e57b40cb7d64d |
| WS01 Main | PR #49, head 2e24564c837509e12b4cbc69f8b6295cda066c0b |
| WS03 Candidate | Candidate repo PR #8, head 28260cdf73b0af312df4cf136b61942f5363b573 |
| WS06 Employee | PR #42, head fe1ccf111111f3a08522c619c15e28b5290a160e |
| WS07 HR | PR #43, head 40af3e9f727a5ce64281ba39b0847853791dbf2a |
| WS08 management | PR #44, head d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db |

### Main PR #49 current artifact

Exact-head browser workflow [39553849299](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39553849299) completed successfully. Artifact 12324489001, main-figma-ui-browser-evidence, SHA-256 1ebabfa7e316ca68c88fb6344582daf55934ff407926cf648dfffd7d7f25d05e. The screenshots are synthetic authorized-session renders; they are not hosted production identity or tenant acceptance.

| Artifact screenshot | Route/state, viewport | SHA-256 |
|---|---|---|
| docs/evidence/ws01-shell/attendance-en-1920.png | Main / → Attendance → Attendance Information; clean initial state; 1920×1117 | f7156b9d8a3104fa87a19c2fd8e45b144d1ec4f5e9131ce6bf09156e7dacd456 |
| docs/evidence/attendance-report-desktop-20261016.png | Main reportOnly aggregate state; full-page image 1920×1117 | 95c197f0e035bb8d134738447f66667b50e9311e6ec89ce24c4567a50c4e0b2f |
| docs/evidence/ws01-shell/leave-en-1920.png | Main / → Leave; table scrolled into view; 1920×1117 | 043868ea1d4e56da8074c09d769f58c3be70ca6b15c2ce9dfc171ee0ef5b9b95 |
| docs/evidence/ws01-shell/attendance-en-375.png | Attendance Information; 375×812 | 3bbbf7fdce098bf03714abe2efb50e223b689c62920911113462f24206cd8a8e |

The artifact also includes English attendance captures at 1920, 1280, 768, and 375; Bengali attendance captures at the same widths; and English Leave captures at those four widths. The Playwright run checks no document-level horizontal overflow at each width. At 375, the attendance table is explicitly horizontally scrollable. The Leave captures are taken after the test calls scrollIntoViewIfNeeded on the leave table; they establish the rendered table state, not a clean top-of-page screenshot. Figma has no approved populated mobile or tablet counterpart, so these are behavior checks, not pixel-parity passes.

### Candidate PR #8 current evidence boundary

Current head is 28260cdf73b0af312df4cf136b61942f5363b573. The current PR body says exact-head UI workflow run 8 is pending. The last independently verified screenshot artifact is run 39551170035 at predecessor 795db5117401a6404e37e164b23bcf12a06a6073; it must not be attributed to the new head. The new Candidate Figma screen register at the current head records NO_APPROVED_FRAME for public Careers and authenticated Candidate journeys. Therefore Candidate Figma parity is NOT_APPLICABLE until an approved Candidate frame or written specification exists; current exact-head render evidence is BLOCKED pending run 8.

## Exact frame comparison

### Attendance Information root — FAIL

Figma node 17:28320 is 1920×1117. The current attendance-en-1920 capture is the same viewport and the same selected tab, using a synthetic authorized manager session.

Confirmed visual differences in the main content:

- Figma shows the attendance report controls followed by the attendance-information table. The app inserts an “Attendance correction requests” card with two synthetic rows between the controls and the main table, pushing the table below the location shown in Figma.
- Figma table columns are Name, Designation, Team Name, Department, From date, Work Location, In Time, Out Time, and Status. The app uses Name, Designation, Team Name, Department, Date, Work location, In time, Out time, Work hours, and Status. “From date” is relabeled “Date,” and “Work hours” is an additional column.
- Figma shows a search field, Download Report, and filter icon. The app adds a separate Search button and uses a text Filters button.
- Figma’s top-left mark is the Synesis IT wordmark and icon. The app shows a text-only SYNESIS / HRIS 360° lockup. This is a visible shell mismatch.
- The Figma sample has eight rows and profile images; the test fixture has two synthetic rows and initials. Row count and missing real profile data are not counted as defects.

The side-shell geometry assertions pass at desktop: 72px header, 111px sidebar, 42px icon target, and 14px navigation label. The visible sidebar labels differ from Figma; treat that difference as **BLOCKED for role mapping**, because the Figma frame does not identify the role and the synthetic session is permission-scoped. The Figma badges showing “99” are sample counts; the app omits unsupported counts. Do not add fabricated badges.

### Aggregate Attendance Report child — PASS, limited

Figma node 17:28321 is 1386×833 at x=320,y=252 within the root. The exact-head reportOnly screenshot shows the aggregate report state.

The exact-head Playwright checks assert report area x=320 and width=1386; search/download/filter widths 334/184/64px; 59px table header; 6px aggregate row gap; header typography 14px, weight 400, rgb(158,158,158); and the nine labels Name, Designation, Team Name, Department, From date, To date, Office Hour, Work Hour, Deviation. These checks and the screenshot agree with the child frame. The synthetic report has two rows while Figma shows eight sample rows; fixture data is not a defect.

This PASS is limited to the child report state and measured attributes. It does not certify the full Attendance Information root, every font or spacing token, role-specific navigation, hosted data, or production identity.

### Leave Requests — FAIL for table structure; full-page position blocked

Figma node 17:31769 is 1920×1080. The current screenshot is 1920×1117 on Main / → Leave Requests after the test scrolls the request table into view. It is a real exact-head screenshot, but not a clean top-of-page capture.

Figma table fields are Name, Applicable From, Applicable To, Leave Type, Applying Date, Remarks, and Action, with row-selection checkboxes and approve/reject icons. The app request table shows Employee, Leave type, From, To, Days, Status, Evidence, and Actions. The app therefore omits Applying Date and Remarks, adds Days/Status/Evidence, and does not show the Figma row-selection checkbox pattern. The app also displays leave-type policy controls above and organization-holiday content below the request list; these are not present in the target frame. The app has four synthetic rows versus eight Figma sample rows; row count and values are fixture data, not defects.

The table structure is a **FAIL** against the mapped frame. Because the screenshot is scrolled, header/sidebar alignment and full-page vertical composition remain **BLOCKED** pending a clean screenshot at scroll top. Approval/rejection behavior is tested with synthetic fixtures; open dialog visual states have no matched frame screenshot and remain blocked.

## New implementation review by workstation

| Owner | Current work | Parity disposition |
|---|---|---|
| WS03 | Candidate PR #8 adds local Bengali font fallback, public-only Save/Apply gating, current frame register, and expanded EN/BN/browser coverage. Current register explicitly finds no approved Candidate frame. | Figma parity **NOT_APPLICABLE**; exact-head screenshot evidence **BLOCKED** until run 8 artifact is available. Prior run 7 screenshots belong to the predecessor SHA only. |
| WS06 | PR #42 adds a presentational employment information component with designation, department, manager, work location, grade, and employment type. The component is unmounted pending server-checked tenant RPC and Auth acceptance. | **BLOCKED**; no rendered route or approved exact frame mapping to compare. |
| WS07 | PR #43 is docs/contracts and HR03 evidence. Its audit says candidate node 86:36133 is a Department Lists dropdown specimen, not the existing Org Structure or Teams screen; no approved mapping is claimed. | **NOT_APPLICABLE** to the attendance/leave comparison. HR03 screen parity remains **BLOCKED** by the missing mapping. |
| WS08 | PR #44 is docs/contracts only. M03 Team Leave remains a semantic route candidate with no verified story-to-frame link or exact-head screenshot. | **BLOCKED**. |

## Other state, token, and release dispositions

- Attendance Requests frame states remain blocked. The app disables Attendance Requests pending API/state mapping. This is an authorization/API restriction; no visual defect is assigned to the disabled state until its approved frame and role are mapped.
- Leave workflow states remain blocked because no matched visual state captures were produced.
- Responsive behavior: Main exact-head run passes no-document-overflow checks at 375, 768, 1280, and 1920. Attendance table horizontal scrolling is checked at 375. Leave table horizontal/keyboard usability is not directly asserted, so only the document-overflow check is certified there.
- Mobile/tablet Figma pixel parity is NOT_APPLICABLE where no approved counterpart exists.
- The original 61-row ledger was 4 PASS / 1 FAIL / 56 BLOCKED. Reclassify the one color FAIL as BLOCKED / reference conflict: the approved design foundation and current src/index.css designate #085587; Figma #08558B is explicitly not authoritative pending an approved token change. The corrected disposition of the same 61 rows is 4 PASS / 0 FAIL / 57 BLOCKED. New frame results above are supplemental, not added to that count.
- Candidate’s CI unconfigured-data error in predecessor run 7 was an unavailable service state, not an interface defect. It is not current-head evidence.
- The live Main app showed an authorization sign-in gate. No credentials were entered; no hosted identity or production data is claimed.

## Action packets

- **WS01:** Keep the correction workflow behind its accepted Attendance Requests mapping; the Attendance Information frame should show the target table directly after its report controls. Align the attendance field set and toolbar to node 17:28320. For Leave Requests, map the table to the approved columns and row-selection/action pattern in node 17:31769; map policy and holiday panels to their own screen/state rather than placing them in this frame. Restore the approved logo asset or document the authorized alternate. Capture the Leave root at scroll top after the mapping change. Do not add the sample “99” counts.
- **WS07:** Confirm manager attendance/leave field semantics and the accepted API fields for From date, Applying Date, Remarks, and leave evidence. Keep calendar/policy behavior intact while confirming which target frame owns it.
- **WS08:** Confirm whether node 17:31769 is the M03 Team Leave frame and record an approved mapping or explicit no-screen rationale.
- **WS03:** Attach the exact-head run 8 screenshots when available. Keep Candidate parity as NO_APPROVED_FRAME until a Candidate design source or written visual specification is approved.
- **WS06:** Link the employment panel to its exact Employee frame/route and capture only after the tenant RPC/Auth gates pass.
- **WS05:** Release remains **NOT READY / HOLD**. This report is visual QA, not hosted identity, tenant, database-recovery, merge, or deployment approval.

No application code, production data, permissions, merge, or deployment was changed by this audit.
