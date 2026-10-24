# Regression Ledger — 2026-10-13 07:30 Asia/Dhaka

**HEAD:** `6ac00e5e9e73a942a29fd0943b88dcb92c6a2fc2`.

| Area | Latest evidence | Result | Boundary |
|---|---|---|---|
| Source contracts, types and build | `npm run check`; 51 contracts, TypeScript, Vite build | PASS | Existing large-chunk advisory (~800.72 kB minified). |
| Full Chromium workspace | `HRIS_TEST_PORT=4193 npm run test:e2e`; 44 tests | PASS | Synthetic responses; outbound requests blocked. |
| Auth/RLS and tenant isolation | `node tests/sql/isolated-auth/run-local.mjs`; 91 cases | PASS | Disposable local Supabase/Auth only; synthetic two-tenant fixture. |
| Five prior tenant-security failures | Reciprocal attendance isolation; tenant-scoped dashboard/attendance/leave RPCs; leave and attendance approvals | PASS, 5/5 | No production data or permissions modified. |
| Phase 10 project/allocation candidate | Browser and isolated SQL coverage are included in latest suites | PASS locally | Candidate migration only; hosted production lacks these tables in previous metadata inspection. |
| Phase 11 employee goal progress | Browser, contract and four SQL checks included in latest suites | PASS locally | Does not certify manager review or full performance cycle. |
| Figma-aligned Attendance, Leave and dashboards | Existing screens and refreshed committed browser evidence | PRESERVED | New Projects/Performance pages use the existing shell/tokens; exact dedicated Figma frames were not available. |
| Story catalogue | Source bytes not exposed; local file remains empty skeleton | PENDING | 0/1,047 mapped/accepted; expected source hash unverified. |
| Production and release | Read-only inspection only; no paid service, push or deployment | UNCHANGED | Full product acceptance remains open. |

`git diff --check` passed. See `ACCEPTANCE_EVIDENCE_20261013_0730.md` for detailed scope and test limits.
