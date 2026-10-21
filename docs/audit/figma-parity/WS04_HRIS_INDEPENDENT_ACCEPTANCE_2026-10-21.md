# WS04 independent HRIS Figma acceptance — 2026-10-21

**Disposition: HOLD. No screen is signed off as production-ready.** This is independent, evidence-scoped review; CI success does not establish visual parity. A scoped geometry or behavior PASS does not promote a full screen.

**Approved source:** [Synesis HRIS Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)  
**Machine-readable ledger:** [State-level acceptance ledger](WS04_HRIS_INDEPENDENT_ACCEPTANCE_LEDGER_2026-10-21.csv)  
**Boundary:** Read-only review; no application source, production data, merge or deployment changed. Current findings use current exact source/artifact pins. Superseded captures are marked diagnostic only.

## Reverified design inventory

Figma metadata was re-read: Page 1 has 314 direct frames; 81 are 1800–2000px wide; 74 are at least 700px high; those 74 have 40 distinct labels. Components has 13 top-level specimen boards. These counts describe design inventory, not release routes. Unmapped frames remain BLOCKED rather than presumed compliant.

The earlier 61-row audit is historical and is not the current denominator. The ledger below contains 64 current, scoped findings/subfindings; historical #44 rows are explicitly labeled and excluded from current acceptance totals.

## Exact current source and artifact pins

| Workstream | Current source | Exact evidence | Independent status |
|---|---|---|---|
| WS01 Main [PR #49](https://github.com/shihab-tech04/HRIS-v2/pull/49) | 5f76c463867af5eb7ee3e99da8e233af55e05092 | [Run 39602259020 SUCCESS](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39602259020); [artifact 12346497822](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39602259020/artifacts/12346497822), SHA-256 77aef406ce0c3ed023671636d2eccedc3610b91b646d7c3b71252a9d9dca4379 | Attendance Information FAIL; aggregate child FAIL; Requests normal/action controls FAIL; selected/approved/rejected BLOCKED; Leave route FAIL; 375px Requests width guard PASS only. |
| WS07 HR Ops [PR #43](https://github.com/shihab-tech04/HRIS-v2/pull/43) | cbcbe6c9ece040a68fc3720c0a3cbf274939d634 | [Run 39632193266 SUCCESS](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39632193266); [artifact 12359043452](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39632193266/artifacts/12359043452), SHA-256 8804872f22b3209757178497da43276c7e4df19dd7ad0ed005b57ffc21d9585a | Ten full-frame Attendance/Leave desktop states FAIL. Approval feedback behavior PASS only. |
| WS08 Management [PR #44](https://github.com/shihab-tech04/HRIS-v2/pull/44) | 3b731508ae1c95ae850b8b9db38061e881320415 | No exact-head run/artifact found. Prior a6c3 artifact is diagnostic only. | Dashboard, Manager Attendance Information and aggregate current states BLOCKED. |
| WS06 Employee [PR #52](https://github.com/shihab-tech04/HRIS-v2/pull/52) | dcb1ca20022e67530fa404b3a4c533f2c7cb0815 | [Run 39578617550 SUCCESS](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39578617550); [artifact 12335232631](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39578617550/artifacts/12335232631), SHA-256 74f412d747dd0edd8ca1708a61d4dacc01fa46c838fefeb46104033ddcd6e1c0 | 29 mapped states reviewed one by one: 66:72042 FAIL; 28 unsupported, mismapped or uncaptured states BLOCKED. |
| WS03 Candidate [PR #8](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/8) | 7740b68824cf3ff5d2bd5d7ac19c1756826d0de1 | Approved Candidate frame/state map absent in current PR evidence. | BLOCKED / UNMAPPED; no guessed frame comparison. |

## Main Attendance and Leave — #49

- **Attendance Information 17:28320 — FAIL** at 1920×1117 EN. Table geometry now aligns: header y≈302 versus Figma y≈303, x≈324, width≈1383, 59px header, 80px rows and 6px row gutters. Team Name wraps to two lines beside the sort control while Figma keeps it on one line. Exact artifact member attendance-en-1920.png; image SHA-256 d7471bc472de675b6884218bcbef4ce511205081a0ea73348a6ab76177e6efcb. The geometry subcheck alone is PASS; whole frame remains FAIL.
- **Aggregate child 17:28321 — FAIL.** Header-to-first-row gap is about 6px in the app vs about 17px in Figma, roughly 11px too tight.
- **Attendance Requests normal 17:29937 — FAIL.** App shows Employee / Date / Requested change / Reason / Status / Actions and rectangular Approve/Reject buttons; Figma shows Name / Date / In Time / Out Time / Applying Date / Remarks / Action with checkboxes and round action icons. Table begins about 66px lower.
- **Selected 17:30342, approved 17:30766, rejected 17:31148 — BLOCKED.** No selected capture; the only resolved capture mixes approved and rejected rows and is not state-matched.
- **Leave Requests 17:31769 — FAIL.** The route renders KPI cards and an absence calendar; the approved request table is absent.
- Exact-head 375px Requests overflow guard passed. This is functional-width evidence only; no approved mobile Figma frame is mapped. Bengali visual parity is BLOCKED because no exact BN state capture was independently reviewed.

## HR Operations Attendance and Leave — #43

The exact current run is green; the independent full-frame comparisons are not. **All ten desktop state comparisons FAIL**:
- Attendance Information normal 17:28320: table header y≈188 vs Figma≈303 (≈115px too high); title/tab strip absent.
- Attendance Information Early + Late filtered 17:31530: header y≈267 vs Figma≈309 (≈42px too high); title/tabs absent.
- Attendance Requests normal 17:29937: title/tabs absent; header ≈65px too high.
- Attendance Requests selected 17:30342: selected checkbox state matches, but shell chrome is absent and header ≈110px too high.
- Attendance Requests approved 17:30766 and rejected 17:31148: shell/vertical mismatch; app header Status vs Figma Action.
- Leave Requests normal 17:31769: header y≈194 vs Figma≈303 (≈109px too high); title/tabs absent.
- Leave Requests selected 17:32168: selected state visible, shell/vertical placement differs.
- Leave Requests approved 17:32584 and rejected 17:32957: shell/vertical mismatch; app header Status vs Figma Action.

The current exact run asserts approval feedback and approved-row visibility, so that behavior subfinding is PASS. Its screenshot shows the approved row but not the transient toast; visual toast parity is not proven. Exact member names and image hashes are recorded in the CSV.

The exact artifact has EN/BN normal-route captures at 1920, 1280, 768 and 375 widths. Current exact 375px guards pass. No responsive Figma nodes are mapped, so these are functional-width results, not mobile/tablet visual-parity PASSes; 768/1280 pixel parity remains BLOCKED pending approved responsive references.

## Management — #44

Current head 3b731508ae1c95ae850b8b9db38061e881320415 has no exact-head Actions run or screenshot artifact. Dashboard 9:22640, inherited Attendance Information 17:28320, Manager Attendance Information content 17:28694 and aggregate child 17:28321 are **BLOCKED** at this source.

The prior exact artifact at a6c3b80358edd1d90b132054d428a677fee2552a (run 39602629932, artifact 12346771531) is historical diagnosis only:
- Dashboard 9:22640: date/Last updated card and Personal/Managerial tabs absent; heading ~105px high; extra Needs attention panel. Chart axis semantics remain BLOCKED on metric contract.
- Manager Attendance Information 17:28694: old geometry assertion measured table region 8px below toolbar offset.
- Aggregate child 17:28321: old header-to-row gap was ~11px too tight.

Those screenshots do not establish current 3b731 status and cannot close findings.

## Employee Profile — #52

**Frame 66:72042 — FAIL** against the exact 1920×2063 capture. Image anchor matches at (326,102), 203×203. App tab one ≈283px vs Figma≈313px; tab strip ≈48px vs ≈54px; content card y≈401 vs 408; detail cards y≈506 vs 520. Copy differs: Official Phone vs Official Phone Number, and section-title spacing differs. “Not available” values are treated as unavailable data/contract state, not a visual defect.

The remaining **28 mapped states are individually BLOCKED** in the ledger. Exact artifact section images exist for education/personal, work experience, training/certification, bank and family/nominee; they do not prove unsupported data or add/edit/dialog states. PR #52 documents own-profile fields only as full_name, employee_number, official_email, official_phone, designation_title and department_name. Other data sections lack approved read contracts; Add/Edit states lack write contracts and authorization evidence.

The artifact has 375px EN/BN personal-education captures but no 1280/768 images and no approved responsive Figma node, so responsive pixel parity is NOT APPLICABLE. Keyboard/focus/loading/error/disabled behavior remains BLOCKED until independently exercised with exact-source evidence.

## Candidate, tokens and release disposition

Candidate PR #8 provides no approved Candidate node/state map; visual parity is BLOCKED / UNMAPPED. Figma Primary-600 #08558B versus product token #085587 remains BLOCKED pending an authoritative decision. Dynamic fixture values, counts and unavailable profile fields are not defects without approved data contracts; no hardcoded or invented data is accepted as parity proof.

**WS05 input: HOLD.** No production-ready screen is signed off. Corrected screenshots must be generated from the corrected exact source SHA, exact-head CI must pass, and WS04 must independently re-review each state before closure.