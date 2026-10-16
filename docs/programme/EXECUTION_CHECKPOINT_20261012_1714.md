# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 17:14 Asia/Dhaka  
**Status:** Recoverable local checkpoint — NOT FOR RELEASE.

## Current implementation

- **Phase 08 — Attendance, shift, roster and time management. Current module: employee correction request and manager resolution.** Employees can submit a correction tied to their active tenant and linked employee. The server converts times using the tenant timezone, writes a pending correction and audit row, and returns the employee’s own correction history. Attendance managers can review, approve or reject requests in the tenant-scoped queue.
- Main HRIS branch: `codex/recovery-checkpoint-20261012`. Current local HEAD: `a8210584529b6ddac54546929e22c16bb3a4e335`. Feature implementation commit: `1edd97d1e13d58330e6df2ab9a8ace13a99ec61b`; the manager decision browser acceptance commit is `a8210584529b6ddac54546929e22c16bb3a4e335`.
- The 14:20 Asia/Dhaka Drive checkpoint (`CHECKPOINT_STATUS.md`) records baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`. Current diff from that revision is **60 paths, +5,743 / −55 text lines**.
- The implementation source paths changed from that baseline are:
  - `playwright.config.ts`
  - `src/live/LiveApp.tsx`
  - `src/live/LiveHrisWorkspace.tsx`
  - `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`
  - `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql`
  - `supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`
  - `tests/browser/attendance-information.spec.ts`
  - `tests/browser/employee-leave.spec.ts`
  - `tests/browser/managerial-dashboard.spec.ts`
  - `tests/browser/system-workspace.spec.ts`
  - `tests/contracts/approval-resolution-migrations.test.mjs`
  - `tests/contracts/live-workspace.test.mjs`
  - `tests/contracts/phase1.test.mjs`
  - `tests/sql/isolated-auth/fixture.sql`
  - `tests/sql/isolated-auth/run-local.mjs`

## Latest acceptance evidence

- `npm run check`: TypeScript PASS; contracts **26/26 PASS**; Vite build PASS with a 699.64 kB JavaScript chunk warning; `git diff --check` PASS.
- `HRIS_TEST_PORT=4199 npm run test:e2e`: full Chromium suite **37/37 PASS, 0 failed**. The employee request and manager approve/reject journeys are both included; all external requests were blocked or mocked.
- `HRIS_TEST_PORT=4198 npx playwright test tests/browser/attendance-information.spec.ts --project=chromium`: targeted Attendance Information and manager correction actions **1/1 PASS**.
- Latest disposable local Supabase Auth/RLS run: **47/47 PASS, 0 failed**, using synthetic Auth identities across two tenants. It covers employee submission, local-time conversion, ownership/history, audit, invalid change rejection, cross-tenant denial, manager approval, partial fields, concurrency, rollback, grants and session revocation.
- The five earlier failing tenant-security cases remain passing: tenant B cannot read tenant A attendance; tenant A cannot read tenant B attendance; tenant B cannot call tenant A dashboard/attendance/leave RPCs; tenant B cannot approve tenant A leave; tenant B cannot approve tenant A attendance.
- Screenshots: `docs/evidence/employee-attendance-correction-mobile-20261012.png`, `docs/evidence/attendance-information-desktop-20261012.png`, `docs/evidence/attendance-information-mobile-20261012.png`.

## Canonical stories and blocker

- Owner-reported catalogue: **1,047 stories / 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The mounted Project `sources/` directory has zero files; local search found only the empty repository tracking skeleton, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. The user-reported recovered source has not yet been independently verified in this task’s mount.
- Canonical count: **0/1,047 stories mapped and accepted; 1,047 remain unmapped**. This does not erase the functional browser and Auth/RLS evidence above.
- Story mapping root cause: the expected-hash file is not accessible in the mounted Project source directory. Continue product work; do not invent stories or criteria.
- Next executable slice: continue Phase 08 with the next attendance/roster/time journey and Figma-aligned page while preserving existing regression evidence.

## Drive preservation and release boundary

- Destination `HRMIS Preservation 2026-10-11` (`1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`) is owned by the connected account. The 17:07 Markdown/checksum files were read back exactly and the JSON hash matched byte-for-byte. Add this 17:14 checkpoint as new records and verify it without replacing earlier files.
- No production data or permissions changed; no paid service, GitHub push, final source archive or deployment occurred.
- Complete the whole product and canonical story acceptance, then verify the final source archive in Drive, then push to GitHub, then deploy.
