# WS04 Independent HRIS Figma Acceptance — 2026-10-22

**Decision: RELEASE HOLD.** This is an independent, screenshot-backed review of exact source heads. A successful build/browser suite is recorded as CI evidence only; it is not visual acceptance. No application code, production data, Pages output, merge, or deployment was changed by WS04.

## Figma inventory, reverified

Read-only metadata for approved file [XEXLe9J1oATlITS9I5u1P9](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9):

- Page 1 contains 314 top-level frames.
- 74 are desktop-sized under the audit definition (width 1800–2000px and height at least 700px).
- Those 74 have 40 distinct frame names.
- Components page has 13 top-level specimen nodes.

## Exact source and evidence pins

| Work | Current source / base | Exact run | Result | Current screenshot artifact |
| --- | --- | --- | --- | --- |
| WS07 HR Ops, PR [#43](https://github.com/shihab-tech04/HRIS-v2/pull/43) | `95f5aa329aaceaaa3daa1033abbf922e2ceefad7` / base `2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc` | PR `39710845339`, push `39710838846` — both success | Browser acceptance passed; shell integration pending | [Artifact 12395954923](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39710838846/artifacts/12395954923), SHA-256 `8672539f233e7610539a7fbce6c28436d3308f47aa50cddd8cba7916802c5489` |
| WS01 Main, PR [#49](https://github.com/shihab-tech04/HRIS-v2/pull/49) | `e645a18144ac0eb30e413140875d851b5c40c220` / base `2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc` | `39647317576` — success | Current screenshot compared independently | [Artifact 12368630534](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39647317576/artifacts/12368630534), SHA-256 `327dce42dfa11e4d1db3e2bfa5d169bf80af047abfeab1ae6b5f9561a483bba8` |
| WS08 Management, PR [#44](https://github.com/shihab-tech04/HRIS-v2/pull/44) | `286bc1881966aefe1da1e0a579d31bb9e5e3fa04` / base #49 `e645a18144ac0eb30e413140875d851b5c40c220` | `39650508313` — success, 64/64 browser tests | Scoped visual decisions below; no full sign-off | [Artifact 12369102401](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39650508313/artifacts/12369102401), SHA-256 `ede804ace7f091cb286412d46271f5f26f5b900c31c4bed9b90ad7c8fec221e8` |
| WS06 Employee Profile, PR [#52](https://github.com/shihab-tech04/HRIS-v2/pull/52) | `3f1f1f1b0edb6341cf6e4be8501eff88789caf44` / base assets #51 `091d12fe1607db53664a6d1d248cb28e11774e3d` | `39643062126` — success | Main frame visual geometry PASS; unsupported states remain blocked | [Artifact 12366306463](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39643062126/artifacts/12366306463), SHA-256 `761e625ed609720e7e7c9161d69b59057b589db5dea8e40e2c792f2e7e2d5127` |
| WS04 audit, PR [#45](https://github.com/shihab-tech04/HRIS-v2/pull/45) | `590f436e36fcfe7a387cde1e961f6a7243012a8f` | `39640469188` — failure before Chromium | Pages build-entry integrity FAIL; no visual verdict | No screenshot artifact; browser steps skipped |

All current artifacts were checked against their exact run head and archive digest. Superseded #43/#44/#49/#52 screenshot pins are not used for current decisions.

## Independent screen decisions

### WS07 — Attendance and Leave

The 10 mapped desktop frame/state rows use exact nodes [17:28320](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-28320), [17:31530](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31530), [17:29937](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-29937), [17:30342](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-30342), [17:30766](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-30766), [17:31148](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31148), [17:31769](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31769), [17:32168](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32168), [17:32584](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32584), and [17:32957](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32957).

- **BLOCKED — full-frame parity for all 10 states.** PR #43 still uses base `2a5fe5f`; the exact captures do not contain the current WS01 #49 shell at `e645a18`. Do not treat table-only captures as full-frame acceptance.
- **FAIL — normal Attendance Requests 17:29937 and normal Leave Requests 17:31769.** Each actual search control includes a trailing sliders/filter glyph absent from its mapped Figma state.
- **PASS — approval feedback behavior only at 17:30766.** Exact-head browser assertions reach the approval toast and approved-row state; the screenshot captures the final row, not the transient toast.
- **PASS — 375px keyboard reachability only.** Exact-head EN/BN test reaches the last pending-row Reject control using horizontal keyboard scrolling and verifies document containment. No mobile Figma node exists, so this is not responsive pixel parity.
- **PASS — tested EN/BN functional containment at 375/768/1280/1920. BLOCKED — responsive visual parity** because no approved responsive frames are mapped.

### WS08 — Management

- **Managerial Dashboard, Figma 9:22640 — BLOCKED overall.** The Dashboard/date heading, Last Updated banner, Personal/Managerial tabs, and summary-card composition **PASS**. No “Needs attention” panel appears in the captured 1920×1080 mapped frame or 375px full-page route screenshot; that absence PASS is limited to those screenshot bounds. The chart is a separate **FAIL**: Figma child 9:22784 shows a 0–100% axis and varied August values, while the current UI shows daily record counts on a 0–32 axis for October 15–21. Metric units/denominators remain **BLOCKED** pending an approved source contract; do not fabricate percentages. Dashboard Poppins typography is **BLOCKED** because the exact-head test at `tests/browser/managerial-dashboard.spec.ts:49` replaces Google Fonts CSS with an empty stylesheet, so the artifact cannot prove the intended family/weights loaded.
- **Manager Attendance Information, 17:28694 — FAIL overall visible table state.** Geometry **PASS**: 48px toolbar; table begins 56px below toolbar top (8px gap); 59px header; 80px rows; 6px row gaps; no transform. The actual Team Name glyph is horizontal `↔` versus Figma vertical `↑↓`; filter control is blue-filled versus Figma white/gray outline.
- **Aggregate attendance, 17:28321 — FAIL overall visible table state.** Header-to-first-row gap **PASS** at approximately 16px versus Figma 16–17px. Team Name glyph remains horizontal rather than vertical.
- **Inherited Attendance Information, 17:28320 — BLOCKED full shell.** Table geometry **PASS**; sort glyph **FAIL**. Role-specific navigation/authority is **BLOCKED** because no approved Manager role-to-navigation mapping is supplied.
- **BLOCKED** — HOD/Admin/CEO/Super Admin authority and metric scope. Manager Leave visual mapping is also BLOCKED because no approved exact Figma node/state is mapped. Responsive functional checks are separate; responsive pixel parity remains BLOCKED without responsive design frames.

### WS06 — Employee Profile

- **Employee Profile, Figma 66:72042 — PASS for the mapped main-frame visual structure and labels.** Independently compared `profile-main-frame-en-1920x2063.png` from the exact #52 artifact with Figma metadata and screenshot. Avatar slot anchor (326,102), 203×203; content/tab origin (326,329); active tab 313×54; content card top y=408; detail card y=520; and label “Official Phone Number” match. The actual values/portrait differ because approved profile data/assets are unavailable; they are not scored as design defects.
- **BLOCKED — 28 other mapped states**, including unsupported data sections and all Add/Edit/write actions, until WS02 verifies data contracts, permissions, and approved assets. Responsive pixel parity is NOT APPLICABLE where no responsive Figma frame exists; keyboard/accessibility states remain separately blocked.

### WS01 — Attendance and Leave

- **Attendance Information 17:28320 — BLOCKED full shell** pending the approved role/navigation map; visible table geometry is **PASS** (header at y≈302, 59px header, 80px rows, 6px row gaps, one-line Team Name, no clipping). The Team Name sort glyph is a separate **FAIL**: actual horizontal `↔`, Figma vertical `↑↓`.
- **Aggregate 17:28321 — PASS** for the corrected ≈16px header-to-first-row gutter; **FAIL** for the same sort-glyph mismatch.
- **Attendance Requests and Leave Requests — FAIL** against the mapped table designs: the current #49 screenshots still show the legacy request/summary surfaces rather than the matching Figma table/state compositions. The 375px Requests width guard passing is functional evidence only.
- The documented Primary-600 reference conflict remains unresolved: Figma `#08558B` versus product token `#085587`.

## Release integrity and ledger

Exact current #45 run `39640469188` failed `git diff --exit-code -- index.html assets .nojekyll` at check step 9. The tracked entry references `assets/app-D0JtBbVh6.js`; that run generated `assets/app-DqsfAdd6.js`. Chromium and screenshot steps were skipped. This is a Pages build-entry integrity failure for WS05 tracking, not a visual finding. WS04 did not patch generated files or change product code.

The current per-state ledger contains **99 scoped findings**: **63 BLOCKED, 23 PASS, 12 FAIL, 1 NOT_APPLICABLE**. It pins exact source SHA, route/state, role, viewport/locale, Figma node, artifact digest, member screenshot SHA-256, measured result, owner, and closure gate. Findings remain open until the owner provides a corrected exact-head capture and exact-head CI, followed by WS04 review.

**WS05 release status: HOLD.** No screen or PR is certified for release by this packet.
