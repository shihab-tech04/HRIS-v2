# SQL Contract Registry

**Database:** Supabase project `hrmis-saas` (`oslgwxaqfbteqtwqvdzs`). **Checkpoint:** 2026-10-12. Definitions below were inspected read-only; no production SQL was applied.

| Function | Observed input/output | Permission and scope | Acceptance state |
|---|---|---|---|
| `admin_get_dashboard_summary()` | No arguments; summary JSON | Requires `dashboard.view`; tenant scoped except global candidate-account count, which is intentionally not displayed. | Read path inspected; browser role acceptance not run. |
| `admin_get_attendance(date,date,text,text)` | JSON object with `records` and `corrections` | Requires `attendance.view` or `attendance.manage`; scoped to `synesis_tenant_id`. | Read path inspected; correction writes not isolated-tested. |
| `admin_get_attendance_report(text,date,date,text)` | JSON array for observed weekly modes | Requires `reports.view`; tenant scoped. | Read path inspected; report edge cases not accepted. |
| `admin_get_leave_data(date,date)` | JSON object | Requires a supported leave read/manage permission. | Read path inspected; leave decision actions remain gated. |
| `employee_for_auth_user()` | Returns an employee UUID or null | Requires a matching employee for `auth.uid()` and active `admin_users` row in the fixed active `synesis-it` tenant. | Inspected read-only; this prevents ordinary linked employees from using the current employee summary RPCs. |
| `employee_get_my_attendance_v3(date,date)` | JSON object | Calls `employee_for_auth_user()` and requires an active live session; no tenant argument. | Inspected read-only; client access is restricted to the observed Synesis contract. |
| `employee_get_leave_context()` | JSON object with leave types, balances, requests, holidays and weekly off days | Calls `employee_for_auth_user()` and `synesis_tenant_id()`; requires active live session; no tenant argument. | Inspected read-only; ordinary employee support remains a backend gap. |
| `synesis_tenant_id()` | Returns UUID for active `synesis-it` tenant | Fixed legacy tenant lookup. | Inspected read-only; not a general multi-tenant selector. |
| `admin_resolve_leave_request(...)` | Existing decision function | Observed pending-row lookup lacks tenant predicate. | Replacement staged only; isolated tests required. |
| `admin_resolve_attendance_correction(...)` | Existing decision function | Observed pending-row lookup lacks tenant predicate; existing replacement also needs to preserve omitted fields on partial correction. | Replacement staged only; isolated tests required. |

Production migration history contained 105 applied entries at inspection; Main tracks five migration files. This discrepancy is not reconciled. The two proposed approval fixes are under `supabase/staging/approval-resolution/`, outside the production migration directory. Do not move or apply them to production until they pass the isolated plan and release approval.
