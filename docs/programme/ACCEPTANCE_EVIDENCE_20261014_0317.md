# Acceptance evidence — Phase 13 employee payslip history

Feature commit: `34ad233`.

The employee page retrieves only released payslips for the linked employee through `hris_get_my_payslips(tenant_id)`. The SQL function is `SECURITY DEFINER` with an empty search path, validates the live session and active tenant-linked employee, joins period labels on both tenant and period ID, and grants execution to authenticated/service roles while revoking public/anonymous execution. Bank, bank account, tax ID, and freeform note are absent from the response.

Disposable two-tenant Auth/Postgres acceptance verified employee A and employee B receive only their own released row; drafts, other employees’ rows, foreign-tenant requests, unlinked users, global-only users, and anonymous callers are denied or excluded. Direct table insert was denied and direct update affected zero rows; persisted status and amounts remained unchanged.

Real local browser acceptance verified the injected transient failure and retry, real RPC-backed period/amount display, refresh, private-field omission, and mobile/desktop overflow checks. Full results: **188/188 isolated Auth/RLS checks passed**; `npm run check` completed with TypeScript pass, **103/103 contracts passed**, and Vite build pass. The bundle-size advisory is unchanged. Hosted Supabase, production records and permissions, paid services, GitHub, and deployment were untouched.

Payroll calculations, manager pay-run flows, benefits, and their authorization rules remain unverified pending approved requirements. No canonical story ID was reconstructed or claimed complete.
