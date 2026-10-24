# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 18:09 Asia/Dhaka  
**State:** active implementation checkpoint; not a release candidate.  
**Current phase:** Phase 08 — Attendance, shift, roster and time management.  
**Current module slice:** employee web clock-in/out on the authenticated Personal Dashboard.

## Local source checkpoint

- The feature is committed locally as `66d0a12b92f7dca38331848da82ab0d4da9acbf3` (`feat: persist employee web attendance events`) on the existing recovery branch. No GitHub push or deployment was made.
- Since the 14:20 Drive baseline commit `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, the source diff is **21 paths, +5,808/−55**. The complete code/test path list is below.
- The latest feature commit changed nine paths: one React workspace, one SQL migration, three test files and a local synthetic fixture/runner pair, plus desktop/mobile dashboard evidence. No production SQL, data, permissions or Auth settings changed.
- Employee clock-in/out uses the existing `attendance_records` row. The server binds the live session to an active employee and tenant, derives the tenant-local date, rejects invalid/duplicate/out-of-order events, preserves unrelated fields and writes one audit event.

### Source and test files changed since the 14:20 baseline

`playwright.config.ts`; `src/live/LiveApp.tsx`; `src/live/LiveHrisWorkspace.tsx`; migrations `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`, `supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql`, `supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql`, `supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql`; staged approvals `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql` and `supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`; browser tests `tests/browser/attendance-information.spec.ts`, `tests/browser/employee-leave.spec.ts`, `tests/browser/managerial-dashboard.spec.ts`, `tests/browser/shift-roster.spec.ts`, `tests/browser/system-workspace.spec.ts`; contracts `tests/contracts/approval-resolution-migrations.test.mjs`, `tests/contracts/attendance-event.test.mjs`, `tests/contracts/live-workspace.test.mjs`, `tests/contracts/phase1.test.mjs`, `tests/contracts/shift-roster.test.mjs`; and `tests/sql/isolated-auth/fixture.sql`, `tests/sql/isolated-auth/run-local.mjs`.

## Acceptance since the 14:20 baseline

- `npm run check`: **32/32 contract tests PASS**, TypeScript check PASS, Vite production build PASS. Existing large-chunk warning remains (719.12 kB minified JS).
- Full mocked Chromium suite: **38/38 PASS**. It includes the employee check-in → refresh → check-out journey on a 375px viewport, the correction and leave journeys, and the manager roster/assignment journey. External requests are blocked.
- Disposable local Supabase Auth/RLS suite: **63/63 PASS, 0 failed**. Nine synthetic Auth users across two tenants exercised real local sessions. No paid Supabase branch was activated and no production database was used.
- The five previously failing tenant-security cases all pass: cross-tenant attendance read denial in both directions; Tenant B cannot call Tenant A dashboard/attendance/leave RPCs; Tenant B cannot approve Tenant A leave; Tenant B cannot approve Tenant A attendance.
- Desktop and 375px employee-dashboard evidence is at `docs/evidence/employee-dashboard-desktop-20261012.png` and `docs/evidence/employee-dashboard-mobile-20261012.png`.

## Story catalogue status

- The owner reports the recovered canonical catalogue has **1,047 stories**, **153 modules**, and expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- This task's mounted Project `sources/` directory is empty. The local filename search found only `docs/programme/CANONICAL_USER_STORY_MATRIX.json`, the empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`). An exact-name Google Drive search returned no catalogue file. Thus **0 stories are mapped and fully accepted against the recovered criteria; 1,047 remain pending story-level verification**. This does not mean no functionality is implemented; it means no catalogue-level story claims are made without the source text.

## Next executable work

Continue Phase 08 from the existing tenant-scoped attendance, correction, history and report contracts; align the next attendance page with the available Figma reference before changing its UI. Continue implementing independently verifiable product behavior while resolving the Project source mount. Production reconciliation, final Drive archive certification, GitHub publication and deployment remain later gates.
