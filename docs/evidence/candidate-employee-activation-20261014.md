# Candidate-to-employee activation checkpoint — 2026-10-14

**Status: partial development checkpoint; not deployable.** The HR activation UI, tenant-scoped RPC, identity handoff, verification audit fields, idempotent retry, and isolated acceptance coverage are implemented in source.

## Verified

- `npm run lint` — PASS.
- `npm run test:contracts` — PASS, 143 passed, 0 failed.
- `npm run build` — PASS. Vite reports the existing large JavaScript chunk warning (>500 kB).
- `node --check tests/candidate-application-local-e2e.mjs` — PASS.
- `git diff --check` — PASS in both repositories.

## Auth/Postgres/browser acceptance

**Blocked; no final PASS/FAIL result was produced, so no end-to-end tests are counted as passed or failed.** The first isolated run loaded its fixture/migration path but exited without a final report. The dedicated local Supabase database then failed its health check repeatedly (`Health check exceeded timeout (2s)` / `timed out starting health check`). Restarting only that disposable database did not recover it. Supabase CLI startup returned `DbConnectError: Connection terminated unexpectedly` for the existing test project and `DbConnectError: Connection timed out` for a fresh isolated project.

The acceptance runner now covers Auth identity continuity, tenant-scoped HR activation, negative role/tenant checks, persistence and audit fields, direct-write denial, and idempotent retry. Run it after local Docker/Postgres is healthy. Existing Auth entries outside the runner's exact synthetic test prefixes were not inspected or removed.

## Safety state

No production data or permissions were changed, no paid service was activated, and no deployment was made. The next verification action is to restore a healthy local Supabase/Postgres test service and rerun the full candidate Auth/browser journey before treating this workflow as complete.
