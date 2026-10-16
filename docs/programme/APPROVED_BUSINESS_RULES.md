# Approved Business Rules — Evidence Register

**Checkpoint:** 2026-10-12. Only verified existing contracts are recorded below. This is not a complete HR policy catalogue.

| Area | Verified contract | Not established here |
|---|---|---|
| Dashboard | `admin_get_dashboard_summary()` requires `dashboard.view`; its candidate account count is global and must not be shown as a tenant metric. | Any dashboard metric not returned by this RPC. |
| Attendance | `admin_get_attendance(start, end, search, status)` returns `records` and `corrections`; read access is permission-gated and tenant-scoped in the observed definition. | Approval semantics, correction eligibility and partial-update rules until isolated SQL/Auth tests pass. |
| Attendance reports | `admin_get_attendance_report(mode, start, end, search)` requires `reports.view`; observed weekly modes return a JSON array. | Unobserved report modes or calculations. |
| Leave | `admin_get_leave_data(start, end)` requires a leave read permission and returns the existing leave/holiday payload. | Approval policy, balance calculation and holiday entitlement not proven by this RPC alone. |
| Legacy employee summary RPC identity | `employee_for_auth_user()` requires an active `admin_users` row and an employee record in the active `synesis-it` tenant. The new employee workspace uses a separately tested tenant-scoped contract. | General employee eligibility outside the accepted linked-active-employee rule and duplicate employee links still need original story criteria and a data-integrity decision. |
| Tenant membership permission | The accepted permission path maps active `tenant_memberships.role` to an active `roles.id` and that role's `role_permissions`; an active global role alone does not grant tenant access. | Exact role-to-permission assignments for every business role still need catalogue/owner confirmation. |
| Employee leave submission | The local candidate mirrors the existing leave contract: active applicable leave type, configured notice, required evidence, tenant-owned evidence path, no overlapping pending/approved leave, chargeable days excluding tenant weekly offs and holidays, sufficient annual balance, pending ledger and audit entry. Half-day requests are for a single chargeable date. | The new contract passed isolated cases for required proof, overlap, tenant ownership, holiday/year calculations, half-day rejection, pending balance and approval. Remaining rule variants require original story criteria and browser acceptance. |
| Salary | The public salary currency mask migration is present in observed production history. | Payroll, tax, benefits or compensation calculations. |

Do not add policy calculations or activate approval actions without authoritative rules and verified SQL contracts. Preserve all current required fields and permissions.
