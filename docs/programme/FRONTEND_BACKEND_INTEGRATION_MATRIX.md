# Frontend / Backend Integration Matrix

**Checkpoint:** 2026-10-12. This records the limited Main workspace integration added in the checkpoint, not complete module coverage.

| UI route/module | Existing contract | Access condition | Current boundary |
|---|---|---|---|
| Authenticated admin dashboard | `admin_get_dashboard_summary()` | Active legacy admin scoped to `synesis-it`; `dashboard.view` | Global candidate count omitted; no derived unsupported metrics. |
| Attendance | `admin_get_attendance(...)` | `attendance.view` or `attendance.manage` | Read-only; correction action gated pending SQL/Auth acceptance. |
| Attendance report | `admin_get_attendance_report(...)` | `reports.view` | Read path only. |
| Employee overview | `employee_get_my_attendance_v3(start,end)` and `employee_get_leave_context()` | These functions use `employee_for_auth_user()`, which requires an active `admin_users` row and the fixed `synesis-it` tenant; the richer client route is gated to that observed contract. | Live policy inspection confirms own-row RLS access for employees, leave requests, and leave types through `hris_own_employee_for_tenant(uuid)`, but attendance and leave balances still use the admin-only resolver. Ordinary linked employees therefore stay on the limited existing RLS-backed leave view. A least-privilege attendance/balance contract and isolated tests remain outstanding. |
| Leave requests | `admin_get_leave_data(...)` | `leave.view` or `leave.manage` | List only; decisions gated. |
| Holidays | Existing leave RPCs | Tenant-scoped RPC contract | Do not query `holidays` directly: the live `holidays_read` policy permits active rows without a tenant predicate. |
| Candidate careers | Existing public vacancy route and backend adapter | Public-only production route | Search/filter fixes only; candidate account and application writes remain closed. |

No other module is certified integrated by this matrix. Each remaining module needs its original story, route, real contract, permission check, end-to-end test and evidence locator before acceptance.
