# WS04 independent parity supplement — attendance, leave, and workstation updates — 21 October 2026

## Release-review disposition

**Full attendance-information and leave-screen parity is not certified.** One measured Figma child state passes a limited report-subframe check; the attendance root and leave screen remain blocked because the rendered state does not map unambiguously to the target frames and the captures do not match the required viewport/state. No actual attendance or leave UI defect is confirmed from this evidence.

This supplement covers only the first attendance/leave slice of the approved workload (74 desktop-sized frame/states, 40 distinct labels, 13 component-board specimens). It does not certify the other frames or update the 1,047-story ledger.

## Verified source and evidence

| Work | Verified source |
|---|---|
| WS04 audit branch before this supplement | PR [#45](https://github.com/shihab-tech04/HRIS-v2/pull/45), head b0d1c2c6a822be45449d1b047c34b8f1ae379f27 |
| Main attendance implementation | PR [#49](https://github.com/shihab-tech04/HRIS-v2/pull/49), head ed400c05397faca0ff4c568927871a6813071238 |
| WS03 public Candidate view | Candidate repo PR [#8](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/8), head 795db5117401a6404e37e164b23bcf12a06a6073 |
| WS06 Employee work | PR [#42](https://github.com/shihab-tech04/HRIS-v2/pull/42), head fe1ccf111111f3a08522c619c15e28b5290a160e |
| WS07 HR work | PR [#43](https://github.com/shihab-tech04/HRIS-v2/pull/43), head 40af3e9f727a5ce64281ba39b0847853791dbf2a |
| WS08 management work | PR [#44](https://github.com/shihab-tech04/HRIS-v2/pull/44), head d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db |

### Main PR #49 visual evidence

The exact-head browser workflow [39550584330](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39550584330) succeeded. Artifact: main-figma-ui-browser-evidence, artifact 12323935876, SHA-256 3818af6cc1d97405a05f84b1cec4c184975cf0f9e2db74c52f775bb8f9f8feda. It contains synthetic authorized-session renders, not hosted identity or production acceptance.

| Screenshot in artifact | Route/state and viewport | SHA-256 |
|---|---|---|
| attendance-report-desktop-20261016.png | page=attendance, reportOnly state; 1920×1117 | 6a4b497791d43fdd0d0ec1a989d535351e20c87d41190f9bc93dfb6fba13cd9e |
| attendance-information-desktop-20261016.png | page=attendance after a correction rejection; 1440×1000 | b60c7ff2472f567c8ff2bfbf3a1c13dc7352f674e4eae28519b385bc197da608 |
| attendance-information-mobile-20261016.png | page=attendance after interaction; viewport 375×812, full-page image 375×1255 | 53097549e2766788e0956fbd401937458de61631e98bd851f3e702275e84967c |

The filenames retain 20261016; the artifact was produced by the 2026-10-21 exact-head run. The report-only screenshot contains two synthetic report rows. The 1440 screenshot is post-action and shows a rejection alert and correction table; it is not a clean initial Attendance Information capture.

### Candidate PR #8 visual evidence

The exact-head isolated run [39551170035](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39551170035) succeeded, including the public-only build and browser capture job. Artifact candidate-public-responsive-screenshots, artifact 12323686214, SHA-256 9c560344fc980edf0ba4878678a602a3768124bbca4db9f8fe89046da0971e4d.

| Screenshot | Browser viewport | PNG dimensions | SHA-256 |
|---|---:|---:|---|
| candidate-public-375.png | 375×812 | 375×2311 | 3728aff33afe7c9c7c07df4680b0dc57c31f98afd7185932d861696425966c6c |
| candidate-public-768.png | 768×1024 | 768×2036 | 6948ea22b411c6883ed40f9b4a1f5b45bff37626ede9026516deb2cc026ca3af |
| candidate-public-1280.png | 1280×900 | 1280×1895 | c4c58d89dbf6edadb3135b18b382875dafd14b65ac52a0f4f927e8dd6ee3ea00 |
| candidate-public-1920.png | 1920×1080 | 1920×1895 | e849dbc80cda0af963d4d258b0fac20ec73c29700992cb884b5009bbb21cfd5f |

I independently inspected the 375 and 1280 images. All four widths passed the smoke’s heading/control visibility and no-horizontal-document-overflow checks. These are local preview captures from the exact source head, not deployed screenshots.

## Figma comparisons

Approved file: [Synesis HRIS Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9).

| Target and exact frame | Implementation evidence | Viewport | Result |
|---|---|---:|---|
| Attendance report child state [17:28321](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-28321), 1386×833 at x=320,y=252 within the 1920×1117 attendance root | Main reportOnly render at page=attendance; synthetic fixture | 1920×1117 | **PASS — narrow subframe contract only.** The report region starts at x=320 and is 1386px wide; search, download, and filter widths are 334/184/64px; row gap is 6px; table header is 14px/400/rgb(158,158,158); the nine report column labels match. This passes only those measured geometry, control, label, and header-style checks. It does not certify the full root frame, hosted role, or production data. |
| Attendance Information root [17:28320](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-28320), 1920×1117 | Main page=attendance screenshot is 1440×1000 and captured after a correction rejection. The 1920 capture is a separate reportOnly state. | 1440 vs 1920 target | **BLOCKED.** The root frame shows the attendance-information table, while nested frame 17:28321 shows an Aggregate Attendance Report with different columns. Current evidence does not establish which UI state is intended for the root or whether the subframe is an alternate state. The post-action correction alert/table cannot be compared as a clean root state. |
| Leave Requests [17:31769](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31769), 1920×1080 | The manager-leave browser spec exercises synthetic behavior at 1440×1000 and 375×812 but emits no screenshot. Live Main shows an authorization sign-in gate; no credentials were used. | No matched screenshot | **BLOCKED.** No exact-head visual capture or approved role/state-to-frame mapping is available. |
| Attendance Requests states [17:29937](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-29937), [17:30342](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-30342), [17:30766](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-30766), [17:31148](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31148) | PR #49 marks Attendance Requests aria-disabled while API/state mapping is unresolved. | No matched screenshot | **BLOCKED.** The disabled state is an authorization/API gate, not evidence of a visual defect. |
| Leave workflow states [17:32168](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32168), [17:32584](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32584), [17:32957](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32957) | No exact-head screenshots or verified state mapping. | No matched screenshot | **BLOCKED.** |
| Main mobile pixel parity | No approved populated mobile counterpart is verified for these frames. Main behavior test checks no document-level overflow and a horizontally scrollable table. | 375 | **NOT_APPLICABLE** for 1:1 Figma pixel parity; **PASS** for the tested responsive behavior only. |
| Main tablet parity | No matched Main capture from PR #49 at these widths. | 768 and 1280 | **BLOCKED.** |
| Candidate public vacancy page | Candidate has no verified Candidate-specific frame; authenticated Candidate pages are not available in the public-only view. The screenshot shows the public hero/search/filter shell, zero vacancies, and “Careers service is not configured.” | 375, 768, 1280, 1920 | **NOT_APPLICABLE** for Figma parity because there is no approved frame mapping. The empty/error content is caused by unavailable vacancy-service configuration in CI, not a confirmed UI defect. |

### What is and is not a defect

- No attendance or leave defect is confirmed. The Main information screenshot is post-action and at 1440px; the matching-size screenshot is a different reportOnly state. Shell, navigation, table-field, row-count, font, icon, dialog, and button comparisons for the full root therefore remain blocked.
- Figma root 17:28320 shows the Synesis IT mark and profile/bell controls. The synthetic Main screenshot shows a text lockup and permission-scoped navigation/account controls. This is a visible difference to resolve through an approved role/state mapping; it is not attributed as a defect until that mapping and a clean matched capture exist.
- The root table and nested report state have different columns. Figma’s sample data has eight rows while the synthetic aggregate report has two. The row-count difference is fixture data and is not a defect.
- The report child’s limited pass does not certify font family, every spacing value, icons, navigation, dialogs, controls outside the listed geometry, or the complete screen.
- Candidate’s service-not-configured message is an unavailable-data state. Candidate PR #8 changes include accessible department selection/count status and disabled Save/Apply controls under publicOnly. No authenticated UI or production service access was tested.
- WS06’s Employment information component is presentational and unmounted pending the server-checked tenant RPC and Auth acceptance; there is no rendered Employee screen to compare.
- WS07 PR #43 changes docs/contracts, not attendance/leave UI. Its HR03 audit says the closest Figma candidate 86:36133 is a Department Lists dropdown specimen, not the existing Org Structure or Teams screens; it records no approved mapping.
- WS08 PR #44 changes docs/contracts only. Its M03 Team Leave route remains a semantic candidate with no verified story-to-frame mapping or exact-head screenshots.

## Baseline correction

The original 61-row screen ledger recorded 4 PASS, 1 FAIL, and 56 BLOCKED. Reclassify the single color row as **BLOCKED / reference conflict**, not an application defect: the approved design foundation and current src/index.css both designate #085587 as authoritative; Figma #08558B is explicitly not authoritative pending an approved token change. The corrected disposition of those same 61 rows is 4 PASS, 0 FAIL, 57 BLOCKED. The one narrow 17:28321 PASS above is a supplemental subframe check and is not added to the 61-row count.

## Small evidence packets by owner

- **WS01:** Identify whether 17:28320 or child 17:28321 is the intended Attendance Information state and name the authorized role/state for each. Provide clean exact-head captures for Attendance Information and Leave Requests at 1920, 1280, 768, and 375 with route, role, locale, and state recorded. Keep unsupported request tabs disabled until their mapping and API contract are accepted.
- **WS07:** Map the manager attendance and leave fields, approval states, and route to the approved frames and APIs. Provide exact-head non-production captures after the map is accepted; retain existing calendar/policy behavior.
- **WS08:** Confirm whether 17:31769 is the intended M03 Team Leave screen and record the accepted mapping or no-screen rationale. Keep M03 blocked until then.
- **WS03:** Add an approved Candidate frame link or explicit no-screen rationale for public vacancies. Capture configured-data and unavailable-service states plus EN/BN and job-detail/back behavior at the four tested widths. Keep Candidate production public-only.
- **WS06:** Map the unmounted employment panel to an approved Employee frame/route. Submit a screenshot only after the server-checked tenant RPC and Auth gate pass; do not treat the component as a rendered screen.
- **WS05:** Review this supplement as visual evidence only. Release remains **HOLD**; none of the synthetic captures establish hosted identity, tenant acceptance, database recovery, or release approval.

No application code, production data, permissions, merge, or deployment were changed by this audit.
