# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 17:07 Asia/Dhaka  
**Status:** Recoverable local checkpoint — NOT FOR RELEASE.

## Current implementation

- **Phase 08 — Attendance, shift, roster and time management. Current module: Employee Attendance Correction Request.** The employee can submit a correction bound to their active tenant membership and linked employee; the server converts requested local times with that tenant’s timezone, records a pending request and audit entry, and exposes only the employee’s own correction history in the personal dashboard. Manager approval continues through the existing tenant-scoped approval contract.
- Main HRIS branch: `codex/recovery-checkpoint-20261012`. Feature checkpoint: `1edd97d1e13d58330e6df2ab9a8ace13a99ec61b`. The preceding Attendance Information implementation remains at `25f612da0972d0336af38b83d9e145572566c1ce`.
- The immediate prior Drive baseline is `4ded5f13f1ef2bf17237f347bfac9811283c52dc` from `CHECKPOINT_STATUS.md`, modified at 14:20 Asia/Dhaka. Since that revision, the implementation code paths changed are:
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
- The complete baseline diff is **56 paths, +5,535 / −55 text lines**. No working-tree changes remained at the feature commit.

## Acceptance executed

- `npm run check`: TypeScript PASS; contracts **26/26 PASS**; Vite build PASS with the existing large-chunk warning (699.64 kB JavaScript); `git diff --check` PASS.
- `HRIS_TEST_PORT=4194 npm run test:e2e`: full Chromium **37/37 PASS, 0 failed**. The employee attendance correction journey also passed separately **1/1**; all external browser requests were mocked or blocked.
- `node tests/sql/isolated-auth/run-local.mjs`: disposable local Supabase Auth/RLS **47/47 PASS, 0 failed**, using synthetic identities across two tenants. It verifies correction identity/tenant binding, local-time conversion, request audit, employee-owned history, rejection of empty changes and cross-tenant submissions, and the prior approval/security cases.
- All five previously failing tenant-security cases pass in the 47-check suite: tenant B cannot read tenant A attendance; tenant A cannot read tenant B attendance; tenant B cannot call tenant A dashboard/attendance/leave RPCs; tenant B cannot approve tenant A leave; tenant B cannot approve tenant A attendance.
- Mobile screenshot: `docs/evidence/employee-attendance-correction-mobile-20261012.png`.

## Canonical story coverage

- Owner-reported source: **1,047 stories / 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The current mounted Project `sources/` directory has zero files; local search found only the empty repository tracking skeleton (0 stories, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`). The user-reported recovered source has not yet been independently verified in this task’s mount.
- **Stories fully implemented and accepted against canonical IDs: 0/1,047. Stories still unmapped: 1,047.** This count is about story-to-requirement acceptance, not a claim that the tested functional slices above are absent.

## Blocker and next executable work

- Story mapping is blocked because the exact-hash file is not available in the mounted Project source directory. Do not fabricate story IDs or acceptance criteria.
- Product implementation is not blocked. Continue Phase 08 with the next attendance/roster/time workflow and the corresponding Figma-aligned page, while retaining the 47-check local Auth/RLS suite and 37-check browser suite in the acceptance loop.

## Preservation and release order

- The Drive folder `HRMIS Preservation 2026-10-11` is owner-verified to the connected account and already contains the 16:58 checkpoint. Add this checkpoint as new versioned records without replacing older records; verify owner, destination permissions and round-trip integrity.
- No production data/permissions changed; no paid service activated; no GitHub push, final source archive or deployment occurred.
- Complete all 22 phases and canonical story acceptance, then upload and verify the final source archive in Drive, then perform the final GitHub push, then deploy. This checkpoint is not a release approval.
