# WS07 Attendance and Leave frame-state register

**Scope:** HR02–HR33 module content only. Shared shell/HR01 remain with WS01; permission and API contracts with WS02; Manager/HOD decisions with WS08; independent parity review with WS04; integration/release with WS05.

**Figma:** [HRIS-v2 approved design](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)
**PR:** [#43](https://github.com/shihab-tech04/HRIS-v2/pull/43)
**Base checkpoint verified before this packet:** `f46610241c518189c3c1ff82a48fdcb83c47e0c8`
**Implementation source SHA:** pending PR update; the exact final branch head and its GitHub Actions run will be recorded in the PR review comment.
**Current decision:** implementation patch prepared; Attendance/Leave parity is not complete until exact-head Actions pass and WS04 confirms corrected frame-state screenshots.

## Frame-state register

| Figma frame/state | Implemented fields and actions | Supporting source contract | Verification and evidence | Status / blocker |
| --- | --- | --- | --- | --- |
| Attendance Information — normal `17:28320` | `Name, Designation, Team Name, Department, From date, Work Location, In Time, Out Time, Status`; source-backed search, date/status filters, CSV export. Employee number and work hours remain available where needed by the existing export contract, without extra visible table columns. | `hris_get_tenant_attendance_data` using the active tenant; existing `attendance.view` / `attendance.manage` visibility and `reports.view` report gate. | `attendance-information.spec.ts`; `attendance-report.test.mjs`; EN/BN 375/768/1280/1920 screenshots in the exact-head Actions artifact. | Pending exact-head workflow and WS04 field/geometry parity. No canonical HR story ID has been approved for this information frame; no story acceptance is claimed. |
| Attendance Information — status filtered `17:31530` | The same field order; selected attendance status filters the returned tenant-scoped rows and CSV. | Existing `hris_get_tenant_attendance_data` status and tenant arguments; multiple selected statuses filter the authorized detail result client-side. | `attendance-information.spec.ts` verifies single and multiple status selection, date and search submission, export, empty/error/retry and responsive overflow. | Pending exact-head workflow and WS04 screenshot review. |
| Attendance Requests — normal `17:29937` | `Name, Date, In Time, Out Time, Applying Date, Remarks, Action`; pending-only selection and authorized row-level approve/reject controls. | `hris_get_tenant_attendance_data` correction rows; existing `admin_resolve_attendance_correction` and `attendance.manage`. | `attendance-information.spec.ts`; normal-state and loading/error/retry screenshots in Actions artifact. | Pending exact-head workflow and WS04 field/row-geometry parity. Canonical HR story mapping is unresolved; do not claim HR05 configuration acceptance. |
| Attendance Requests — selected `17:30342` | Figma selection presentation; selected bulk icons remain disabled and cannot call an unverified bulk operation. | No bulk resolver exists; single-row resolver remains the only supported write. | Browser test selects pending rows and asserts both bulk controls stay disabled and no decision call occurs. | Supported behavior is bounded; WS04 must confirm visual parity. |
| Attendance Requests — approved / rejected `17:30766` / `17:31148` | Resolved view uses back-arrow title, approved/rejected status, no selection checkbox or decision actions; rejection note remains visible when provided. | Existing single-row resolver and tenant-scoped correction history. | Browser test verifies row actions, status filters, resolved presentation, note, dialog keyboard use, and mobile dialog bounds. | Pending exact-head workflow and WS04 review. No row-detail API or navigation contract was found; none was added. |
| Leave Requests — normal `17:31769` | `Name, Applicable From, Applicable To, Leave Type, Applying Date, Remarks, Action`; tenant-scoped search/date/status filters, pending selection, evidence download, authorized row actions. | `hris_get_tenant_leave_data`; private authenticated Storage evidence; existing `leave.view` / `leave.manage`. | `hr-operations-leave-request-states.spec.ts`; `leave-absence-calendar.test.mjs`; EN/BN 375/768/1280/1920 screenshots in Actions artifact. | Pending exact-head workflow and WS04 field/geometry parity. |
| Leave Requests — selected `17:32168` | Figma selection presentation; bulk approve/reject icons remain disabled and issue no resolver call. | No bulk resolver exists; `admin_resolve_leave_request` accepts one request ID per call. | Browser test verifies selected controls remain disabled and the resolver call list stays empty. | WS04 visual review pending. |
| Leave Requests — approved / rejected `17:32584` / `17:32957` | Resolved title and capitalized status; no pending selection/actions. Row rejection retains the existing optional decision-note dialog. | Existing `admin_resolve_leave_request` behind `leave.manage`. | Browser test covers real mocked row-level approve/reject calls, note persistence, status filter, negative role, and mobile rejection-dialog bounds. | Exact-head workflow and WS04 review pending; approval meaning remains within WS08's Manager/HOD ownership. |
| Leave calendar and policy | Existing calendar, approved-only leave rendering, date-range reads, policy manager, holidays and balances are retained on their existing module routes. No policy schema or API change. | Existing tenant-scoped `hris_get_tenant_leave_data`, policy reader/writer and permission gate. | Browser regression test visits calendar/policy; Manager leave browser test and leave calendar contracts run in the same workflow. | Preserve behavior; no new policy or calendar story is claimed in this packet. |

## Canonical story mapping and ownership

| Story ID | Implemented field/action in this packet | Supporting contract / test | Remaining blocker and acceptance status |
| --- | --- | --- | --- |
| `HR09-04` — view leave requests | The request queue field order, filters, status presentation, evidence and request rows. | Tenant-scoped `hris_get_tenant_leave_data`; `hr-operations-leave-request-states.spec.ts`; leave calendar contract test. | Partial UI implementation only. Exact-head Actions and WS04 frame-state parity review are required before acceptance. |
| `HR09-05` — HR-level approvals where workflow requires | Existing authorized single-row leave approve/reject controls only; rejection note uses the existing resolver. | `admin_resolve_leave_request` gated by `leave.manage`; browser checks allowed and denied controls and verifies exact resolver payloads. | Partial UI implementation only. WS08 owns Manager/HOD semantics; WS02 owns any permission/API contract changes. HR completion is not claimed. |
| No approved HR ID mapped — Attendance Information | Fields, search, filters, status, export and responsive table only. | Tenant-scoped attendance read; browser + contract checks listed above. | Canonical source does not map this Figma frame to an HR story. Product/WS04 story mapping remains open; no neighboring HR05 or HR33 ID is inferred. |
| No approved HR ID mapped — Attendance Requests | Existing attendance correction rows and authorized row-level decisions only. | Tenant-scoped correction rows and `admin_resolve_attendance_correction` behind `attendance.manage`; browser checks listed above. | Canonical HR story mapping remains open. Employee correction (`E05`/`E06`) is outside WS07; Manager review (`M02-03`) is WS08-owned. No mapping or acceptance is claimed for those stories. |

HR05-01 through HR05-08 remain Attendance Configuration stories and were not implemented by this request-table packet. HR08-01 through HR08-10 remain Leave Configuration stories; the existing leave policy surface was preserved without claiming new configuration behavior. HR09-01 through HR09-03 and HR09-06 are not balance adjustment or audit-history work and remain untouched. HR03-01 and later organization work stay blocked until product/API contracts are approved and are not started before WS04 accepts this packet.

## Verification record

- Local `npm run lint` — passed after this source patch.
- Local `node --test tests/contracts/attendance-report.test.mjs tests/contracts/leave-absence-calendar.test.mjs` — 16/16 passed.
- Local `npx vite build` — passed; existing bundle-size warning remains.
- Local Playwright could not launch Chromium: the environment had no executable and its browser download returned a corrupt empty archive. No browser pass is claimed for this patch.
- Exact-head GitHub Actions — pending push; workflow `WS07 Attendance and Leave Figma acceptance` runs lint, focused contracts, production bundle, the Attendance/Leave/Manager browser journeys and uploads screenshot evidence.
- WS04 independent review — pending. Do not mark Attendance or Leave complete, and do not start the next canonical frame, until WS04 reports screenshot parity and the exact-head tests pass.

## Coordination and non-goals

- WS01: `#attendance-correction-requests`, `#leave-calendar`, and `#leave-policy` are module routes only. Shared-shell tabs and HR01 integration remain WS01-owned.
- WS02: this packet uses existing APIs/permissions only. No RPC, SQL, role, or schema contract was added.
- WS08: Manager leave workflow remains a regression target and was not changed. Manager/HOD ownership is unchanged.
- WS04: review the exact field sequence, status controls, selected/resolved states, row height/gap/avatar, and mobile overflow using the linked artifact.
- WS05: no protected integration, merge, production write, or deployment was performed.
