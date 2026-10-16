# HRIS Acceptance Evidence — 2026-10-12 16:44 Asia/Dhaka

This record captures executed evidence for the current Phase 17 employee-dashboard slice. It does not certify the product release or assign invented canonical story IDs.

## Implemented and exercised

| Functionality | Source / test evidence | Result and limits |
|---|---|---|
| Employee profile, employee number, designation and department come from the employee linked to the active tenant membership | `src/live/LiveHrisWorkspace.tsx`; `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`; SQL runner assertions in `tests/sql/isolated-auth/run-local.mjs` | The local authenticated SQL suite verifies each synthetic employee receives its own tenant-linked profile and tenant-local dashboard date. |
| Personal dashboard shows today's attendance, recent work hours and work locations, leave balances, holidays, leave-request entry and request history | `EmployeeOverview` in `src/live/LiveHrisWorkspace.tsx`; `hris_get_my_dashboard_data` RPC; `tests/browser/employee-leave.spec.ts` | Mock-backed browser acceptance verifies the employee journey and displayed data. The isolated SQL suite validates the real local RPC and tenant boundary. |
| Four dashboard views remain reachable on a 375px viewport | Personal dashboard tab layout in `src/live/LiveHrisWorkspace.tsx`; assertions in `tests/browser/employee-leave.spec.ts`; screenshot `docs/evidence/employee-dashboard-mobile-20261012.png` | All four controls are visible in a two-column layout; no tab-strip or document-level horizontal scroll. |
| Private-evidence leave request remains usable from the dashboard | `PersonalLeaveRequests` in `src/live/LiveHrisWorkspace.tsx`; `tests/browser/employee-leave.spec.ts` | The mock-backed browser journey checks dialog focus/Escape, evidence selection, sticky-footer clearance, submission and history refresh. Local SQL/Auth/RLS evidence covers tenant scope and storage behavior. |
| Existing manager dashboard and app regressions | `tests/browser/managerial-dashboard.spec.ts`, `tests/browser/authorized-workspace.spec.ts`, and full Chromium suite | Full suite: **36 passed, 0 failed**. All external requests are blocked or explicitly mocked. |

## Executed verification

- `npm run check`: TypeScript passed; contracts **26/26 passed**; Vite build passed. The build reports the existing 688.21 kB JavaScript chunk warning.
- `npm run test:e2e`: Chromium **36/36 passed, 0 failed**. First sandboxed launch could not bind `127.0.0.1:4173`; the identical local-only suite passed with the required loopback permission.
- `node tests/sql/isolated-auth/run-local.mjs`: free isolated local Auth/RLS suite **44/44 passed, 0 failed** after the tenant-scoped employee dashboard RPC and membership-role migration. Uses synthetic identities in two tenants; no production data or permissions changed.
- `git diff --check`: passed.

The five previously failing cross-tenant checks pass in the current isolated suite: Tenant B cannot read Tenant A attendance; Tenant A cannot read Tenant B attendance; Tenant B cannot call Tenant A dashboard/attendance/leave RPCs; Tenant B cannot approve Tenant A leave; and Tenant B cannot approve Tenant A attendance.

## Canonical story linkage

The user reports a recovered catalogue with 1,047 stories, 153 modules and expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The task's mounted Project `sources/` directory is empty. Exact filename/hash searches against connected Drive did not return the catalogue. The repository file `docs/programme/CANONICAL_USER_STORY_MATRIX.json` is only an empty tracking skeleton: 0 story rows, expected count 1,047, actual SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`.

Therefore this slice has actual implementation and test evidence but **0/1,047 canonical stories mapped or accepted** and **1,047 unmapped**. This is not a claim that no functionality exists. Populate story IDs, requirement text, module links and acceptance status only after the expected-hash source is available in the mounted Project/Library files.

## Release state

Checkpoint only; not for release. No production mutation, paid Supabase service, GitHub push or deployment occurred. Keep the final sequence: complete and verify the product, create and integrity-check the final Drive archive in the verified owner folder, then push the exact archived source and deploy.
