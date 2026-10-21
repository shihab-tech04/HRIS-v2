# WS04 independent HRIS Figma acceptance — 2026-10-21

**Disposition: HOLD. No screen is signed off as production-ready.** This is independent, evidence-scoped review; CI success does not establish visual parity. A scoped geometry or behavior PASS does not promote a full screen.

**Approved source:** [Synesis HRIS Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)  
**Machine-readable ledger:** [State-level acceptance ledger](WS04_HRIS_INDEPENDENT_ACCEPTANCE_LEDGER_2026-10-21.csv)  
**Boundary:** Read-only review; no application source, production data, merge or deployment changed. Current findings use current exact source/artifact pins. Superseded captures are marked diagnostic only.

## Reverified design inventory

Figma metadata was re-read: Page 1 has 314 direct frames; 81 are 1800–2000px wide; 74 are at least 700px high; those 74 have 40 distinct labels. Components has 13 top-level specimen boards. These counts describe design inventory, not release routes. Unmapped frames remain BLOCKED rather than presumed compliant.

The earlier 61-row audit is historical. The ledger contains 71 scoped records: 68 current-evidence rows (54 BLOCKED, 8 PASS, 5 FAIL, 1 NOT_APPLICABLE) and 3 historical #44 diagnostic rows excluded from current totals.

## Exact current source and artifact pins

| Workstream | Current source | Exact evidence | Independent status |
|---|---|---|---|
| WS01 Main [PR #49](https://github.com/shihab-tech04/HRIS-v2/pull/49) | be78824462bbe212948615006ebed165af3944ec | [Run 39634656721 SUCCESS, 57/57 browser tests](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634656721); [artifact 12361495549](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634656721/artifacts/12361495549), SHA-256 e4be8ef05f8d6f91d5ccd1a5ff72e2c4bdd693473ce7c038533a621ebca49da2 | Attendance Information table surface PASS (whole frame BLOCKED on role/shell mapping); responsive EN/BN functional containment PASS at 1280/768/375; aggregate child FAIL; Requests normal/actions FAIL and selected/approved/rejected BLOCKED; Leave route FAIL. |
| WS07 HR Ops [PR #43](https://github.com/shihab-tech04/HRIS-v2/pull/43) | 74528bdf7bbce663349e1d290ea508818b49f6ea | [Run 39637059485 in progress](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637059485); no exact-head artifact yet. Artifact 12360818312 from failed run 39636462273 reports head b561967d and is nonmatching diagnostic only. | Current Attendance/Leave states BLOCKED pending artifact for exact head 74528bdf; prior decisions are not current. |
| WS08 Management [PR #44](https://github.com/shihab-tech04/HRIS-v2/pull/44) | 299b0c9c2e29617e2cce0fda0d78a04799625812 (base be78824462bbe212948615006ebed165af3944ec) | [Exact run 39636801387 in progress](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39636801387); no exact-head artifact yet. Prior-head 7c73260 artifact 12361223564 is diagnostic only. | Dashboard, Manager Attendance Information and aggregate current states BLOCKED pending exact artifact. |
| WS06 Employee [PR #52](https://github.com/shihab-tech04/HRIS-v2/pull/52) | dcb1ca20022e67530fa404b3a4c533f2c7cb0815 | [Run 39578617550 SUCCESS](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39578617550); [artifact 12335232631](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39578617550/artifacts/12335232631), SHA-256 74f412d747dd0edd8ca1708a61d4dacc01fa46c838fefeb46104033ddcd6e1c0 | 29 mapped states reviewed one by one: 66:72042 FAIL; 28 unsupported, mismapped or uncaptured states BLOCKED. |
| WS03 Candidate [PR #8](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/8) | 7740b68824cf3ff5d2bd5d7ac19c1756826d0de1 | Approved Candidate frame/state map absent in current PR evidence. | BLOCKED / UNMAPPED; no guessed frame comparison. |

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

Current exact source: `74528bdf7bbce663349e1d290ea508818b49f6ea`. Exact run [39637059485](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39637059485) is in progress; no current-head artifact is available yet.

All current #43 Attendance Information, filtered Attendance, Attendance Requests (normal/selected/approved/rejected), Leave Requests (normal/selected/approved/rejected), responsive, and approval-feedback rows are **BLOCKED pending exact-head evidence**. The prior cbcbe6c9 screenshots and the artifact 12360818312 from failed run 39636462273 are diagnostic only; that artifact metadata reports head b561967d rather than the current PR head. Do not carry those visual or functional decisions to 74528bdf.

The existing ownership split remains: WS01 owns the shell and HR01; WS07 owns HR Operations module content; WS08 owns Manager leave filtering. The exact current run must finish and produce state-matched captures before independent comparison.

## Management — #44

Current exact source: `299b0c9c2e29617e2cce0fda0d78a04799625812`, based on WS01 `be78824462bbe212948615006ebed165af3944ec`. Exact-head UI run [39636801387](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39636801387) is in progress; no artifact is available yet.

Dashboard `9:22640`, Manager Attendance Information `17:28694`, inherited Attendance Information `17:28320`, and aggregate child `17:28321` are **BLOCKED pending the exact 299b0c9 artifact**. The preceding 7c73260 run [39636388634](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39636388634) passed 64/64 browser tests and produced artifact [12361223564](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39636388634/artifacts/12361223564), ZIP SHA-256 `7f9fbd630a84619e67da045c74fef08561c6329a52cc190b52069336bdb71c94`; it is prior-head diagnostic evidence only, with no current acceptance decision. After the 299b run finishes, compare Manager Attendance Information geometry and Dashboard composition separately. Do not infer metric semantics from layout. HOD/Admin/CEO/Super Admin scopes remain blocked pending approved role/data mapping.

Dashboard PR #54's prior-base artifact is not used for this rebased #44 acceptance.

## Employee Profile — #52

**Frame 66:72042 — FAIL** against the exact 1920×2063 capture. Image anchor matches at (326,102), 203×203. App tab one ≈283px vs Figma≈313px; tab strip ≈48px vs ≈54px; content card y≈401 vs 408; detail cards y≈506 vs 520. Copy differs: Official Phone vs Official Phone Number, and section-title spacing differs. “Not available” values are treated as unavailable data/contract state, not a visual defect.

The remaining **28 mapped states are individually BLOCKED** in the ledger. Exact artifact section images exist for education/personal, work experience, training/certification, bank and family/nominee; they do not prove unsupported data or add/edit/dialog states. PR #52 documents own-profile fields only as full_name, employee_number, official_email, official_phone, designation_title and department_name. Other data sections lack approved read contracts; Add/Edit states lack write contracts and authorization evidence.

The artifact has 375px EN/BN personal-education captures but no 1280/768 images and no approved responsive Figma node, so responsive pixel parity is NOT APPLICABLE. Keyboard/focus/loading/error/disabled behavior remains BLOCKED until independently exercised with exact-source evidence.

## Candidate, tokens and release disposition

Candidate PR #8 provides no approved Candidate node/state map; visual parity is BLOCKED / UNMAPPED. Figma Primary-600 #08558B versus product token #085587 remains BLOCKED pending an authoritative decision. Dynamic fixture values, counts and unavailable profile fields are not defects without approved data contracts; no hardcoded or invented data is accepted as parity proof.

**WS05 input: HOLD.** No production-ready screen is signed off. Corrected screenshots must be generated from the corrected exact source SHA, exact-head CI must pass, and WS04 must independently re-review each state before closure.