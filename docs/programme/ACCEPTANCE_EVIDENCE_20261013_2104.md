# Acceptance Evidence — Phase 14 Expense Claim Slice

Date: 2026-10-13 21:04 Asia/Dhaka

## Delivered workflow

- Employees can create incomplete claims, edit drafts, choose an active tenant category, enter a date and positive amount, and submit only when required fields are present.
- Employees can attach private PDF/JPEG/PNG receipts (up to the existing 10 MiB bucket limit), open their own receipt, remove it while the claim remains a draft, refresh the page, and see claim status history.
- Returned claims can be reopened and revised while retaining the reviewer note. A duplicate or incomplete submission is rejected server-side.
- Tenant `expenses.view`/`expenses.manage` members receive a submitted-claims read queue. The queue includes only submitted claims and a limited claimant identity projection; no approval action is exposed.
- Direct claim reads, writes, receipt metadata, and Storage access are tenant/employee scoped. Legacy expense policies based on the single-tenant pin and global permissions were removed and replaced with active-membership policies.

## Source changes

- `supabase/migrations/20261013143711_hris_expense_claims_employee_tenant_workflow.sql`
- `src/live/ExpenseClaims.tsx`
- `src/live/LiveApp.tsx`
- `src/live/LiveHrisWorkspace.tsx`
- `tests/sql/isolated-auth/fixture.sql`
- `tests/sql/isolated-auth/run-local.mjs`
- `tests/sql/isolated-auth/run-expense-browser.mjs`

## Verification

- Disposable local Supabase Auth/PostgreSQL RLS suite: **164 passed / 0 failed**. It included cross-tenant claims/receipt isolation, global-only and no-permission denial, direct table decision denial, invalid category/currency/amount, incomplete and duplicate submission denial, reviewer-note recovery, anon grants, and existing Phase 10/11 security regressions.
- Real local browser to Auth/Postgres journey passed at **375px mobile and 1280px desktop**: incomplete draft and recovery, receipt upload, submission, refresh/history, and tenant-scoped read-only manager queue. Postgres readback confirmed the claim is submitted with one receipt and one history event.
- `npm run check`: TypeScript passed, **85 contract tests passed / 0 failed**, and Vite production build passed. JavaScript syntax checks and `git diff --check` passed.
- The built JavaScript bundle remains above the Vite 500 kB advisory threshold; build completed successfully.
- All tests used synthetic fixtures in the disposable local stack. No production SQL/data/permissions, paid services, GitHub push, or deployment were changed.

## Policy boundary and remaining work

- The existing module contract calls out multi-tier managerial approval, but the approved role order and decision rules are not yet specified in the visible project instructions. The manager queue is intentionally read-only; no approval/rejection RPC or UI has been invented. This slice does not constitute full Phase 14 acceptance.
- The canonical 1,047-story matrix is not available as verified bytes in this workspace. No story IDs or requirement text were reconstructed or assigned; story mapping remains pending verified source access.

## Next functional batch

Continue Phase 14 with the explicitly approved expense-review tier and decision rules when available, while preserving this verified employee claim and receipt workflow. Do not activate paid services or apply the local migration to production.
