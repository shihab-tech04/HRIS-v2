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
- Earlier focused disposable Auth/Postgres/RLS contact run: **7/7 checks passed** for authorized tenant reads, cross-tenant and permission denials, contact-only input, validation, persisted contact update and audit. The contact migration and RPC implementation have not changed since that SQL run.
- Current fresh Auth/browser acceptance: **BLOCKED; not counted as passed**. The disposable project `/private/tmp/synesis-hris-contact-20261015-fresh` was empty before fixtures. `auth.users` count was 0 and the expected `banned_until` column exists. GoTrue returned one health request once, but its OpenID configuration request took 39.649 seconds in the Auth log and subsequent health requests timed out. The host-side Colima port forward is also unavailable. No product fixtures were created in this fresh project and no production service was contacted.
- The current mobile/desktop browser journey was not accepted in this attempt. Its existing script remains in the suite for rerun when local Auth is responsive.

## Checkpoint status

The contact-only implementation is committed and published on the development checkpoint branch. Contract and build regressions pass; final real Auth/browser acceptance remains open because of local GoTrue latency. No production data, permissions, `main` branch or deployment was changed.
