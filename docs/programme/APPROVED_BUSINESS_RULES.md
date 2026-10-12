# Approved Business Rules — Evidence Register

**Checkpoint:** 2026-10-12. Only verified existing contracts are recorded below. This is not a complete HR policy catalogue.

| Area | Verified contract | Not established here |
|---|---|---|
| Dashboard | `admin_get_dashboard_summary()` requires `dashboard.view`; its candidate account count is global and must not be shown as a tenant metric. | Any dashboard metric not returned by this RPC. |
| Attendance | `admin_get_attendance(start, end, search, status)` returns `records` and `corrections`; read access is permission-gated and tenant-scoped in the observed definition. | Approval semantics, correction eligibility and partial-update rules until isolated SQL/Auth tests pass. |
| Attendance reports | `admin_get_attendance_report(mode, start, end, search)` requires `reports.view`; observed weekly modes return a JSON array. | Unobserved report modes or calculations. |
| Leave | `admin_get_leave_data(start, end)` requires a leave read permission and returns the existing leave/holiday payload. | Approval policy, balance calculation and holiday entitlement not proven by this RPC alone. |
| Employee summary RPC identity | `employee_for_auth_user()` currently requires an active `admin_users` row and an employee record in the active `synesis-it` tenant. | General employee eligibility and multi-tenant selection are not established; do not widen the UI gate without a least-privilege backend contract. |
| Salary | The public salary currency mask migration is present in observed production history. | Payroll, tax, benefits or compensation calculations. |

Do not add policy calculations or activate approval actions without authoritative rules and verified SQL contracts. Preserve all current required fields and permissions.
