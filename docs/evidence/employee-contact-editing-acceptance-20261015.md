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
- Focused disposable Auth/Postgres/RLS assertions: **11 PASS**. These include six real local Auth sessions and server-side checks for authorized contact read/write, cross-tenant and permission denial, inactive membership/tenant denial, contact-only fields, validation, duplicate prevention, contact persistence, audit history, and direct-table write denial. No result is attributed to a canonical story ID.
- Browser acceptance: **not accepted**. An initial hand-built runner used the employee identity instead of the directory-view identity, so its browser and dependent persistence results are invalid for acceptance. A corrected three-user setup reached the browser runner but did not reach the workspace within 30 seconds; that attempt did not retain the complete diagnostic. The browser harness now captures a sanitized compact sign-in diagnostic and uses exact field labels. A later retry was blocked before browser execution when GoTrue returned HTTP 504 (`context deadline exceeded`) while creating a synthetic Auth user. Its health endpoint returned HTTP 200, which does not establish reliable Auth acceptance. The 375px/1280px browser journey therefore remains open; no product-browser PASS is claimed.
- Auth cleanup was verified in the dedicated disposable database: `auth.users` contains **0** synthetic test identities. No production service, production data, or permissions were contacted or changed.

## Latest continuation attempt

- The browser runner was configured to sign in as the authorized `employees.manage` manager for both directory and contact-edit journeys. The page remained at the sign-in screen and the browser captured no Auth token response or Auth request failure, so this attempt did not exercise the product workflow and is not counted as a feature failure or acceptance pass.
- The runner had verified an empty `auth.users` table before creating three synthetic `@hris.test` identities. It attempted Auth API cleanup in its `finally` block, then reported **2 synthetic users remaining**. The identities are confined to the dedicated disposable project; their exact emails could not be re-read after the local Docker context stopped responding.
- The local Auth health check then timed out with HTTP `000`; direct access to the Docker context socket at `/Users/synesis/.colima/hris-acceptance/docker.sock` also failed to respond. Auth API and Postgres cleanup verification are therefore **blocked** until the disposable local runtime is reachable. No service was restarted, no direct SQL deletion was attempted, and no production service was accessed or modified.

## Checkpoint status

The contact-only implementation remains committed on the development checkpoint branch. Contract, TypeScript, build, and 11 isolated Auth/Postgres/RLS checks pass. Real Auth/browser acceptance and cleanup of two test-created Auth identities remain open because the disposable local Supabase/Docker runtime stopped responding. No production data, permissions, `main` branch or deployment was changed.
