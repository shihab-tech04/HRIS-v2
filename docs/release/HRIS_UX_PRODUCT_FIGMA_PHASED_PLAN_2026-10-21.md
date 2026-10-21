# HRIS 360° — Full UX/Figma implementation workload & phased execution — 21 October 2026

**Scope:** Current Main HRIS and Candidate applications, approved Figma, source-backed interaction/data contracts, staging, security and controlled production release. This is an **additional UI/product delivery workstream**, not a reset or replacement of the existing canonical 22 development phases.

## Verified workload baseline

| Surface | Verified inventory | What this measures |
|---|---:|---|
| Main application routes | **36** | Distinct `PageId` keys in current `LiveHrisWorkspace.tsx`, not all individually live |
| Main Figma screen-sized root frames/states | **74** | Page 1 top-level 1800–2000px frames with height >=700; includes repeated states/variants, not 74 unique pages |
| Figma page top-level frames total | **314** | Includes desktop screens and design-system fragments; 81 desktop-width including 7 short utility frames |
| Figma full-screen distinct labels | **40** | Name labels, not canonical screens; duplicate names must remain separate state checks |
| Shared Figma components board | **13 top-level nodes** | Core component specimens; not all production components |
| Candidate route IDs | **13** | Source `CANDIDATE_TABS`; production is public-only |
| Candidate TSX page files | **17** | Includes verified/legacy/preview variants, not 17 approved Figma frames |
| Existing independent parity evidence rows | **61** | PR #45 records 4 geometry PASS, 1 primary-token FAIL, 56 BLOCKED; evidence rows are not screen inventory additions |
| Main live implementation files | **52** | TSX, utilities, localization in `src/live`; components/files not a completion metric |

**Interpretation:** Full known SURFACES are inventoried; the exact remaining count of UI fixes is **not yet measurable** until each frame/route has a matched current-source design comparison. Do not manufacture a % complete or claim every blocked check represents missing code. Candidate approved frame mapping remains explicitly unknown.

Sources: [Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9), [existing 61-row Figma parity PR #45](https://github.com/shihab-tech04/HRIS-v2/pull/45), [Main development](https://github.com/shihab-tech04/HRIS-v2/tree/development/hris-checkpoints), [Candidate development](https://github.com/shihab-tech04/HRIS-Candidate-v2/tree/development/hris-checkpoints), [Main release draft #38](https://github.com/shihab-tech04/HRIS-v2/pull/38), [Candidate release draft #5](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/5).

## Full phased delivery plan

| Phase | Specific product/design workload | Feature owners | Acceptance before gate closes |
|---|---|---|---|
| **UX-00** Freeze verified baselines + frame-to-route mapping | 74 Main Figma full-screen states, 36 Main routes, 13 Candidate routes; review existing 61 audit rows | WS04, WS03; WS01/06/07/08 validate role assignment | No duplicates, every route/state has frame/no-frame rationale and exact source SHA |
| **UX-01** Shared shell and design-system source parity | Figma Foundations + 13 components, role navigation, spacing, typography, primary-color discrepancy | WS01 + WS03; WS04 independent | Accepted token/source decision, screenshots and keyboard/responsive shell tests |
| **UX-02** Main dashboards & role-specific navigation | Personal/manager/HOD/Admin/CEO/Super Admin system paths, dashboard charts and notices | WS01/WS06/WS08 | Correct role/data semantics, current Figma states, responsive acceptance; preserve solved shell |
| **UX-03** Attendance, leave & calendaring | 25 full-size Figma states; requests, approval/rejection, filters, bulk actions, schedules | WS01/WS06/WS07 | All approved states/journeys, no business-rule invention, mobile/table/keyboard tests |
| **UX-04** Employee self-service & profile | 29 profile/records frames; personal/contact/education/bank/work, documents/ID/history | WS06 + WS02 API review | Source-approved fields, server ownership, error/recovery, Figma layout; missing RPCs gated |
| **UX-05** Organization, HR and management | Offices, units, department/team, designation/grades, approvals, Super Admin master data | WS07/WS08/WS01; WS02 contract | Role/tenant write contract approved, inactive retention, no destructive shell/refactor |
| **UX-06** Other Main workspaces & evaluation | 6 evaluation frames plus learning, payroll, projects, expense, travel, services, reporting and routes without frames | WS01/WS07/WS08 | Map accepted frames or explicit no-frame rationale; preserve existing behavior |
| **UX-07** Candidate end-to-end UX | 13 source routes, 17 TSX page variants, auth/CV/application/interview/offer/preboarding | WS03 independently | Validated Candidate design baseline, deep link/mobile/EN-BN and private-data test evidence |
| **UX-08** Main ↔ Candidate secure integration | RPCs, tenant membership, Candidate-to-HR activation, private storage, RLS, schema and CI parity | WS02/WS01/WS03; WS04 checks | Signed-in two-tenant positive/negative tests and approved forward-only migrations; no speculated prod writes |
| **UX-09** Cross-product visual, responsive & accessibility certification | Exact-commit matched Figma screenshots, all component states, EN/BN, desktop/tablet/mobile, WCAG checks | WS04 independent with all feature owners | All required routes/states PASS or reviewed N/A, no regressions; update existing PR #45 |
| **UX-10** Guarded staged live release & postrelease QA | Backup, restore proof, parity, release PRs #38/#5, Pages assets, real live URLs, rollback | WS05 exclusively | Signed-off release gates, confirmed deployed SHAs/URLs, logged issues and validated rollback |

## Parallel execution and packet rule

- Parallel **inside a phase**: Main design mapping (WS04+WS01/06), Candidate routes (WS03), API/security (WS02), management contracts (WS07/08), release parity/backup (WS05). No two workers edit the same files/branch without an explicit handoff. Main and Candidate products use separate repositories.
- **Small packets**: one source-backed route+state or one component-contract issue at a time; target **15–30 minutes** of execution, not multi-hour batches. Packet shape: current SHA → Figma node/accepted pattern → current behavior → actual issue → smallest scoped change → test/visual proof → WS04 status → WS05 release decision.
- **Phases 00–01** build the approved design source map and shared shell gate. Candidate visual audit and security work may run simultaneously; Main dashboard/Employee/Attendance can run in separate files once ownership and exact role mapping are verified.
- **Never redesign unrelated areas** or remove existing controls. Figma primary token #08558B vs existing app #085587 is a **verified mismatch pending canonical decision**, not authority to recolor blindly. Existing global rules: Poppins, stable shell, responsive, focus/contrast/accessibility, no unapproved fields/SQL, sole Super Admin, no silent production writes.
- **All roles**: Employee, Manager, HOD, HR, Admin, Super Admin, CEO and Candidate need real accessible journeys; one `hr_admin` view selector does not certify them.
- **Quality gates**: Figma matched viewport and state, 375/768/1280/1920 responsiveness, EN/BN, keyboard/screen-reader, errors/empty/loading/success/recovery, Auth/RLS cross-tenant denial, approved source data, exact-head CI, independent QA, external versioned source + DB snapshot restore proof, guarded release.
- **Release gate**: WS05 alone merges and deploys after approvals. Main/Candidate `main` remain source of live deployment, development PRs are not live. Preserve approved applications unless each gate passes.

## Initial independent parallel packets — START with Phase UX-00

1. **Main-Figma-00A (WS04, docs-only)**: Crosswalk each of 74 full-screen Figma root frames with the 61 existing parity rows, 36 Main routes and correct role/state. Do not label geometry checks as pixel match. Output mismatch/missing mapping ledger.
2. **Candidate-00B (WS03, Candidate repo)**: Enumerate and inspect all 13 routes and production public-only gating; locate approved Candidate Figma frames or propose explicit no-frame rationale for decision. Output route/evidence matrix with actual live-vs-dev status.
3. **Main-Component-00C (WS01/WS06, read-only)**: Inventory Figma Foundations and 13 component specimens vs current code; isolate token/color, typography, nav and table component discrepancies without UI edits.
4. **Security-00D (WS02, read-only + disposable tests)**: Inventory current blockers for signed-in employee and Candidate/HR routes, privileges, RPCs, and two-tenant auth tests. No production DB writes.
5. **Release-00E (WS05, read-only)**: Compare exact main/dev/PR heads, failed Pages parity, current deployed URLs and independent backup/restore readiness; keep RELEASE HOLD.

**Completion definition for UX-00:** Route+frame matrix has full inventory, each item classified MATCHED/FAIL/UNMAPPED/N/A with provenance, required owners and repair packet; then calculate credible remaining UX implementation packet count and move to UX-01. Do not conflate frame count with story count, and do not reset existing PR #45 findings.

## Main route source inventory (36)
`dashboard`, `attendance`, `shift-roster`, `leave`, `projects`, `platform-tenants`
`teams`, `employees`, `onboarding`, `performance`, `recruitment`, `referrals`
`holidays`, `learning-requests`, `learning-completions`, `learning-programs`, `travel`, `expenses`
`payroll-register`, `service-requests`, `profile-change-review`, `my-profile-changes`, `my-dashboard`, `my-projects`
`my-roster`, `my-notifications`, `my-announcements`, `my-performance`, `my-learning`, `my-payslips`
`my-documents`, `my-leave`, `my-timesheets`, `my-travel`, `my-expenses`, `my-service-requests`


## Scheduling/execution reality

GitHub commits/PRs are durable work artifacts but **do not automatically run separate ChatGPT workstations**. Parallel execution may be performed in this active session through independent connector tasks/branches. For autonomous, concurrent full browser+code workflows, use ChatGPT Work; the user must open Work mode to launch Work sessions. Never claim an inactive chat or saved GitHub comment continues executing by itself.

**State at creation:** Document-only, no app code changes, production writes, merge or deployment.
