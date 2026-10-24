# HRIS Figma root-screen inventory — 21 October 2026

## Verified source and denominator

- Source: [approved Synesis HRIS Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9), Page 1 (`0:1`); read directly via Figma metadata on 21 Oct.
- Page contains **314 top-level frame nodes** (mixed screens, controls, fragments and supporting variants).
- **81 desktop-width top-level frames** have widths from 1800 to 2000px. **74** of these have height >=700px and constitute the **full-screen-sized inventory**, with **40 distinct labels**. This is a FRAME/STATE inventory, **not** 74 unique URLs or required new pages.
- Seven remaining desktop-width frames are utility/table/strip fragments, excluded from the screen denominator: 3:43494, 66:39290, 66:40253, 66:40272, 66:40291, 66:40309, 66:48282.
- The separate Foundations page and Components page contain the canonical shared design references; Components page has 13 top-level specimen/board nodes (forms, checkbox, buttons, attendance row). Existing token and component decisions must be reused, not replaced.
- Baseline [WS04 Figma parity audit PR #45](https://github.com/shihab-tech04/HRIS-v2/pull/45): **61 independent route/viewport evidence rows** = 4 shell geometry PASS, 1 primary color-token FAIL (Figma #08558B vs current app #085587), 56 BLOCKED. The 61 evidence rows are **not additive** to these frame counts and are **not screen certification**.
- No Candidate-specific approved full journey frames were established from this file. Candidate UX needs an explicit approved-frame or accepted no-screen mapping.

## Scope/priority

This register records **all top-level full-screen-sized Figma Page 1 frames**; it does NOT claim matched Figma-to-code parity. Source application: Main HRIS development branch `development/hris-checkpoints`, current 36 PageId routes; Candidate 13 routes handled separately.

For each screen/state, WS04 must link (a) actual route, (b) correct signed-in role, (c) selected state/filter/dialog, (d) desktop capture at matched Figma dimensions, (e) tablet/mobile responsive rationale/captures, (f) typography/tokens/layout, (g) interactive behavior, (h) keyboard/focus/accessibility, (i) exact app commit/test evidence, and (j) disposition PASS/FAIL/BLOCKED/NOT_APPLICABLE with explicit owner acceptance. Never infer match from labels alone.

### Full-screen-sized frame/state rows

| Figma node | Frame label | Provisional family | Route/feature review owner | Verified parity |
| --- | --- | --- | --- | --- |
| [3:39433](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-39433) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [3:39880](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-39880) | personal leave | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [3:40287](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-40287) | personal leave filter | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [3:41045](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-41045) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [3:41213](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-41213) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [3:41340](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-41340) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [3:41468](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-41468) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [3:41596](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-41596) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [3:45510](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-45510) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [3:45970](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-45970) | team mate profile job card | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [3:46384](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-46384) | team mate profile analytics | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [3:46810](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=3-46810) | team mate profile analytics | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [9:22640](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=9-22640) | managerial dashboard | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [377:37743](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=377-37743) | Personal Evaluation | Performance & evaluation | WS01 / WS07 / WS08 | Unverified: map exact role, state, route and viewport |
| [377:38838](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=377-38838) | Personal Evaluation | Performance & evaluation | WS01 / WS07 / WS08 | Unverified: map exact role, state, route and viewport |
| [377:39314](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=377-39314) | Personal Evaluation | Performance & evaluation | WS01 / WS07 / WS08 | Unverified: map exact role, state, route and viewport |
| [379:38778](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=379-38778) | Personal Evaluation | Performance & evaluation | WS01 / WS07 / WS08 | Unverified: map exact role, state, route and viewport |
| [379:39252](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=379-39252) | Personal Evaluation | Performance & evaluation | WS01 / WS07 / WS08 | Unverified: map exact role, state, route and viewport |
| [379:39736](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=379-39736) | Personal Evaluation | Performance & evaluation | WS01 / WS07 / WS08 | Unverified: map exact role, state, route and viewport |
| [9:23429](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=9-23429) | managerial dashboard | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [17:28320](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-28320) | attendance information | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:29937](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-29937) | Attendance requesat | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:30342](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-30342) | Attendance requesat bulk | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:30766](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-30766) | Attendance requesat  appriove | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:31148](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31148) | Attendance requesat  reject | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:31530](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31530) | attendance info filter status | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:31769](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-31769) | Leave requesat | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:32168](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32168) | Leave requesat bulk | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:32584](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32584) | Leave requesat  appriove | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [17:32957](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-32957) | Leave requesat  reject | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:35458](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-35458) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [66:35673](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-35673) | personal leave | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:36080](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-36080) | personal leave filter | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:36839](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-36839) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [66:41335](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-41335) | HR-mis-user | Dashboard & role | WS01 / WS06 / WS08 | Unverified: map exact role, state, route and viewport |
| [66:41793](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-41793) | team mate profile job card | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:42207](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-42207) | team mate profile analytics | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:42633](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-42633) | team mate profile analytics | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:43832](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-43832) | attendance information | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:44073](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-44073) | Attendance requesat | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:44478](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-44478) | Attendance requesat bulk | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:44902](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-44902) | Attendance requesat  appriove | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:45284](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-45284) | Attendance requesat  reject | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:45669](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-45669) | attendance info filter team | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:45910](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-45910) | attendance info filter status | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:46566](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-46566) | Leave requesat | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:46965](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-46965) | Leave requesat bulk | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:47381](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-47381) | Leave requesat  appriove | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:47754](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-47754) | Leave requesat  reject | Attendance & leave | WS01 / WS06 / WS07 | Unverified: map exact role, state, route and viewport |
| [66:48128](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-48128) | Frame 1000008696 | Ambiguous / needs owner review | WS04 | Unverified: map exact role, state, route and viewport |
| [66:48293](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-48293) | profile address | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:40714](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-40714) | Personal & Educational Information | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:40250](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-40250) | Personal and contact Details | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:40294](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-40294) | Personal and contact Details | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:40249](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-40249) | Personal Details | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:72848](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-72848) | profile start | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:40718](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-40718) | Work Experience Information add | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:40719](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-40719) | Work Experience Information add | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:41311](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-41311) | profile trainingadd | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:41348](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-41348) | bank add | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:41384](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-41384) | family & nominee add2 | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:73283](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-73283) | bank & Nominee | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:73395](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-73395) | Family & Nominee | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:73513](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-73513) | bank & Nominee | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:50331](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-50331) | bank & Nominee2_main | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:41312](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-41312) | Training Information | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [139:41313](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=139-41313) | Certification Information | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:50924](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-50924) | profile work experience | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:51095](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-51095) | profile work training | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:51258](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-51258) | profile- education | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:51456](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-51456) | profile experience | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:52651](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-52651) | edit form | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [66:53701](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-53701) | profile bank | Profile & employee records | WS06 / WS01 | Unverified: map exact role, state, route and viewport |
| [265:48972](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=265-48972) | New Application | Recruitment & requests | WS01 / WS03 | Unverified: map exact role, state, route and viewport |

### Current verified design discrepancies and blockers

1. **Primary token discrepancy** recorded by PR #45 (Figma `#08558B`, code `#085587`). Preserve the accepted production palette until canonical design-system owner resolves source of truth; no silent brand recolor.
2. Manager dashboard chart scale/denominator and Attendance/Leave column and state ownership are unresolved: see existing PR #45 and WS08 #44. Do not remove existing charts, actions, filters or policies to force visual resemblance.
3. No mapped Figma mobile counterpart was found for several management desktop frames. Treat mobile as responsive requirements derived from approved patterns, not an invented Figma frame.
4. Live Main is an authenticated RLS-filtered system workspace; its navigation is not a verified 1:1 replacement for the approved role-specific Figma experience.
5. Route-level visual audit still requires actual desktop/tablet/mobile screenshots at exact development and live commit; passing contract or disposable Auth tests cannot substitute for visual acceptance.

**Status:** Inventory established; UI implementation gaps and their count must be established by actual matched comparisons. No application, SQL, deployment or design token changed by this document.
