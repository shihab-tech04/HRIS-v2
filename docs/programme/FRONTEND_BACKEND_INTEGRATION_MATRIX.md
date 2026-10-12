# Frontend / Backend Integration Matrix

**Checkpoint:** 2026-10-12. This records the limited Main workspace integration added in the checkpoint, not complete module coverage.

| UI route/module | Existing contract | Access condition | Current boundary |
|---|---|---|---|
| Authenticated admin dashboard | `admin_get_dashboard_summary()` | Active legacy admin scoped to `synesis-it`; `dashboard.view` | Global candidate count omitted; no derived unsupported metrics. |
| Attendance | `admin_get_attendance(...)` | `attendance.view` or `attendance.manage` | Read-only; correction action gated pending SQL/Auth acceptance. |
| Attendance report | `admin_get_attendance_report(...)` | `reports.view` | Read path only. |
| Employee overview | `employee_get_my_attendance_v3(start,end)` and `employee_get_leave_context()` | These functions use `employee_for_auth_user()`, which requires an active `admin_users` row and the fixed `synesis-it` tenant; the client route is gated to that observed contract. | Ordinary linked employees cannot use these RPCs and stay on the existing RLS-backed read view. A dedicated least-privilege employee contract is outstanding. |
| Leave requests | `admin_get_leave_data(...)` | `leave.view` or `leave.manage` | List only; decisions gated. |
| Candidate careers | Existing public vacancy route and backend adapter | Public-only production route | Search/filter fixes only; candidate account and application writes remain closed. |

No other module is certified integrated by this matrix. Each remaining module needs its original story, route, real contract, permission check, end-to-end test and evidence locator before acceptance.
