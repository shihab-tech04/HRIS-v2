# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-13 07:30 Asia/Dhaka  
**State:** ACTIVE, INCOMPLETE, NOT FOR RELEASE  
**Branch:** `codex/recovery-checkpoint-20261012`  
**HEAD:** `6ac00e5e9e73a942a29fd0943b88dcb92c6a2fc2`

## Current implementation

**Current phase: Phase 11 — Performance Management. Current module: employee goal progress.** Employees can view and filter their own goals and update only their own `current_progress` from 0–100. Explicit tenant filters, membership scope, a tenant-switch request guard, loading/error/retry/empty/success states, and responsive cards are implemented. A candidate migration restricts updates to the progress column and keeps writes tenant-bound. This is a functional slice, not acceptance of all Phase 11 workflows.

The latest feature commit also completes an initial **Phase 10 Projects/Resource Allocation** slice: organization managers can create projects, allocate and release employees; employees can inspect their allocations. Candidate migrations enforce tenant-bound records, audit writes, overlap rules and a 100% allocation cap. These tables are not in the inspected production schema and the migration has not been applied to any hosted database.

Feature commit: `6ac00e5e9e73a942a29fd0943b88dcb92c6a2fc2` (`feat(hris): add project allocation and personal goal progress`), **25 files, +1,625/−9** including refreshed browser evidence images. The working tree was clean at checkpoint creation. No dedicated Projects/Performance Figma frames were found in the previously inspected references; the pages use the established workspace shell and design tokens. No pixel-match claim is made.

## Source changes since the 14:20 Drive checkpoint

Baseline: `4ded5f13f1ef2bf17237f347bfac9811283c52dc`. `src/`, `supabase/`, and `tests/` contain **40 paths, +10,166/−51 lines** since baseline:

```text
src/assets/attendance-download.png
src/assets/attendance-filter.svg
src/assets/attendance-search.svg
src/assets/attendance-team-sort.svg
src/live/LiveApp.tsx
src/live/LiveHrisWorkspace.tsx
src/live/MyPerformance.tsx
src/live/MyProjects.tsx
src/live/OrganizationProjects.tsx
src/live/OrganizationTeams.tsx
src/live/csv.ts
supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql
supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql
supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql
supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql
supabase/migrations/20261012173106_hris_employee_timesheets_tenant_scope.sql
supabase/migrations/20261012183000_hris_attendance_report_team_name.sql
supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql
supabase/migrations/20261013011651_hris_performance_goal_self_progress_tenant_scope.sql
supabase/migrations/20261013090000_hris_projects_and_allocations_tenant_scope.sql
supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql
supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql
tests/browser/attendance-information.spec.ts
tests/browser/employee-leave.spec.ts
tests/browser/employee-timesheets.spec.ts
tests/browser/manager-leave.spec.ts
tests/browser/managerial-dashboard.spec.ts
tests/browser/performance.spec.ts
tests/browser/project-workspace.spec.ts
tests/browser/shift-roster.spec.ts
tests/browser/system-workspace.spec.ts
tests/contracts/approval-resolution-migrations.test.mjs
tests/contracts/attendance-event.test.mjs
tests/contracts/attendance-report.test.mjs
tests/contracts/live-workspace.test.mjs
tests/contracts/performance-management.test.mjs
tests/contracts/phase1.test.mjs
tests/contracts/shift-roster.test.mjs
tests/sql/isolated-auth/fixture.sql
tests/sql/isolated-auth/run-local.mjs
```

## Tests executed since baseline

- `npm run check`: TypeScript PASS, **51/51 contract tests PASS, 0 FAIL**, Vite build PASS. Existing advisory: the minified JavaScript chunk exceeds 500 kB (about 800.72 kB).
- `HRIS_TEST_PORT=4193 npm run test:e2e`: **44/44 Chromium tests PASS, 0 FAIL**. Browser requests to external services are blocked; data is synthetic.
- `node tests/sql/isolated-auth/run-local.mjs`: **91/91 PASS, 0 FAIL** using a disposable local Supabase/Auth stack and synthetic identities in two tenants. No production fixture or permission was changed.
- `git diff --check`: PASS.

All five previously failing tenant-security cases are currently passing: reciprocal Tenant A/B attendance isolation; Tenant B manager denial for Tenant A dashboard/attendance/leave RPCs; Tenant B manager denial when approving Tenant A leave; and Tenant B manager denial when approving Tenant A attendance correction. Details and test boundaries are in `ACCEPTANCE_EVIDENCE_20261013_0730.md`.

## Canonical story catalogue

The owner reports the recovered authoritative source contains **1,047 stories / 153 modules**, source-linked requirement text, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.

Access checks for this checkpoint: the mounted Shihab UX Project `sources/` path contains zero files; Project MCP resources expose no story file; exact-name connected Drive search for `CANONICAL_USER_STORY_MATRIX.json` returned no results; a broader Drive search surfaced historical checkpoint records, not the matrix. The sole local same-name file, `docs/programme/CANONICAL_USER_STORY_MATRIX.json`, has `stories: []` and SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. It remains untouched as a tracking skeleton.

**Story-level status: 0/1,047 fully mapped and accepted; 1,047 pending.** This is a traceability count, not a product-function count. No story IDs, requirement text or acceptance criteria were reconstructed. The expected source SHA remains unverified because the source bytes are not exposed in this task.

## Blockers and next action

The story mapping blocker is source visibility, not implementation. Keep building from verified existing application contracts and Figma patterns while leaving catalogue acceptance pending. A separate production constraint remains: production role IDs do not match the agreed membership role IDs, and production currently has zero tenant memberships. No production changes were made. Projects/allocation is candidate-only; live production schema lacks the tables and write grants observed in previous read-only inspection.

Next: continue Phase 11 functional workflows against verified goal fields, tenant-scoped permissions and available Figma references; expand acceptance with disposable local Auth/RLS cases. Continue the implementation while seeking the recovered source through available project mounts. Do not push or deploy.

## Preservation and release order

This checkpoint is saved as a new local commit and recoverable Git bundle. Versioned records are to be uploaded into the previously verified, owner-controlled `HRMIS Preservation 2026-10-11` folder, then read back and matched. This is an interim source checkpoint, not the full final source archive. Complete and verify the product first; create and integrity-check the final Drive source archive before the final GitHub push; deployment remains after that push.
