# WS04 independent HRIS Figma acceptance — 2026-10-21

**Disposition: HOLD. No screen is signed off as production-ready.** This is independent, evidence-scoped review; CI success does not establish visual parity. A scoped geometry or behavior PASS does not promote a full screen.

**Approved source:** [Synesis HRIS Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)  
**Machine-readable ledger:** [State-level acceptance ledger](WS04_HRIS_INDEPENDENT_ACCEPTANCE_LEDGER_2026-10-21.csv)  
**Boundary:** Read-only review; no application source, production data, merge or deployment changed. Current findings use current exact source/artifact pins. Superseded captures are marked diagnostic only.

## Reverified design inventory

Figma metadata was re-read: Page 1 has 314 direct frames; 81 are 1800–2000px wide; 74 are at least 700px high; those 74 have 40 distinct labels. Components has 13 top-level specimen boards. These counts describe design inventory, not release routes. Unmapped frames remain BLOCKED rather than presumed compliant.

The earlier 61-row audit is historical. The current ledger contains 90 records: 86 current screen/state, behavior, responsive, mapping and token records (50 BLOCKED, 16 scoped PASS, 19 FAIL, 1 NOT_APPLICABLE), plus 3 historical #44 diagnostic rows and one separate PR #45 release-integrity FAIL. The CI gate is not counted as a visual verdict.

## Exact current source and artifact pins

| Workstream | Exact source/base | Exact run and artifact | Independent status |
|---|---|---|---|
| WS01 Main [PR #49](https://github.com/shihab-tech04/HRIS-v2/pull/49) | `be78824462bbe212948615006ebed165af3944ec` | [Run 39634656721 SUCCESS, 57/57 browser tests](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634656721); [artifact 12361495549](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634656721/artifacts/12361495549), SHA-256 `e4be8ef05f8d6f91d5ccd1a5ff72e2c4bdd693473ce7c038533a621ebca49da2` | Attendance table surface scoped PASS; full shell BLOCKED; Requests/Leave findings remain state-scoped FAIL/BLOCKED as listed in the current ledger. |
| WS07 HR Ops [PR #43](https://github.com/shihab-tech04/HRIS-v2/pull/43) | Base `2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc`; head `60d3bc0279dbdfbf24662958e2d6c878242ce62c` | [PR run 39637851895 SUCCESS](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637851895), artifact [12360909933](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637851895/artifacts/12360909933), SHA-256 `f0ace4e65e7ee7bac63b32d775f9ddb9def1e590c376f7df31ab1ff6be84958d`. Push run 39637844249 also passed; its artifact 12361394777 SHA-256 `34b1629ae1e168880fb4219ce3394b3029f9da228c4bb649ef2aa41a4a91c398`. | 10 mapped full frames FAIL; approval-feedback behavior and width-containment subfindings PASS; no responsive pixel signoff; unmapped transient states and Manager Leave map BLOCKED. |
| WS08 Management [PR #44](https://github.com/shihab-tech04/HRIS-v2/pull/44) | Base `be78824462bbe212948615006ebed165af3944ec`; head `928f7f5028fe13827affe928d20cf73fb226714b` | [Exact push run 39637917278 SUCCESS](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637917278); artifact [12362571183](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637917278/artifacts/12362571183), SHA-256 `9d893d73935f9a639e047bb99ef80ce56578da2e9510a3bfcafd034196da7975`. The 299b0c9 artifact is prior-head history only. | Dashboard composition FAIL; Manager Attendance visible table offset FAIL; aggregate gap FAIL; inherited table geometry PASS as a subfinding and inherited full shell FAIL; metrics/role scopes BLOCKED. |
| WS06 Employee [PR #52](https://github.com/shihab-tech04/HRIS-v2/pull/52) | `dcb1ca20022e67530fa404b3a4c533f2c7cb0815` | [Run 39578617550 SUCCESS](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39578617550); artifact [12335232631](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39578617550/artifacts/12335232631), SHA-256 `74f412d747dd0edd8ca1708a61d4dacc01fa46c838fefeb46104033ddcd6e1c0` | Employee Profile 66:72042 FAIL; 28 unsupported/mismapped/add-edit states BLOCKED. |
| WS04 report PR #45 | Last verified source `2020593104f4bb2c3f2e7f5a0dc042bfc94165ea` | [Exact run 39637236100 FAILURE](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637236100); no artifact, Chromium skipped. The report refresh advances the docs-only head; its new exact-head run is tracked separately. | Pages build-entry integrity FAIL, not a screenshot verdict. Step 9 diff is pinned in the release section and ledger row `WS04-PR45-PAGES-DRIFT`. |
| Candidate [PR #8](https://github.com/shihab-tech04/HRIS-v2/pull/8) | `7740b68824cf3ff5d2bd5d7ac19c1756826d0de1` | Approved Candidate frame map absent | BLOCKED / UNMAPPED. |



## Main Attendance and Leave — #49

Current exact source: be78824462bbe212948615006ebed165af3944ec. Exact run [39634656721](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634656721) succeeded with 57/57 browser tests. Artifact [12361495549](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634656721/artifacts/12361495549) has ZIP SHA-256 e4be8ef05f8d6f91d5ccd1a5ff72e2c4bdd693473ce7c038533a621ebca49da2. The previous 5f76c46 artifact is superseded as current evidence.

- **Attendance Information 17:28320, 1920x1117 EN table surface — PASS (scoped).** Independent review of current member attendance-en-1920.png (image SHA-256 a28a438b2da86c15fed82c512924dc1ae3f158d5a2f02d33da6d7e3efa564bb2) confirms Team Name is one line; header y≈302 vs Figma≈303 (1px); 59px header; 80px first row; 6px row gap; x≈324, width≈1383; all columns fit inside the 1920 frame. The exact current browser test also asserts those measures and transparent frame/white cells. This is a table-surface PASS only.
- **Attendance Information 17:28320, whole frame — BLOCKED.** Role-specific shell/navigation mapping and the fixture portrait/data contract remain unresolved. This is not a defect inferred from the table comparison, and the table PASS does not certify the entire frame.
- **Responsive EN/BN captures — PASS for functional containment only.** Exact artifact members show Attendance Information at 1280, 768 and 375 widths in both locales. The exact run checks document scroll width ≤ viewport; at 768/375 it also asserts a focusable horizontal table region with overflow. The screenshot shows partial columns at the initial scroll position because the table is intentionally wider than the viewport; the region remains horizontally scrollable. This is not a responsive pixel-parity PASS: no approved responsive Figma nodes were mapped. SHA-256s: EN 1280 fe3a292c8d71533d5f1a672ddcd71ee2aff06701feab1f692665e47f5250e2a2, EN 768 90b32b09ece2e58e4ce87c68134087eb14d1f9e187778eb62c90010bc800f414, EN 375 69759aa6382440a80d29defdc00dfb3cff40b14aa0e4596e55fd8298dfa63640; BN 1280 60cda63cba6228c545ba1bc3438a72b0eb7f767c67db987a649cc2c87b78eb36, BN 768 436ef10fdb2a6feba345758aba86cd0fc9941ef0f23cdbbeb59504b6c2fdfe29, BN 375 d20a2439cb11a03390012779f32e5f83d3cb68511dbcc1cbd1e14f2097a96bf8.
- **Aggregate child 17:28321 — FAIL.** Current exact capture still has an approximately 6px header-to-row gap versus approximately 17px in Figma.
- **Attendance Requests normal 17:29937 — FAIL / open.** Current exact screenshot still shows correction-request fields and rectangular controls instead of the Figma attendance columns and circular action icons; table composition differs. Selected 17:30342, approved 17:30766 and rejected 17:31148 remain BLOCKED: no selected screenshot, and resolved capture mixes approved/rejected rows.
- **Leave Requests 17:31769 — FAIL / open.** Current exact route screenshot still renders KPI cards and an absence calendar; the Figma Requests table is absent. No status-specific Leave request frame is inferred from this route.
- The current artifact also has responsive Request/Leave images; state-specific visual findings remain open and are not promoted by these Attendance Information checks. Exact image names, hashes, node IDs and owners are in the CSV.

## HR Operations Attendance and Leave — #43

Current exact source is `60d3bc0279dbdfbf24662958e2d6c878242ce62c` on base `2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc`. PR run [39637851895](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637851895) and push run [39637844249](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637844249) passed. Visual review uses only current PR artifact [12360909933](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637851895/artifacts/12360909933), ZIP SHA-256 `f0ace4e65e7ee7bac63b32d775f9ddb9def1e590c376f7df31ab1ff6be84958d`. Push artifact is run evidence, not a substitute capture.

| Exact Figma state | Result | Independent comparison |
|---|---|---|
| Attendance Information normal `17:28320` | **FAIL** | Header begins y≈188 vs Figma≈302 (≈114px high); Figma's separate row cards/gutters are merged into one continuous table surface. |
| Attendance Information Early + Late `17:31530` | **FAIL** | Correct two-row filtered state is captured; visible table header is ≈43px high and the row-card gutters are absent. |
| Attendance Requests normal `17:29937` | **FAIL** | Header begins y≈238 vs Figma≈302 (≈64px high); page title/tab band is missing and a Filters control is added beside the Figma search control. |
| Attendance Requests selected `17:30342` | **FAIL** | Correct selected state/controls are present; table starts ≈112px high and the approved title/tab band is absent. |
| Attendance Requests approved `17:30766` | **FAIL** | Green status text and resolved table state match; full frame starts ≈118px high and omits the title/tab band. |
| Attendance Requests rejected `17:31148` | **FAIL** | Red status text and resolved table state match; full frame starts ≈118px high and omits the title/tab band. |
| Leave Requests normal `17:31769` | **FAIL** | Header begins y≈194 vs Figma≈302 (≈108px high); actual adds Filters and Refresh controls absent from this normal frame. |
| Leave Requests selected `17:32168` | **FAIL** | Correct selected state is captured; header begins ≈111px high and the title/tab band is absent. |
| Leave Requests approved `17:32584` | **FAIL** | Green nested status text matches; header begins ≈109px high and the full page shell differs. |
| Leave Requests rejected `17:32957` | **FAIL** | Red nested status text matches; header begins ≈109px high and the full page shell differs. |

The exact source's approval test at `attendance-information.spec.ts:358–365` passes the transient “Attendance correction approved.” visibility and approved-row assertions. The screenshot captures the final row, not the toast; this is a **behavior-only PASS** and does not promote the 17:30766 full-frame FAIL. The Employee initials used by correction rows are consistent with the verified no-photo reader contract, so Figma sample portraits are not scored as a defect. Leave approved/rejected status text colors match their mapped nested status text; full screen states remain FAIL for the geometry/shell differences above.

For Attendance Information, Attendance Requests, and Leave Requests, exact-head EN/BN width checks pass at 375, 768, 1280 and 1920: page width stays within the viewport and wide result tables scroll internally; BN Leave date controls stay within the viewport. The 375px Leave rejection dialog and decision-note flow pass functional bounds checks; the current artifact screenshot was inspected. These are functional-containment/behavior results only. No approved responsive Figma frames or mobile dialog frame were mapped, so responsive pixel parity remains BLOCKED.

The exact artifact also contains Attendance Information loading/empty/error, Attendance Requests error, and Leave Requests loading/empty/error screenshots. Those seven transient states are individually **BLOCKED** because no exact approved Figma state node is mapped; the filenames in the artifact are not substituted for Figma state references. The current #44 artifact includes Manager Leave filter captures at 375/768 BN, but the current WS08 node map has no Manager Leave screen/state mapping; that row is BLOCKED pending an approved node, not assumed to match `17:31769`.

Owner packet to WS07: restore the approved title/tab band and align each exact state's first table surface to the Figma y-position; render the Attendance Information rows as separate rounded cards with the approved 6px gaps; remove or map the extra Leave normal controls. Keep service data dynamic and initials source-derived. Require corrected exact-head screenshots before WS04 re-review.


## Management — #44

Current exact source is `928f7f5028fe13827affe928d20cf73fb226714b`, based on WS01 `be78824462bbe212948615006ebed165af3944ec`. Exact push run [39637917278](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637917278) passed 64 browser tests; the current artifact is [12362571183](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637917278/artifacts/12362571183), ZIP SHA-256 `9d893d73935f9a639e047bb99ef80ce56578da2e9510a3bfcafd034196da7975`. All visual decisions below were made from this artifact only; the earlier 299b and 7c73260 screenshots remain history.

- **Managerial Dashboard `9:22640` — FAIL (composition).** The exact 1920 capture omits the Figma Dashboard/date heading, Last Updated banner and Personal/Managerial tabs, and adds a Needs attention panel. These are visible composition differences.
- **Dashboard metric semantics — BLOCKED.** Figma uses a 0–100% axis and example summary values; current tenant fixture uses count values 0–32 and dynamic counts. No approved numerator/denominator or unit mapping exists, so data-value differences are not called defects or passes.
- **Inherited Attendance Information `17:28320` — FAIL (full frame), table geometry PASS (subfinding).** The current full capture shows an app wordmark `SYNESIS HRIS 360°` where the frame shows `Synesis IT`, and additional locale/account controls. Role-dependent navigation remains separately BLOCKED. The visible table begins at y≈302 with 59px header, 80px rows and 6px gaps, matching the approved content geometry; two synthetic rows versus Figma examples are not compared as a data defect.
- **Manager Attendance Information `17:28694` — FAIL.** The toolbar begins around y248; actual visible table header begins y≈310 (local y≈62) against Figma local y56, a +6px offset. CI measured the wrapper at y56/gap8 but the visible white `thead` surface remains six pixels low. Header height 59px, row height 80px and row gaps 6px match.
- **Aggregate child `17:28321` — FAIL.** Actual header-to-first-row gap ≈6px vs Figma≈16–17px, leaving the row surface 10–11px too close.
- **Role coverage — BLOCKED.** Only the synthetic Manager tenant fixture is captured. HOD/Admin/CEO/Super Admin node-to-role screens and authorization scopes are not verified. Manager Leave filter screenshots exist at BN 375/768, but no exact approved Manager Leave node is listed in the current node map; that state remains BLOCKED.

Exact #44 tests and screenshots verify functional containment for Manager Attendance/aggregate at EN 375/768/1280/1920 and BN filter controls at 375/768. The Manager Dashboard 375 route test verifies document width ≤376px and a reachable two-column metric grid; 768/1280 dashboard screenshots exist but lack a route-specific width assertion in this run. Responsive pixel parity remains BLOCKED because no approved responsive Figma frames are mapped.

Owner packet to WS08: align the visible Manager Attendance `thead` surface (not just its wrapper) to local y56; restore the aggregate first-row gap to the Figma 16–17px; align the Dashboard header/date/update/tab composition to node `9:22640`. Keep metrics and unverified role scopes blocked until their contracts and mappings are approved. Require corrected exact-head artifacts before WS04 re-review.


## Employee Profile — #52

**Frame 66:72042 — FAIL** against the exact 1920×2063 capture. Image anchor matches at (326,102), 203×203. App tab one ≈283px vs Figma≈313px; tab strip ≈48px vs ≈54px; content card y≈401 vs 408; detail cards y≈506 vs 520. Copy differs: Official Phone vs Official Phone Number, and section-title spacing differs. “Not available” values are treated as unavailable data/contract state, not a visual defect.

The remaining **28 mapped states are individually BLOCKED** in the ledger. Exact artifact section images exist for education/personal, work experience, training/certification, bank and family/nominee; they do not prove unsupported data or add/edit/dialog states. PR #52 documents own-profile fields only as full_name, employee_number, official_email, official_phone, designation_title and department_name. Other data sections lack approved read contracts; Add/Edit states lack write contracts and authorization evidence.

The artifact has 375px EN/BN personal-education captures but no 1280/768 images and no approved responsive Figma node, so responsive pixel parity is NOT APPLICABLE. Keyboard/focus/loading/error/disabled behavior remains BLOCKED until independently exercised with exact-source evidence.

## Candidate, tokens and release disposition

Candidate PR #8 remains **BLOCKED / UNMAPPED** because no approved Candidate node/state map was found. Figma Primary-600 `#08558B` versus product token `#085587` remains **BLOCKED** pending an authoritative design-token decision. Dynamic fixture values, employee counts, sample portraits and unavailable profile fields are not defects without approved data contracts; no hardcoded or invented data is accepted as parity evidence.

### PR #45 Pages build-entry drift — release integrity FAIL

The last verified PR #45 head before this report-only refresh was `2020593104f4bb2c3f2e7f5a0dc042bfc94165ea`. Exact run [39637236100](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637236100) **FAILED** at `.github/workflows/check.yml` step 9, “Verify the branch-served Pages entry matches the production build,” before Chromium. TypeScript, contract checks, the synthetic recovery-endpoint check and the production bundle passed. The failing command was `git diff --exit-code -- index.html assets .nojekyll`: tracked `index.html` references `assets/app-D0JtBbVh.js`, while the source build emitted `assets/app-DqsfAdd6.js`. The exact run has no screenshot artifact and browser steps were skipped. This is a **Pages build-entry/release-integrity FAIL**, not a visual screen verdict. It is recorded separately in ledger row `WS04-PR45-PAGES-DRIFT` for WS05 release-ledger tracking.

WS04 did not edit generated assets, application code, Pages source, or production; no Pages write or deploy occurred. Updating this audit report advances the docs-only PR #45 head, so run 39637236100 is evidence for its pinned SHA only; the new report head needs its own exact-head CI check.

**WS05 release input: HOLD.** No screen is signed off as production-ready. Corrected screenshot evidence must come from the corrected exact source SHA; exact-head CI must pass; WS04 must independently re-review each matching frame/state. A green build alone does not produce visual acceptance.


