# Acceptance evidence — Phase 13 payroll register

Feature commit: `50acbefb27e8706ac38d86bd8cb474f062f1b2ac`.

`hris_get_tenant_payroll_register` requires a live session, active tenant, and active tenant membership with `payroll.view` or `payroll.manage`. It scopes pay periods, payslips, and employee joins to the requested tenant; rejects foreign periods, invalid statuses, and invalid paging inputs; returns a bounded page and full result count; and has no write path. Public and anonymous function execution is revoked. The client enters the existing HRIS workspace only when its tenant membership grants payroll view/manage.

The manager register reads persisted values through that RPC only. It filters by employee name/number, period, and payslip status; supports pagination, refresh, empty/error states and retry; omits bank, bank-account, tax-ID, and note fields; and uses responsive employee cards and a desktop table. A tenant-scope guard prevents old rows from rendering during a tenant change, while initial and refresh failures remain retryable.

Disposable Auth/Postgres acceptance returned three synthetic tenant A rows (released and draft), exposed no tenant B row or excluded private field, verified a released employee/status search and a second page, rejected a foreign period and unsupported status, and denied cross-tenant, unprivileged, global-only, employee-only, and anonymous callers. RPC execution is unavailable to `anon` and available to `authenticated` with the function body enforcing membership.

The real local browser journey authenticated as the payroll-view-only member, injected a transient RPC outage, recovered through Retry, checked persisted register rows, employee search, status and period filters, clear filters, refresh, excluded private values, and mobile/desktop overflow. Full local Auth/RLS/browser suite: **192/192 passed**. `npm run check`: TypeScript pass, **106/106 contracts passed**, and Vite build pass.

The separate employee My Payslips journey and existing Phase 10/11 project/task/peer-review workflows remained covered in the same full suite. No payroll calculation, pay-run write, benefit, anonymity, or compensation rule was invented. No production database, production permissions, paid Supabase service, GitHub push, or deployment was touched.
