# WS07 Attendance and Leave Figma packet

**Status:** Source-backed implementation and focused acceptance evidence. Full shell and tab parity remains with WS01; visual signoff remains with WS04/WS05.

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
- Leave day count, decision note, and evidence download remain available in the request detail cells to preserve existing behavior.
- English and Bengali labels were added for the new HR Operations controls and request fields.
- WS01 was notified on PR #49 that Attendance Information and Attendance Requests are separate Figma tabs. WS07 exposes `#attendance-correction-requests` and leaves shared tab routing with WS01.
- Captures use synthetic local browser fixtures. Attendance request images are table crops from the 1920×1080 browser viewport because separate-tab routing is part of WS01's shell work. They are implementation evidence, not a full-shell pixel certification.

## Screenshot evidence

| Evidence | Capture |
| --- | --- |
| Attendance Information desktop | [`attendance-information-desktop-20261021.png`](../evidence/attendance-information-desktop-20261021.png) |
| Attendance Information mobile | [`attendance-information-mobile-20261021.png`](../evidence/attendance-information-mobile-20261021.png) |
| Attendance Information normal table crop | [`ws07-attendance-information-normal-table-crop-20261021.png`](../evidence/ws07-attendance-information-normal-table-crop-20261021.png) |
| Attendance Information filtered table crop | [`ws07-attendance-information-filtered-table-crop-20261021.png`](../evidence/ws07-attendance-information-filtered-table-crop-20261021.png) |
| Attendance Requests normal | [`ws07-attendance-requests-normal-table-crop-20261021.png`](../evidence/ws07-attendance-requests-normal-table-crop-20261021.png) |
| Attendance Requests selected | [`ws07-attendance-requests-selected-table-crop-20261021.png`](../evidence/ws07-attendance-requests-selected-table-crop-20261021.png) |
| Attendance Requests approved | [`ws07-attendance-requests-approved-table-crop-20261021.png`](../evidence/ws07-attendance-requests-approved-table-crop-20261021.png) |
| Attendance Requests rejected | [`ws07-attendance-requests-rejected-table-crop-20261021.png`](../evidence/ws07-attendance-requests-rejected-table-crop-20261021.png) |
| Attendance Requests filtered by approved status | [`ws07-attendance-requests-filtered-approved-table-crop-20261021.png`](../evidence/ws07-attendance-requests-filtered-approved-table-crop-20261021.png) |
| Attendance Requests filtered by rejected status | [`ws07-attendance-requests-filtered-rejected-table-crop-20261021.png`](../evidence/ws07-attendance-requests-filtered-rejected-table-crop-20261021.png) |
| Leave Requests normal, selected, approved, rejected | [`normal`](../evidence/ws07-leave-requests-normal-1920x1080.png) · [`selected`](../evidence/ws07-leave-requests-selected-1920x1080.png) · [`approved`](../evidence/ws07-leave-requests-approved-1920x1080.png) · [`rejected`](../evidence/ws07-leave-requests-rejected-1920x1080.png) |
| Leave Requests mobile | [`ws07-leave-requests-mobile-375x812.png`](../evidence/ws07-leave-requests-mobile-375x812.png) |

## Verification

- `npm run lint` — passed.
- `node --test tests/contracts/attendance-report.test.mjs tests/contracts/leave-absence-calendar.test.mjs` — 16/16 passed.
- Focused Chromium browser run for `attendance-information.spec.ts`, `hr-operations-leave-request-states.spec.ts`, and `manager-leave.spec.ts` — 3/3 passed. This covers normal, selected, approved, rejected, status-filtered, English/Bengali, loading/error/retry, existing manager decisions, and mobile overflow.
- `npx vite build` — passed. Vite reports the existing client bundle exceeds its 500 kB warning threshold.
- Playwright used the local cached Chromium 140 build because the requested browser download returned an empty archive; no dependency or lockfile changes were made.

## Next canonical work

Figma metadata review found no approved story-level mapping for the next HR03 organization frames. The canonical next story remains HR03-01, blocked on Product's legal-entity decisions and WS02's schema/API/permission contract. HR02 stories remain unclassified in the readiness overlay, and Candidate conversion remains outside this task's scope. No unsupported organization, employee, Candidate, or Management action was added.
