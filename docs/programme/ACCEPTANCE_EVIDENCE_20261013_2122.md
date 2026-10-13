# Acceptance Evidence — Phase 15 Employee Service Requests

Date: 2026-10-13 21:22 Asia/Dhaka

## Delivered workflow

- A linked employee can submit a service request from the existing personal HRIS navigation and later refresh their own request/status history.
- The form uses the eight request types verified in the connected HRIS schema: employment certificate, NOC, salary certificate, other, work from home, movement, shift change, and shift swap.
- The backend derives the employee from the live Auth session and active tenant context, inserts a `pending` request, and ignores client-supplied employee/status identity.
- Reads expose only the linked employee's rows and a limited set of request/history fields. Direct authenticated table writes and anonymous RPC execution are denied.
- The existing manager service-request view remains read-only. No manager resolution/status transition controls were added because the permitted handler role and transition rules have not been approved.

## Source changes

- `supabase/migrations/20261013210500_hris_employee_service_request_self_service.sql`
- `src/live/MyServiceRequests.tsx`
- `src/live/LiveHrisWorkspace.tsx`
- `tests/sql/isolated-auth/fixture.sql`
- `tests/sql/isolated-auth/run-local.mjs`
- `tests/sql/isolated-auth/run-service-requests-browser.mjs`
- `tests/contracts/service-requests.test.mjs`

## Verification

- Disposable local Supabase Auth/PostgreSQL and browser suite: **166 passed / 0 failed**.
- The new SQL cases reject cross-tenant submissions, unsupported request types, blank reasons, direct table inserts, and anonymous RPC calls. They verify that another tenant's linked employee cannot retrieve this tenant's service requests.
- The real local browser journey clears an unsent form without persistence, submits an employment certificate request, refreshes, and reads the `pending` request back from local Postgres at **375px mobile and 1280px desktop**.
- `npm run check`: TypeScript passed; **88/88 contract tests passed / 0 failed**; Vite build passed (advisory chunk-size warning). JavaScript syntax checks and `git diff --check` passed.
- This suite also revalidated the approved Phase 10 project authority rules, Phase 11 overlapping-assignment peer-review eligibility, self-review denial, Not Observed handling, and nonblocking task completion/release.
- The connected HRIS service-request table and constraints were inspected with read-only queries solely to verify its existing types/statuses. No production SQL, rows, permissions, paid service, GitHub push, or deployment changed.

## Policy boundary and remaining work

- This is a verified employee submission/tracking slice, not full Phase 15 acceptance. Manager decision actions remain unavailable until the authorized handler permission and allowed status transitions are specified.
- Canonical story coverage remains **0/1,047 mapped and accepted; 1,047 pending** until the recovered source bytes and expected SHA are visible in the local Project source mount. No story IDs or requirements were reconstructed.
