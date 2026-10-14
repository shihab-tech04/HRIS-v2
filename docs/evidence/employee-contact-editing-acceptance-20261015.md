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

## 2026-10-15 continuation checkpoint

- Re-ran `npm run check` against the committed contact-editing implementation: TypeScript **PASS**, contract suite **155/155 PASS**, Vite production build **PASS**. The existing large JavaScript chunk advisory remains.
- The 11 focused isolated Auth/Postgres/RLS assertions above are the latest successful database evidence; they were not rerun in this continuation.
- Rechecked the disposable runtime without restarting it: Auth on both configured loopback ports returned HTTP **000**; Docker access to the `hris-acceptance` socket returned **permission denied**; the Colima status query timed out. No local `postgres`, `initdb`, or `psql` binary is installed.
- Real Auth-to-Postgres browser acceptance remains **blocked**, not passed or product-failed. The 375px mobile and 1280px desktop journey, persistence-through-refresh, and final local Auth cleanup still require a reachable disposable runtime. The two synthetic Auth entries remain untouched because their identities could not be safely re-verified.
- No application source changed in this continuation; the feature implementation remains in commit `e164521`. Production and `main` remain untouched.

## Fresh disposable Auth/Postgres retry

- To avoid the two pre-existing Auth entries, a separate project was created under `/private/tmp/synesis-hris-contact-20261015-clean` with unique local ports 59621/59622. Before tests, Auth health returned HTTP 200 and `auth.users`, application tables, storage buckets, and storage objects were all empty. The older acceptance stacks were not used or modified.
- The first full harness attempt used its normal `supabase db reset`. Database reset reached container restart but failed because `supabase_storage_synesis-hris-contact-20261015-clean` did not become healthy; its log reported a Postgres connection timeout. No Auth users had been created at that point.
- Added an opt-in `HRIS_SUPABASE_SKIP_LOCAL_RESET=1` path to the isolated test harness. It refuses to proceed unless there are zero public application tables (excluding Supabase's migration ledger), zero Auth users, and zero storage rows. The default reset behavior remains unchanged. The focused employee-directory contracts pass **6/6** and the harness passes `node --check`.
- A second full run passed the empty-baseline guard, applied fixtures/migrations, then exited **1** when Storage returned HTTP status 544 `DatabaseTimeout` (“The connection to the database timed out”). It produced no aggregate Auth/RLS or browser acceptance summary. The harness `finally` cleanup ran; a post-run `auth.users` count timed out after 35 seconds, so cleanup of this new run's synthetic users is **unverified**. The other two previously observed entries in the separate acceptance stack remain untouched.
- `npm run check` after the harness change: TypeScript **PASS**, contract suite **155/155 PASS**, Vite build **PASS** with the existing large-chunk advisory. No tenant/RLS or desktop/mobile browser result is inferred from these contract checks.
- The observed runtime blocker is local Docker/Supabase availability: Storage/Postgres timeouts and Auth health timeouts on the isolated test stack. The host also showed memory pressure. This is an environment failure; no production service, data, permissions, paid service, GitHub `main`, or deployment was changed.

## Latest Phase 05 verification — 2026-10-15

- Current feature source remains in commit `e164521`; this checkpoint adds a focused reproducible runner and optional browser session injection for sessions issued by the disposable local GoTrue service. No employee application source, production database, or permission policy changed in this continuation.
- `npm run check`: **PASS** — TypeScript passed, **155/155** contract tests passed, and the Vite build passed. Existing 1.23 MB JavaScript chunk advisory remains. Focused employee-directory contracts: **6/6 PASS**. Both isolated runner files pass `node --check`.
- Broad local Auth/RLS/browser suite: **33 PASS / 5 FAIL**, exit 1. Two SQL reads were canceled with PostgreSQL `57014`; Learning browser sign-in rendered the Learning page but failed its workspace locator; Payroll browser navigation timed out; the dependent Learning persistence check failed. The process then ended on a local Storage socket close. The suite stopped before the employee contact browser case; those five failures are not contact-feature acceptance results.
- Focused contact runner, first attempt: two backend records **PASS**, one aggregate backend record **FAIL** (input codes were `22023`, duplicate code `23505`, unauthorized updates `42501`, save succeeded, and one audit row was written; protected-field/audit assertion diagnostics were added for the next attempt). Inactive-membership/tenant denial **PASS**. Browser sign-in returned local Auth HTTP **504**, so the 375px/1280px journey was not accepted.
- Subsequent focused attempts were blocked before contact acceptance by local Postgres health reporting `unhealthy`, then GoTrue HTTP **504** during sign-in and user creation. The final read-only cleanup check on the dedicated disposable database showed **0 Auth users, 0 Storage buckets, 0 Storage objects**. No older local Auth stack, production service/data/permissions, paid service, GitHub `main`, or deployment was touched.
- Last previously accepted focused backend evidence remains **11/11 Auth/Postgres/RLS assertions PASS** as noted above. The new attempts do not supersede that result; they add no browser PASS. The contact-only workflow is implemented, contract- and build-verified, but the full Auth/browser acceptance and direct mobile/desktop persistence journey remain **open**, not passed.
- Local implementation checkpoint before this evidence update: `02cf1f5b465b3366883d2179a4cb83af155d1579`. Canonical catalogue-linked story acceptance remains **0/1,047 mapped** because this batch has no verified canonical story IDs; this is not a count of product features implemented.

## Post-publication continuation — 2026-10-15

- Development checkpoint `ae6acd660b69475dd3ccae71c904f2ffde269cc2` was pushed to `development/hris-checkpoints` and verified as the exact remote head. GitHub `main` remained `4ded5f13f1ef2bf17237f347bfac9811283c52dc`.
- The focused runner’s first browser attempt used the manager session for the employee-only directory assertions; it correctly failed on unexpected legacy `employees` and `departments` reads. The runner now supplies the distinct `employee-directory-a@hris.test` viewer session to that journey and the manager session only to contact editing.
- After resetting the synthetic contact fixture baseline, the focused backend run recorded **3/3 PASS**: active tenant and role read scope; contact-only validated writes, field allowlist, tenant denial and audit; inactive membership/tenant denial.
- The following real Auth/browser attempt did not produce an acceptance result. Its cleanup failed when GoTrue timed out deleting a synthetic test user with HTTP **504** (`context deadline exceeded`, 10-second request deadline), masking the browser subprocess result. Browser/Auth acceptance remains **open**. The runner now captures browser subprocess failures and attempts each tracked cleanup independently.
- A reset was started only on `/private/tmp/synesis-hris-contact-20261015-clean` to clear that disposable test state. Postgres logs showed the database ready and the CLI progressed through schema/global initialization, but the CLI stalled during its container restart and Docker status/log calls began timing out. Final local Auth cleanup verification is **unavailable**. Older local Auth stacks remain untouched.
- The harness-only edits following `ae6acd6` pass `node --check` and `git diff --check`; application source was not changed. The existing TypeScript/contracts/build result remains TypeScript **PASS**, contracts **155/155 PASS**, and build **PASS** from the preceding committed checkpoint. No new browser PASS is claimed.
