# Local acceptance evidence — 2026-10-13 12:22 +06

## Candidate C1 tenant-scoped profile security

- Added `20261013120355_hris_candidate_profile_rpcs_active_tenant_scope.sql`. Candidate profile reads now return only the authenticated user's active profile; profile updates lock that active row, derive tenant scope from it, allow only the established writable fields, and retain existing function ACLs.
- The local GoTrue/PostgREST run passed `CANDIDATE_C1_AUTH_RLS_RESULT PASS=166 FAIL=0 direct_denials=84 tenant_contexts=2 inactive_denial=1 users_remaining=0`. It covered tenant A/B profile reads and writes, protected email and tenant fields, inactive-profile denial, and the existing direct-table and sanitized-context checks.
- The PostgreSQL 17 privilege and tenant-profile SQL suites passed: `CANDIDATE_C1_PG17_RESULT PASS privilege_and_tenant_profile_suites cleanup=verified`.
- Main `npm run check` passed TypeScript, all 63 contract tests, and the production build. `node --check tests/sql/candidate-c1/run-local-tenant-auth.mjs` and `git diff --check` passed.
- The local Supabase stack and PostgreSQL fixture were disposable test environments. No production data, Auth users, schema, or permissions were changed; no paid service was activated.

## Candidate portal profile journey

- Candidate source now maps the HRIS profile DTO to the existing editor and translates its form model back to the established `candidate_update_profile` payload while preserving opaque `profile_data` and excluding protected identity/tenant fields.
- The profile page waits for Auth and profile loading before showing editable fields. Missing or failed active profiles show a retryable error state. Existing profile labels and list-removal actions now have accessible names.
- Real local GoTrue/PostgREST browser acceptance passed `CANDIDATE_C1_LOCAL_E2E PASS=19 FAIL=0 viewports=2 inactive_retry=2 profile_read_write=tenant-B refresh=verified auth=local-gotrue`. The run verified the persisted tenant B columns and preserved marker through the service-role readback, then reopened the profile at 375px and verified saved location plus no horizontal overflow.
- Candidate `npm run lint`, `npm run test:routes` (12/12), `npm run build`, and `git diff --check` passed. The Vite configuration/chunk-size warnings remain non-fatal.
- Temporary Auth users were removed and fixture profile IDs restored by the test cleanup. The Candidate app used a dedicated strict local port and the isolated Supabase API.

This is isolated local acceptance evidence, not production certification. No GitHub push or deployment was performed.
