# WS08 management/admin Figma node map

**Figma file:** [Synesis HRIS](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)

**Figma page:** Page 1, node `0:1`
**Current checkpoint:** PR #44, Manager daily Attendance Information and the separate report-only aggregate variant.

## Manager states

| State | Approved Figma node | Current app route and gate | WS08 status |
| --- | --- | --- | --- |
| Managerial Dashboard | `9:22640`; chart `9:22784` | `dashboard`; existing `dashboard.view` permission and tenant dashboard data | Previously implemented in PR #44 |
| Attendance Information (visible daily-detail state) | Root `17:28320`; content frame `17:28694`; header `17:28696`; rows `17:28722` | `attendance`; daily detail requires `attendance.view` or `attendance.manage` and uses the tenant-scoped detail reader | Implemented in this checkpoint; independent visual acceptance pending |
| Attendance Report (aggregate-only variant) | `17:28321`; nested table header `17:28324`, rows `17:28349` | `attendance`; requires `reports.view` and uses the tenant-scoped aggregate reader | Preserved as a distinct variant; do not treat it as the visible daily-detail state |
| Attendance Information — status filter | `17:31530` | `attendance`; status filtering stays on the authorized detail path | Mapped; visual acceptance pending |
| Attendance Information — team filter | `66:45669` | `attendance`; tenant-derived team options and applied report filter | Mapped; visual acceptance pending |
| Attendance request | Root `17:29937`; visible content `137:39889`; title/search row `17:30097`; table header `17:30312`; row list `17:30135` (first row `17:30136`) | `attendance`; correction review requires existing `attendance.manage` permission | Mapped; visual parity and acceptance pending |
| Attendance request — bulk | `17:30342` | No bulk decision behavior in the current supported flow | Mapped; bulk action remains unavailable |
| Attendance request — approve | `17:30766` | Existing single correction decision path | Mapped; visual acceptance pending |
| Attendance request — reject | `17:31148` | Existing rejection dialog and decision path | Mapped; visual acceptance pending |
| Leave request | `17:31769` | `leave`; queue reads are tenant-scoped | Mapped; visual acceptance pending |
| Leave request — bulk | `17:32168` | No bulk leave decision behavior in the current supported flow | Mapped; bulk action remains unavailable |
| Leave request — approve | `17:32584` | Existing `admin_resolve_leave_request` path; server requires `leave.manage` on the request tenant | Mapped; visual acceptance pending |
| Leave request — reject | `17:32957` | Existing rejection note/dialog and the same tenant permission check | Mapped; visual acceptance pending |

The visible daily-detail state reads `hris_get_tenant_attendance_data` with `p_report=false`; its nine displayed columns follow frame `17:28694`. The search, date, tenant-returned team, and source-status filters use existing detail fields. Date, team, and status filters commit through the Figma Apply Filter action. Team sorting is client-side over the same authorized rows. Employee numbers and work-hours remain in CSV export but are omitted from the visible Figma table. The detail RPC does not return profile photos, so the avatar marker uses initials derived from the returned name. `present` remains the source status in UI; it is not relabeled “On Time” because the backend does not verify that punctuality meaning. The `office`, `home`, and `client_meeting` work-mode values are displayed using the approved location wording.

The Attendance Requests Figma root `17:29937` shows a search/title row, a seven-column table, per-row selection boxes, and approve/reject controls. Its visible content nodes are `137:39889` (content frame), `17:30097` (title/search row), `17:30312` (table header), and `17:30135` (row list). The approved field mapping to the existing correction response is Name → `full_name`, Date → `attendance_date`, In Time → `requested_check_in`, Out Time → `requested_check_out`, Applying Date → `requested_at`, and Remarks → `reason`. Requested timestamps must be displayed in the tenant timezone. Figma sample names, dates, times, avatars, and the red “99” navigation badges are not production data. The correction reader returns no profile photos; use a source-derived initials marker if an avatar placeholder is needed. Single-item decisions use the existing tenant-authorized `admin_resolve_attendance_correction` path and pending status. Bulk approval has no supported action contract; node `17:30342` remains mapped but unavailable. The existing reader applies the date range to `attendance_date`; its `p_search` filter does not filter `corrections`, so request search must be implemented locally against fields already returned unless the contract is verified separately.

The separate aggregate variant reads `hris_get_tenant_attendance_data` with `p_report=true`; it shows returned employee, team, department, date-range, office-hour, work-hour, and deviation fields. It does not add a denominator or substitute sample counts. This variant retains its 9-column summary, team filter/sort, and CSV behavior.

## HOD, Admin, CEO, and Super Admin references

| Role | Exact Figma evidence found | Current route mapping |
| --- | --- | --- |
| HOD | Requisition approval label `86:36079`; referral approval label `86:38766` | The current `referrals` route is gated by `referrals.view/manage`, but it only exposes operational “Mark in review.” It does not implement this HOD approval state. |
| CEO | Requisition approval label `86:36091`; referral approval label `86:38778` and confirmation text `86:38779` | No CEO decision route is verified. The requisition/referral approval contract needs WS02/WS07 confirmation. |
| Admin | `66:38357` is an `Admin-topbar` component, not a role screen | No approved Admin screen node found |
| Super Admin | No Super Admin screen node found in the inspected Figma pages | Preserve the existing single `admin_users.is_super_admin` model; no new authority |

The HOD/CEO labels are inside the Figma Requisition and Referral sections, not a general dashboard. The referral interface is candidate-linked, and the requisition pipeline is outside the verified management decision contract, so this checkpoint does not change either route or infer approval authority. Bulk approval and any unavailable administrative/global mutation remain disabled.

## Verification record

- Exact-head PR #44 run [39636801387](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39636801387) passed on source head `299b0c9c2e29617e2cce0fda0d78a04799625812`. Its `ui-check` completed TypeScript/source contracts, build, source-drift reporting, browser smoke, and responsive regression steps successfully.
- Run artifact `12363310528`, SHA-256 `5feb3614898f4dede500d0c401d66db47a878ba684628af36ac3deafdce3c617`, contains Manager dashboard and attendance/report screenshots at 1920, 1280, 768, and 375 widths, plus Bengali attendance/report filters at 768 and 375 and Bengali leave filters at 768 and 375. They are hosted browser evidence; independent WS04 visual acceptance remains pending.
- The strict Manager Attendance Information geometry assertion passed in that run: 48px control row, 8px gap, 59px table header, and 80px data rows. The report chart remains source-backed daily record counts; denominator and 0–100% semantics remain blocked pending design approval.
- Focused local attendance/report/workspace/SA06 contracts passed 31/31. The hosted exact-head run is authoritative for the current base-synchronized browser/build check; local Playwright has no Chromium binary.
- PR #44 is draft, open, and mergeable, based on WS01 #49 head `be78824462bbe212948615006ebed165af3944ec`. WS01 run [39634656721](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39634656721) passed 57/57 browser tests on that base; artifact `12361495549`, SHA-256 `e4be8ef05f8d6f91d5ccd1a5ff72e2c4bdd693473ce7c038533a621ebca49da2`. The inherited HR01 source and Team Name assertion remain WS01-owned and unedited by WS08.
- This verification note is a documentation-only update after the passing source head; its new exact-head Actions run must also pass before treating the current PR head as verified. WS04 independent visual acceptance and WS02 two-tenant permission verification remain pending.
