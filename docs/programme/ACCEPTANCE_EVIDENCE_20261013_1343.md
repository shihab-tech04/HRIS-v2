# Employee Directory Acceptance Evidence — 2026-10-13 13:43 Asia/Dhaka

## Delivered

Phase 5 now has a permission-gated, tenant-scoped employee directory mounted in the live HRIS workspace. Employees with `employees.view` or `employees.manage` can search and filter by department and employment status, page results, refresh, and export the current page. The narrow layout uses employee cards; desktop uses a horizontally scrollable table. Loading, empty, denied/error, retry, and refresh states are included.

The read RPC requires an authenticated live session, active tenant, and active membership permission. It joins department, designation, and team only within the requested tenant, caps page size, and returns employee number, name, organization labels, and employment status; it excludes official email, gender, joining date, and Auth user ID. It has no write path.

## Verification

- Isolated local Supabase Auth/PostgreSQL acceptance: **132/132 passed**, including **7 Employee Directory checks** for tenant separation, privacy-limited fields, permission and inactive-membership denial, filtering/search, pagination, error retry, empty state, export contents, and 375px/1280px browser journeys.
- HRIS contract suite: **70/70 passed**.
- TypeScript: passed.
- Vite production build: passed (existing large-chunk advisory only).
- Chromium regression suite: **50/50 passed**.
- `git diff --check` and browser-runner syntax check: passed.
- Production data, production permissions, paid Supabase services, GitHub, and deployment were not touched.

## Changed source and verification files

- `src/live/OrganizationEmployeeDirectory.tsx`
- `src/live/LiveApp.tsx`
- `src/live/LiveHrisWorkspace.tsx`
- `supabase/migrations/20261013073243_hris_tenant_employee_directory.sql`
- `tests/contracts/employee-directory.test.mjs`
- `tests/sql/isolated-auth/fixture.sql`
- `tests/sql/isolated-auth/run-local.mjs`
- `tests/sql/isolated-auth/run-employee-directory-browser.mjs`

## Remaining boundary

The directory is read-only. Employee creation, editing, termination, and lifecycle permissions remain outside this batch.
