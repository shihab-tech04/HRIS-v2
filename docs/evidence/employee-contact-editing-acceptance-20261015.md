# Phase 05 employee contact editing — acceptance evidence

## Approved scope

Users with the existing `employees.manage` permission may edit only the current employee contact fields. Organizational assignment, employment status and joining date, salary/payroll, permissions and identifiers remain outside this workflow.

## Verified source behavior

- Contact reads and writes use authenticated RPCs scoped to an active tenant membership and `employees.manage`.
- The update RPC allowlists contact fields, validates email and length constraints, rejects duplicate official emails, and writes a field-name-only audit event.
- The directory detail UI supports view/edit, save/cancel, validation, retryable errors, refresh recovery and Bengali labels without changing the application shell.
- Current directory rows remain privacy-limited; contact details are fetched only when the authorized user opens that section.

## Test results

- `npm run check`: **155/155 contract tests passed**, TypeScript passed, and Vite production build passed. The build reports the existing large JavaScript chunk advisory.
- Latest focused disposable Auth/Postgres/RLS run: **11/13 checks passed**. All 11 passed checks include six real local Auth sessions and server-side authorization/tenant-isolation checks for contact reads and writes, inactive memberships/tenants, contact-only fields, validation, duplicate prevention, persistence, audit history, and direct-table write denial. No test result is attributed to a canonical story ID.
- Browser acceptance: **not accepted; 1 browser check failed and its dependent persistence check failed** because sign-in did not reach the workspace. A diagnostic retry was blocked before browser execution when GoTrue returned HTTP 504 (`context deadline exceeded`) while creating a synthetic Auth user. The Auth health endpoint returned HTTP 200, so health alone does not establish reliable Auth acceptance. This is an isolated local Auth runtime/latency blocker, not evidence of a production failure.
- Cleanup was verified in the dedicated disposable database: `auth.users` contains **0** synthetic Auth fixtures. No production service, production data, or permissions were contacted or changed.
- The browser runner now records sanitized Auth response/failure diagnostics on sign-in timeout to make the next acceptance attempt actionable.

## Checkpoint status

The contact-only implementation remains committed on the local development checkpoint. Contract, TypeScript, build, and 11 isolated Auth/Postgres/RLS checks pass; final real Auth/browser acceptance remains open because the disposable local GoTrue runtime timed out. No production data, permissions, `main` branch or deployment was changed.
