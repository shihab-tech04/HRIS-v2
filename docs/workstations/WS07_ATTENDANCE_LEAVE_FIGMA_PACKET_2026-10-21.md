# WS07 Attendance and Leave Figma packet

**Status:** Source-backed Attendance and Leave implementation; exact-head browser acceptance and WS04 parity signoff remain open. Full shell and tab ownership remains with WS01.

## Scope and approved frames

This packet covers the HR Operations Attendance Information, Attendance Requests, and Leave Requests screens. It does not change the shared shell, HR01, employee self-service, Candidate, Management, production data, database schema, RPC signatures, permissions, merge state, or deployment.

| Screen or state | Figma node |
| --- | --- |
| Attendance Information | `17:28320` |
| Attendance Information filtered by status | `17:31530` |
| Attendance Requests normal | `17:29937` |
| Attendance Requests selected | `17:30342` |
| Attendance Requests approved | `17:30766` |
| Attendance Requests rejected | `17:31148` |
| Leave Requests normal | `17:31769` |
| Leave Requests selected | `17:32168` |
| Leave Requests approved | `17:32584` |
| Leave Requests rejected | `17:32957` |

## Source-backed behavior

- Attendance information and correction requests continue to read from tenant-scoped `hris_get_tenant_attendance_data`. The request table uses source fields for attendance date, requested in/out time, work mode, requested-at date, reason, status, and resolution note.
- Attendance decisions still call the existing single-row `admin_resolve_attendance_correction` path behind `attendance.manage`. A rejection note remains optional and visible in the correction history. No bulk resolver is available, so bulk controls remain disabled.
- Leave requests continue to read from tenant-scoped `hris_get_tenant_leave_data`. The queue uses applicable dates, leave type, submitted date, reason, requested days, status, resolution note, and private evidence reference.
- Leave decisions still call the existing single-row `admin_resolve_leave_request` path behind `leave.manage`. Private evidence downloads still go through the authenticated Storage client.
- The existing leave calendar, date range, search and status filters, policy, holiday view, evidence download, and manager approval/rejection workflow remain in place.

## Implementation notes

- Attendance status selection supports single and multiple source statuses. Multi-status filtering fetches the tenant-authorized detail set and filters the returned rows in the UI; it does not invent a server contract.
- Request tables now follow the Figma fields and action presentation. Pending rows show row-level decisions; resolved rows show approved/rejected text. Selection is available, while unsupported bulk decisions stay disabled.
- Approved and rejected tables use a `Status` header; pending and selected tables retain `Action`. Attendance filtered status results use the Figma `Date` header, and the Attendance Information status summary uses the approved quote style.
- Request rows use the observed 80px geometry, 6px row gap, and 48px avatar. The browser suite captures clean full-page request states and verifies the table geometry.
- Leave day count, decision note, and evidence download remain available in the request detail cells to preserve existing behavior.
- English and Bengali labels were added for the new HR Operations controls and request fields.
- WS01 was notified on PR #49 that Attendance Information and Attendance Requests are separate Figma tabs. WS07 exposes `#attendance-correction-requests` and leaves shared tab routing with WS01.
- Captures use synthetic browser fixtures and full-page screenshots at the exact source SHA. GitHub Actions uploads Attendance Information and Attendance Requests English/Bengali evidence at 375/768/1280/1920, plus normal/selected/approved/rejected state captures and Leave/Manager evidence. These artifacts support WS04 review; they do not replace its independent signoff.

## Screenshot evidence

| Evidence | Capture |
| --- | --- |
| Attendance Information desktop | [`attendance-information-desktop-20261021.png`](../evidence/attendance-information-desktop-20261021.png) |
| Attendance Information mobile | [`attendance-information-mobile-20261021.png`](../evidence/attendance-information-mobile-20261021.png) |
| Attendance Information normal and filtered | Full-page captures in the exact-head `ws07-hr-frame-evidence-<SHA>` Actions artifact |
| Attendance Requests normal, selected, approved, rejected | Full-page 1920×1080 captures in the same exact-head artifact |
| Attendance Requests EN/BN responsive states | 375/768/1280/1920 captures in the same exact-head artifact |
| Leave Requests normal, selected, approved, rejected and mobile | Captures in the same exact-head artifact |

## Verification

- `npm run lint` — passed.
- `node --test tests/contracts/attendance-report.test.mjs tests/contracts/leave-absence-calendar.test.mjs` — 16/16 passed.
- A prior checkpoint reported 3/3 Chromium journeys passed; those results do not cover this follow-up patch.
- `npx vite build` — passed. Vite reports the existing client bundle exceeds its 500 kB warning threshold.
- Current local `npm run lint`, the 16 focused Attendance/Leave contract tests, and `npx vite build` — passed after the latest changes.
- Local Playwright remains unavailable because this environment has no usable Chromium executable. No local browser pass is claimed; the exact-head GitHub Actions run and screenshots are required before WS04 review.

## Next canonical work

Figma metadata review found no approved story-level mapping for the next HR03 organization frames. The canonical next story remains HR03-01, blocked on Product's legal-entity decisions and WS02's schema/API/permission contract. HR02 stories remain unclassified in the readiness overlay, and Candidate conversion remains outside this task's scope. No unsupported organization, employee, Candidate, or Management action was added.

## Reverification packet started from PR head `fe82ed7`

This follow-up tightens the Attendance Information field sequence and separates the Attendance Requests module route, aligns the Leave Requests table with the approved field order and resolved states, and adds retry behavior for attendance-correction read errors. The prior “3/3 local Chromium” result above refers to the earlier checkpoint and does not verify this follow-up patch.

The follow-up adds exact resolved-state headers, full-screen eight-row Attendance Requests frames, the filtered Attendance Information header, and row geometry checks. Local TypeScript lint, 16 focused Attendance/Leave contracts, and `npx vite build` pass. Local Playwright could not launch because this environment has no usable Chromium binary. Exact-head GitHub Actions and WS04 visual acceptance remain pending. See the [frame-state register](WS07_ATTENDANCE_LEAVE_FRAME_STATE_REGISTER_2026-10-21.md) for story mapping and blockers. Do not treat Attendance or Leave as complete until both gates pass.
