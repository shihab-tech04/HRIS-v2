# Frontend / Backend Integration Matrix

**Checkpoint:** 2026-10-12. This records the limited Main workspace integration added in the checkpoint, not complete module coverage.

| UI route/module | Existing contract | Access condition | Current boundary |
|---|---|---|---|
| Authenticated admin dashboard | `hris_get_tenant_dashboard_summary(uuid)` | `dashboard.view` in the active tenant membership. | Global candidate count omitted. Local positive/negative tenant checks passed; browser states remain open. |
| Attendance | `hris_get_tenant_attendance_data(...)`, `admin_resolve_attendance_correction(...)` | `attendance.view`/`attendance.manage` in the active tenant membership. | Local Auth/RLS coverage passed for tenant reads, denied cross-tenant actions, partial fields, concurrent decisions, audit and missing attendance rows. No complete roster/time workflow acceptance. |
| Attendance report | `hris_get_tenant_attendance_data(..., p_report=true)` | `reports.view` in the active tenant membership. | Local RPC scope inspected; report values and browser export still need story-based acceptance. |
| Employee overview | `hris_get_my_dashboard_data(uuid)` | Live Auth session linked to an active employee in that tenant; no admin role required. | Local tests cover own attendance, balances and leave history; cross-tenant calls and terminated employee access are denied. Legacy `employee_get_my_attendance_v3` and `employee_get_leave_context` remain unchanged and are no longer used by this view. |
| Employee leave request | `hris_employee_submit_leave_request(uuid,jsonb)` with private `leave-evidence` storage. | Active employee link in the submitted tenant; proof paths must match Auth user and tenant. | Local tests cover required proof, owner/tenant storage rules, overlap denial, pending balance, same-tenant approval and audit. Full browser, localization and policy matrix remain open. |
| Manager leave requests | `hris_get_tenant_leave_data(...)`, `admin_resolve_leave_request(...)` | `leave.view`/`leave.manage` in the active tenant membership. | Local Auth/RLS coverage passed for cross-tenant denial, year/holiday calculations, half-day rejection, missing-ledger rollback, concurrency and audit. |
| Holidays | Existing leave RPCs | Tenant-scoped RPC contract | Do not query `holidays` directly: the live `holidays_read` policy permits active rows without a tenant predicate. |
| Candidate careers | Existing public vacancy route and backend adapter | Public-only production route | Search/filter fixes only; candidate account and application writes remain closed. |

No other module is certified integrated by this matrix. Each remaining module needs its original story, route, real contract, permission check, end-to-end test and evidence locator before acceptance. The canonical 1,047-story ledger has not been recovered, so no story IDs or acceptance criteria are inferred here.
