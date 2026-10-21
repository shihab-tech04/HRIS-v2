# WS08 management/admin Figma node map

**Figma file:** [Synesis HRIS](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)

**Figma page:** Page 1, node `0:1`
**Current checkpoint:** PR #44, Manager Attendance Report only.

## Manager states

| State | Approved Figma node | Current app route and gate | WS08 status |
| --- | --- | --- | --- |
| Managerial Dashboard | `9:22640`; chart `9:22784` | `dashboard`; existing `dashboard.view` permission and tenant dashboard data | Previously implemented in PR #44 |
| Attendance Information | `17:28320`; report table `17:28321` | `attendance`; report-only view uses `reports.view`; detail view remains separately gated | Implemented and tested in this checkpoint |
| Attendance Information — status filter | `17:31530` | `attendance`; status filtering stays on the authorized detail path | Mapped; visual acceptance pending |
| Attendance Information — team filter | `66:45669` | `attendance`; tenant-derived team options and applied report filter | Mapped; visual acceptance pending |
| Attendance request | `17:29937` | `attendance`; correction review requires existing attendance management permission | Mapped; visual acceptance pending |
| Attendance request — bulk | `17:30342` | No bulk decision behavior in the current supported flow | Mapped; bulk action remains unavailable |
| Attendance request — approve | `17:30766` | Existing single correction decision path | Mapped; visual acceptance pending |
| Attendance request — reject | `17:31148` | Existing rejection dialog and decision path | Mapped; visual acceptance pending |
| Leave request | `17:31769` | `leave`; queue reads are tenant-scoped | Mapped; visual acceptance pending |
| Leave request — bulk | `17:32168` | No bulk leave decision behavior in the current supported flow | Mapped; bulk action remains unavailable |
| Leave request — approve | `17:32584` | Existing `admin_resolve_leave_request` path; server requires `leave.manage` on the request tenant | Mapped; visual acceptance pending |
| Leave request — reject | `17:32957` | Existing rejection note/dialog and the same tenant permission check | Mapped; visual acceptance pending |

Only the Attendance Information report state is changed by this checkpoint. The aggregate report reads `hris_get_tenant_attendance_data` with `p_report=true`; it shows source-returned employee, team, department, date-range, office-hour, work-hour, and deviation fields. It does not add a denominator or substitute sample counts. The report RPC does not return profile photos, so the employee marker remains initials derived from the returned name.

## HOD, Admin, CEO, and Super Admin references

| Role | Exact Figma evidence found | Current route mapping |
| --- | --- | --- |
| HOD | Requisition approval label `86:36079`; referral approval label `86:38766` | The current `referrals` route is gated by `referrals.view/manage`, but it only exposes operational “Mark in review.” It does not implement this HOD approval state. |
| CEO | Requisition approval label `86:36091`; referral approval label `86:38778` and confirmation text `86:38779` | No CEO decision route is verified. The requisition/referral approval contract needs WS02/WS07 confirmation. |
| Admin | `66:38357` is an `Admin-topbar` component, not a role screen | No approved Admin screen node found |
| Super Admin | No Super Admin screen node found in the inspected Figma pages | Preserve the existing single `admin_users.is_super_admin` model; no new authority |

The HOD/CEO labels are inside the Figma Requisition and Referral sections, not a general dashboard. The referral interface is candidate-linked, and the requisition pipeline is outside the verified management decision contract, so this checkpoint does not change either route or infer approval authority. Bulk approval and any unavailable administrative/global mutation remain disabled.

## Verification record

- `npm run lint`: pass.
- `npm run test:contracts`: 356/356 pass.
- Manager report browser test: added for English/Bengali, permission denial, loading/error/empty, keyboard filters, and 1920/1280/768/375 captures. The local Playwright runtime lacks its Chromium headless binary; the pinned download failed in this environment.
- Exact-head GitHub Actions and screenshot artifact: pending the PR #44 checkpoint push.
- WS04 independent visual acceptance and WS02 two-tenant permission verification: pending.
