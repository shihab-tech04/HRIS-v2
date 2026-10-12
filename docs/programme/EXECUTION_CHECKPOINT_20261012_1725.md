# Synesis HRIS Execution Checkpoint — 2026-10-12 17:25 Asia/Dhaka

## Current implementation

- **Phase 08 — Attendance, shift, roster and time management. Current module: Shift roster schedule (read-only).** The authenticated HRIS workspace now lists explicit per-employee/day assignments, with employee/shift search, date range, refresh, CSV export and mobile table scrolling.
- Main branch: `codex/recovery-checkpoint-20261012`. Latest feature commit: `cb1e8de08ac8100463c5182b87119f4d29cb95ee` (`feat: add tenant-scoped shift roster`). Previous 17:14 checkpoint: `bc4c0c411db1079f368fc4c9542f3cb4ddfe70e7`.
- The new `hris_get_tenant_shift_roster_data(uuid,date,date,text)` RPC requires active tenant membership with `attendance.view` or `attendance.manage`. It tenant-binds assignment, employee, shift and department rows; no direct assignment table read is used by the client. The roster slice is read-only; assignment creation/change and the remainder of Phase 08 remain open.
- This page reuses the existing HRIS shell, navigation and visual tokens. No roster-specific Figma node was available in the mounted project files, so no node-specific parity claim is made.

## Changes and verification

- Since the previous 17:14 local checkpoint: **20 paths, +447 / −28 lines**, including the roster page/RPC, synthetic local Auth/RLS fixtures, browser/contract tests, acceptance records, and desktop/mobile evidence.
- Since the 14:20 Asia/Dhaka Drive baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`: **69 paths, +6,310 / −55 lines**.
- Source/test files changed in this feature slice: `src/live/LiveHrisWorkspace.tsx`; `supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql`; `tests/sql/isolated-auth/fixture.sql`; `tests/sql/isolated-auth/run-local.mjs`; `tests/browser/shift-roster.spec.ts`; `tests/contracts/shift-roster.test.mjs`.
- New visual evidence: `docs/evidence/shift-roster-desktop-20261012.png`, `docs/evidence/shift-roster-mobile-20261012.png`. The browser run also refreshed the Attendance Information, Managerial Dashboard and authorized-workspace captures.
- `npm run check`: TypeScript **PASS**; contracts **28/28 PASS**; Vite build **PASS**. Existing >500 kB chunk warning remains.
- `node tests/sql/isolated-auth/run-local.mjs`: **50/50 PASS** on the free disposable local Supabase stack using real local Auth sessions and synthetic rows across two tenants.
- `HRIS_TEST_PORT=4199 npm run test:e2e`: **38/38 PASS**. Dedicated roster browser journey: **1/1 PASS**. Browser Auth/API calls were mocked; external requests were blocked.
- The five previously failing tenant-security cases all pass: Tenant B cannot read Tenant A attendance; Tenant A cannot read Tenant B attendance; Tenant B cannot call Tenant A dashboard/attendance/leave RPCs; Tenant B cannot approve Tenant A leave; Tenant B cannot approve Tenant A attendance.
- Evidence: `docs/evidence/shift-roster-desktop-20261012.png`, `docs/evidence/shift-roster-mobile-20261012.png`.
- Earlier attempts in this slice: the first SQL run was **49/50** because one new assertion overconstrained the expected test output; after correction, **50/50** passed. One initial browser run failed only because the existing Google Fonts request was counted as an external-call failure; the font response is now mocked and the roster journey passes. Local Docker socket access was initially sandbox-blocked; the approved local test runner then completed on the isolated stack.

## Story catalogue and blockers

- User-reported canonical source: 1,047 stories across 153 modules, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- Mounted Project `sources/` remains empty; only the local empty tracking skeleton is readable. Catalogue-level mapping is **0/1,047 fully implemented and accepted; 1,047 pending**. No story IDs or requirements were reconstructed.
- **Active blocker:** exact source access is required for canonical story-by-story traceability. This does not block further functional implementation against the inspected schema and existing permission contracts.
- **Next executable action:** continue Phase 08 with a manager shift-assignment journey gated by `attendance.manage`, respecting the existing unique `(tenant_id, employee_id, assignment_date)` constraint and testing it on the local Auth/RLS stack.

## Preservation and release boundary

- Local checkpoint commit is saved; working tree is clean.
- Update the owner-verified Drive preservation folder `HRMIS Preservation 2026-10-11` (`1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`) with new versioned checkpoint records and verify owner, write access and content round-trip. No existing archive is replaced.
- No paid Supabase service, production data/policy/Auth change, GitHub push, final archive certification or deployment occurred. Final order remains: complete all required implementation and acceptance, verify the final owner-owned Drive archive and integrity, push to GitHub, then deploy.
