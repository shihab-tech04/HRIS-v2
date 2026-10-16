# Acceptance Evidence — 2026-10-12 17:07 Asia/Dhaka

This checkpoint records functional and security evidence for employee attendance correction submission and its continuation through existing manager approval. It does not certify the complete HRIS release or attach unverified canonical story IDs.

## Phase 08 — Employee attendance correction request

| Journey | Implementation and evidence | Acceptance result |
|---|---|---|
| Submit a correction | `src/live/LiveHrisWorkspace.tsx` renders the employee request form. `hris_employee_submit_attendance_correction(uuid,jsonb)` in the tenant-membership migration binds the request to the active employee identity and submitted tenant, converts local times using the tenant timezone, requires a reason and at least one changed attendance field, stores the request as pending, and writes an audit event. | Chromium employee journey **1/1 PASS**. Local Auth/RLS verifies linked employee ownership, `Asia/Dhaka` conversion, audit, empty-change rejection and cross-tenant denial. |
| Follow status and resolution | `hris_get_my_dashboard_data(uuid)` now returns only the linked employee’s correction history. The request table shows requested fields, reason, status and manager resolution note. Managers continue to use the existing tenant-scoped `admin_resolve_attendance_correction` contract. | Browser verifies request submission and refreshed pending history. Local Auth/RLS verifies own-tenant history and all existing same-tenant/cross-tenant approval cases. |
| Mobile/accessibility | The request uses the established form-dialog pattern, required date/reason labels, keyboard focus management, a local-time explanation and a scrollable form body. | 375px viewport stayed within the page width. Capture: `docs/evidence/employee-attendance-correction-mobile-20261012.png`. |

## Regression runs

- `npm run check`: TypeScript PASS; contract tests **26/26 PASS**; Vite build PASS (699.64 kB JavaScript chunk warning remains); latest `git diff --check` PASS.
- `node tests/sql/isolated-auth/run-local.mjs`: **47/47 PASS, 0 failed** using real disposable local Supabase Auth sessions and synthetic users across two tenants. No production data or permissions were changed.
- `HRIS_TEST_PORT=4194 npm run test:e2e`: full Chromium suite **37/37 PASS, 0 failed**; all outside requests were mocked or blocked. The employee correction journey also passed separately **1/1** after saving its mobile form capture.
- The five previously failing tenant-security checks remain passing: tenant B cannot read tenant A attendance; tenant A cannot read tenant B attendance; tenant B cannot invoke tenant A dashboard/attendance/leave RPCs; tenant B cannot approve tenant A leave; tenant B cannot approve tenant A attendance.

## Story mapping boundary

The owner-reported catalogue contains 1,047 stories across 153 modules with expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The current mounted Project `sources/` still contains zero files; the repository matrix remains the empty tracking skeleton with SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. Therefore **0/1,047 stories can be marked fully implemented and accepted against canonical requirements; all 1,047 remain unmapped**. This does not mean the functional slices above are unimplemented; their test evidence is recorded without inventing story IDs or requirements.

## Release boundary

This is a recoverable local implementation checkpoint only. No hosted Supabase changes, paid services, GitHub push, final source archive or deployment occurred. Continue all 22 phases and complete canonical story acceptance before the final Drive source backup, GitHub push and deployment sequence.
