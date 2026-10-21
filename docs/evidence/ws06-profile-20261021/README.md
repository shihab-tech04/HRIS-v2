# WS06 Employee Profile Figma evidence

Checkpoint date: 2026-10-21  
Repository: `shihab-tech04/HRIS-v2`  
PR: [#52](https://github.com/shihab-tech04/HRIS-v2/pull/52) (draft), stacked on [Figma asset PR #51](https://github.com/shihab-tech04/HRIS-v2/pull/51)  
Verified starting head: `62afa0edf224a7cb0b0e54a11fe408b71afb8322`  
Approved design: [Figma file](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9), priority frame [66:72042](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-72042)

## Source-backed implementation

`LiveHrisWorkspace` mounts this screen at the Employee-only **My Profile** page. It calls the existing tenant-scoped `hris_get_my_dashboard_data(p_tenant_id)` RPC and renders only its supported own-employee fields: `full_name`, `employee_number`, `official_email`, `official_phone`, `designation_title`, `department_name`, and `team_name`. It checks a returned top-level or employee `tenant_id` when present and ignores a response after the requesting tenant changes.

Figma identity details, addresses, employment dates/type/location/manager, education, experience, training, certification, bank, family, nominee, and verification fields have no approved Employee read source in this checkpoint. Their approved labels and card structure render with localized unavailable states. No schema, RPC payload, direct table read, or sample employee information was added. The portrait is a generated initials tile from the authenticated employee name; the Figma sample portrait and profile values are not used.

All Add, Edit, and unsupported View actions are disabled. The add/edit form overlays represented by the design remain blocked until WS02 confirms their exact RPC and RLS requirements. Existing dashboard, digital ID card, profile-change requests, document vault, and attendance-correction services were left unchanged.

| Employee-facing area | Current implementation | Checkpoint treatment |
|---|---|---|
| Dashboard | `LiveHrisWorkspace` → `my-dashboard` / `EmployeeOverview` | Preserved; existing dashboard RPC and `EmployeeIdentityCard` use `hris_get_my_employee_identity_card` |
| Profile and personal information | `LiveHrisWorkspace` → Employee-only `my-profile` / `EmployeeProfileFigma` | Updated with the approved profile frame and five section tabs |
| Education, experience, training, banking, family, nominees | `my-profile` selected in-page tab | Visual sections represented; unsupported read data stays unavailable |
| Profile change requests | `my-profile-changes` / `EmployeeProfileChangeRequests` | Preserved |
| Documents | `my-documents` / `EmployeeDocumentVault` | Preserved; no upload access added to this screen |
| Attendance correction | `my-dashboard` / `PersonalAttendanceCorrections` | Preserved; maps to Figma node `66:53913` |

## Render comparison

The local browser fixture uses sparse data, so every image below contains only unavailable states and no employee data. The main capture is at the exact Figma frame viewport size. Figma metadata places the profile image frame at `(326, 102)` with a size of `203×203`; the captured fixture has the same position and size. It does **not** claim 1:1 parity: Figma shows populated summary details and two education records; the approved RPC exposes only the fields listed above, and there is no approved education read service. The safe single education placeholder therefore leaves unused space in the 2063-pixel viewport. The write-form overlays are not rendered because their writes are not accepted.

Focused visual correction for the measured differences: the first profile tab is 313px wide at desktop and the tab row is 54px tall; the personal-information card begins at y=408 and the first detail card begins at y=520. The English/Bengali official-phone labels include “Number”/“নম্বর”. The exact-head CI screenshot artifact linked from PR #52 checks is authoritative for this correction; the PNGs listed below are the prior visual checkpoint and should not be used to accept the corrected geometry. The Figma node context and screenshot place the tab row itself at y=329. WS04’s ≈283/313 pair refers to the first tab width, now set to the Figma width.

| Screenshot | Figma node(s) represented | Capture |
|---|---|---|
| `profile-main-frame-en-1920x2063.png` | [66:72042](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-72042) | Full 1920×2063 local fixture viewport |
| `personal-education-en-1920.png` | [66:72042](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-72042), [66:51258](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-51258) | 1920 viewport, profile content crop |
| `personal-education-en-375.png`, `personal-education-bn-375.png` | 66:72042, 66:51258 | 375 viewport, profile content crop |
| `personal-education-bn-1920.png` | 66:72042, 66:51258 | 1920 viewport, profile content crop |
| `work-experience-en-1920.png` | [66:50924](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-50924), [66:51456](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-51456) | 1920 viewport, Work Experience content crop |
| `training-certification-en-1920.png` | [66:51095](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-51095), [66:51889](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-51889) | 1920 viewport, Training content crop |
| `bank-en-1920.png` | [66:53701](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-53701), [66:73283](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-73283) | 1920 viewport, Bank content crop |
| `family-nominee-en-1920.png` | [66:73395](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-73395), [66:54593](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-54593) | 1920 viewport, Family & Nominee content crop |

The interactive fixture also tests the five section panels at 375, 768, 1280, and 1920 pixels in both EN and BN, keyboard navigation, all disabled write controls, loading, empty, error/retry, and top-level/employee-level tenant mismatch responses. It uses no production data or write service.

## 29 registered Employee/profile-record Figma states

Routes below refer to the current app page and the selected in-page panel. Add/edit overlays remain intentionally unavailable; the visible panel layouts do not imply that their data contracts or workflows are complete.

| Figma node | Registered frame/state | Current route and mapping | Status |
|---|---|---|---|
| `66:72042` | `profile _main` | My Profile → Personal & Educational Information | Profile structure rendered; unsupported data unavailable |
| `66:72465` | `profile personal & education2` | My Profile → Personal & Educational Information | Variant structure represented; education data unavailable |
| `66:72665` | `profile personal & education2` | My Profile → Personal & Educational Information | Variant structure represented; education data unavailable |
| `66:72848` | `profile start` | My Profile → loading state | Loading state implemented and tested |
| `66:72990` | `profile Work experienceadd` | My Profile → Work Experience → Add overlay | Blocked; Add disabled pending WS02; overlay not implemented |
| `66:49681` | `profile trainingadd` | My Profile → Training & certification → Add overlay | Blocked; Add disabled pending WS02; overlay not implemented |
| `66:73088` | `bank add` | My Profile → Bank → Add/Edit overlay | Blocked; writes disabled pending WS02; overlay not implemented |
| `66:73186` | `family & nominee add2` | My Profile → Family & Nominee → Add overlay | Blocked; Add disabled pending WS02; overlay not implemented |
| `66:73283` | `bank & Nominee` | My Profile → Bank / Family & Nominee | Both view panels represented; bank/nominee data unavailable |
| `66:73395` | `Family & Nominee` | My Profile → Family & Nominee | Panel structure rendered; family/nominee data unavailable |
| `66:73513` | `bank & Nominee` | My Profile → Bank / Family & Nominee | Both view panels represented; data unavailable |
| `66:50331` | `bank & Nominee2_main` | My Profile → Bank / Family & Nominee | Both view panels represented; data unavailable |
| `66:50466` | `profile training2` | My Profile → Training & certification | Panel structure rendered; training/certification data unavailable |
| `66:50924` | `profile work experience` | My Profile → Work Experience | Panel structure rendered; experience data unavailable |
| `66:51095` | `profile work training` | My Profile → Training & certification | Panel structure rendered; training data unavailable |
| `66:51258` | `profile- education` | My Profile → Personal & Educational Information | Education fields represented; education data unavailable |
| `66:51456` | `profile experience` | My Profile → Work Experience | Panel structure rendered; experience data unavailable |
| `66:51724` | `experience2` | My Profile → Work Experience record layout | Record fields represented with safe unavailable state |
| `66:51889` | `training & Certification` | My Profile → Training & certification record layout | Record fields represented with safe unavailable state |
| `66:53701` | `profile bank` | My Profile → Bank | Panel structure rendered; bank data unavailable |
| `66:53913` | `personal` (Request for Attendance Update) | `my-dashboard` → `PersonalAttendanceCorrections` dialog | Existing self-service flow preserved; no change |
| `66:54058` | `education` | My Profile → Personal & Educational Information → Education form | Blocked; writes disabled pending WS02; form not implemented |
| `66:54101` | `experience` | My Profile → Work Experience → Add overlay | Blocked; Add disabled pending WS02; form not implemented |
| `66:54169` | `training add` | My Profile → Training & certification → Add overlay | Blocked; Add disabled pending WS02; form not implemented |
| `66:54263` | `experience edit` | My Profile → Work Experience → Edit overlay | Blocked; Edit disabled pending WS02; form not implemented |
| `66:54338` | `training edit` | My Profile → Training & certification → Edit overlay | Blocked; Edit disabled pending WS02; form not implemented |
| `66:54445` | `Bank add` | My Profile → Bank → Add overlay | Blocked; Add/Edit disabled pending WS02; form not implemented |
| `66:54485` | `family & nominee add overlay` (symbol) | My Profile → Family & Nominee → Add overlay | Blocked; Add disabled pending WS02; overlay not implemented |
| `66:54593` | `nominee` | My Profile → Family & Nominee record layout | Fields represented with safe unavailable state |

## Verification and review status

- Local TypeScript, repository contracts, and build: PASS; all 351 contract tests passed. Vite reports the repository's existing large JavaScript chunk warning.
- Previous checkpoint Chromium browser tests: 2/2 passed. They cover all five panels × EN/BN × 375/768/1280/1920, the exact 1920×2063 viewport, the 203×203 profile-image anchor, loading/empty/error/retry, keyboard tabs, disabled actions, tenant mismatch, and tenant-switch stale-data clearing. The current focused run adds regression checks for the corrected tab/card/detail geometry and EN/BN phone label.
- UI employee-only and tenant-response guards: verified in the browser fixture and branch acceptance assertions. Hosted Auth/Postgres cross-tenant denial was not rerun: WS02's PR #52 handoff says the Employee membership rule for the existing dashboard RPC remains unresolved, and the local container has no Docker/Supabase CLI. Do not treat the client guard as a substitute for WS02's real-Auth acceptance.
- Exact-head GitHub Actions and screenshot artifact: follow the current [PR #52 checks](https://github.com/shihab-tech04/HRIS-v2/pull/52/checks). The current-head run executes the geometry/copy regression assertions and uploads fresh screenshots for independent review.
- Independent WS04 acceptance: request the current-head screenshot artifact only; review status is tracked in the [PR review thread](https://github.com/shihab-tech04/HRIS-v2/pull/52#issuecomment-6312821250).
- No database writes, merges, deployments, shared-shell changes, or non-Employee module edits.

## Source hashes

Hashes below are SHA-256 for recovered original PR #51 assets, this checkpoint's source, and the published screenshot artifacts.

| File | SHA-256 |
|---|---|
| `.github/workflows/ws06-profile-figma-acceptance.yml` | `a8ad4ee91048f2b43dffc770f682f615c201859ce9bedcee7048c41e7772d16c` |
| `src/live/EmployeeProfileFigma.tsx` | `a37cc5f4511520332143c5bf0dc80d3199906177e73ceb1052970d081bf5050f` |
| `tests/browser/employee-profile-figma.spec.ts` | `df842e92345d25dbecb77474ed80f0dd10825c50a3a12715aa92f2fae2ee1bcb` |
| `tests/browser/employee-profile-harness.html` | `c3291ed85889629353dfa5a6c34f50e497285c5a077c7f95c16fa7b0e0207b7e` |
| `tests/browser/employee-profile-harness.tsx` | `2519e566cb8af67b3e69d4b7723ffec1ee5aa89742b9f5b350c7d123a6241e09` |
| `docs/evidence/ws06-profile-20261021/bank-en-1920.png` | `54103f4a8c1ffa479e3a3896fc34265abe7bd5a3c8316b07bc56c83cf4573192` |
| `docs/evidence/ws06-profile-20261021/family-nominee-en-1920.png` | `a4545da6668b6fb33338c6a84c683af42d7a163b1ed89edc216a7f30d1b2834f` |
| `docs/evidence/ws06-profile-20261021/personal-education-bn-1920.png` | `bebad21cd2b44f3db316b1be0d2638e0c0223a3b068b681373fd3d7481b26644` |
| `docs/evidence/ws06-profile-20261021/personal-education-bn-375.png` | `dfd1710c003eeba75df67d0cdd8b6decee1ca5f2e4281b0431a4d6ff58b41619` |
| `docs/evidence/ws06-profile-20261021/personal-education-en-1920.png` | `36743afae43256a43816296c0b10f56447155d4c701b62210c79226f935a7f4c` |
| `docs/evidence/ws06-profile-20261021/personal-education-en-375.png` | `abf0f6ff8c6506f3aef4ef2f89c44f8c3fb0f22a35dcc3d9437f9dc73572564b` |
| `docs/evidence/ws06-profile-20261021/profile-main-frame-en-1920x2063.png` | `94ad0736fcfb33d069fc2dee859c4f63ec7b582ab47b0117566590f21f2f7bae` |
| `docs/evidence/ws06-profile-20261021/training-certification-en-1920.png` | `84309ffd80b0cf8562445e067ab437908d06012bb22e1de0a947b1b25b18a4ce` |
| `docs/evidence/ws06-profile-20261021/work-experience-en-1920.png` | `4cb1f1888786e8ede52329287409f3e9b6fbfca328e48c59c3441034fabe638d` |
| `src/assets/employee-figma/address-book.svg` | `e8bf8fa405e568ab40642576bc136faa8ecdf060993c155552dcde93ec6c76a8` |
| `src/assets/employee-figma/document-check.svg` | `e9c1ac7e43bd8826ad66d9102360ab107c22283123e422024ef39826912c30fd` |
| `src/assets/employee-figma/edit-pen.svg` | `dd4e8787a4423935dbdc9f77c655369584aef7bb75ed24cbec3caa06906837dc` |
| `src/assets/employee-figma/graduation-cap.svg` | `1d8ca4fb543d1c3af6b56d63efb9793ab4acc1f0bc7b42538770a5629647ed17` |
| `src/assets/employee-figma/pdf-document-icon.svg` | `721b89769c6d703c0bf9fffd7269958a6aca1c9cc8de02fcff84e2cafa9f043c` |
| `src/assets/employee-figma/view-eye.svg` | `d7a5448cd4cbc30c6d2dd729d3ab47fdce74d30b586d4c0e6ba5c372f1ac0636` |

