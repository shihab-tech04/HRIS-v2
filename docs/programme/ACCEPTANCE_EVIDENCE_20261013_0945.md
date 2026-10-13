# Acceptance Evidence — Phase 10 Project Permissions

**Feature commit:** `a2d5007814af244d059c0e4563b210052d453dc8`  
**Additional acceptance-test commit:** `ab21b62559ae73231048ef7dfcab4194df97acd9`  
**Disposition:** PASS for the corrected project-creation and membership permission slice; Phase 10 remains PARTIAL.

## Approved behavior verified

- Only an active Super Admin can call the project-creation RPC and appoint an active same-tenant Project Manager.
- Ordinary Admin and ordinary Manager project-create attempts are rejected with SQLSTATE `42501`, and no project rows are created.
- Direct `projects` INSERT/UPDATE paths remain revoked for authenticated roles; attempted manager reassignment is rejected for Admin, Manager, assigned Project Manager and Super Admin.
- Only the assigned Project Manager receives the `can_manage` capability and can add/release project members through the audited RPCs. Super Admin may create/appoint but cannot add/release members.
- The ordinary Admin, ordinary Manager and Super Admin UI states show no add/release member controls. The assigned Project Manager sees and uses those controls; the Project Manager does not see project creation.
- Employee allocations across multiple projects and the existing organizational team relationship are preserved.
- A Project Manager cannot add or release a member on another manager’s project, even when both projects share the same tenant. Only the assigned manager can perform the audited operations.
- An employee keeps their team assignment while holding simultaneous allocations across two projects (60% + 40% in the disposable fixture).

## Verification evidence

- `npm run check`: TypeScript/build PASS; **55/55 contracts PASS**. The new contract checks the Super Admin creation guard, assigned-manager-only RPC and UI capability, SELECT-only table grants and absence of write policies.
- `HRIS_TEST_PORT=43023 npx playwright test tests/browser/project-workspace.spec.ts --project=chromium`: **5/5 PASS**.
- `HRIS_TEST_PORT=43024 npm run test:e2e`: **48/48 PASS**.
- `SUPABASE_HOME=/private/tmp/synesis-supabase-home SUPABASE_TELEMETRY_DISABLED=1 node tests/sql/isolated-auth/run-local.mjs`: **105/105 PASS**, using disposable local Supabase Auth/RLS and synthetic fixtures across two tenants.
- All five previously failing tenant-security cases remain PASS.
- `git diff --check`: PASS before commit.

The first sandboxed Playwright launch could not bind localhost and ran zero tests; the authorized local-only reruns above completed successfully. No production or hosted resources were contacted by the tests.

## Scope limits

The candidate migration remains local only. No unrelated UI, Phase 11 code, team behavior, hosted schema, production data or permission was changed. Authorized task-management behavior remains limited to currently implemented project membership/allocation RPCs; no unsupported task policy was invented. This evidence does not claim completion of Phase 10 or acceptance of any canonical story.

