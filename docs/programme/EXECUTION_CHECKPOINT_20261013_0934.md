# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-13 09:34 Asia/Dhaka  
**State:** ACTIVE, INCOMPLETE, NOT FOR RELEASE  
**Branch:** `codex/recovery-checkpoint-20261012`  
**Current feature commit:** `a2d5007814af244d059c0e4563b210052d453dc8`

## Current implementation checkpoint

**Phase 10 — Projects, teams and resource allocation. Current module: project creation, Project Manager appointment, and project membership permissions.**

The permission audit found that the project create RPC already required an active Super Admin and the UI used its `can_create` capability. RLS exposed project tables for read only; direct project creation and manager reassignment had no authenticated table-write grant. A conflict remained in the project-manager permission layer: Super Admin also received `can_manage` and could add/release members, despite the approved assigned-Project-Manager-only membership rule.

The source migration now grants membership management only when the caller’s linked employee is the project’s assigned lead. Super Admin retains project creation and appointment authority, while ordinary Admin/Manager and Super Admin receive no member-management controls. The role-filtered project reads, team relationships, employee self-service view, multi-project allocation behavior and Phase 11 appraisal implementation remain intact.

## Changed files and checkpoint

Feature commit `a2d5007814af244d059c0e4563b210052d453dc8` (`fix(hris): restrict project membership to assigned managers`) changes five files, **+95/−22**:

- `supabase/migrations/20261013100000_hris_project_superadmin_and_project_manager_permissions.sql`
- `tests/browser/project-workspace.spec.ts`
- `tests/contracts/live-workspace.test.mjs`
- `tests/sql/isolated-auth/fixture.sql`
- `tests/sql/isolated-auth/run-local.mjs`

The separate Phase 11 appraisal-status feature remains committed at `590baf650015aba04e91ab4bbb74980c013a7eeb`. It was not modified in this Phase 10 correction.

## Verification

- `npm run check`: TypeScript PASS; **55/55 contract tests PASS, 0 FAIL**; Vite build PASS. The existing minified JavaScript chunk advisory remains at 817.88 kB versus the 500 kB advisory threshold.
- Focused project-workspace browser suite: **5/5 PASS, 0 FAIL**.
- Full Chromium regression: **48/48 PASS, 0 FAIL**.
- Disposable local Supabase Auth/RLS suite: **103/103 PASS, 0 FAIL**. This includes separate Admin and Manager project-create denials, direct project-manager update denials for Admin, Manager, assigned Project Manager and Super Admin, Super Admin member-add/release denials, assigned Project Manager add/release, cross-tenant denials, and the prior tenant-isolation checks.
- All five previously failing tenant-security tests remain passing. The full suite also reports tenant reads correctly bounded for both fixtures across 20/20 guarded tables.
- `git diff --check`: PASS before commit. Browser-generated evidence screenshots were restored after the full run.

All SQL/Auth tests used synthetic users/data on the free disposable local stack. No hosted Supabase database, production record, permission, Auth setting, paid service, GitHub push or deployment was touched.

## Canonical story traceability

The owner reports the recovered catalogue has 1,047 original stories across 153 modules and expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The current Project `sources/` mount remains empty; the local matrix file is only an untouched empty tracking skeleton. Therefore **0/1,047 stories are mapped and accepted against the canonical source; 1,047 remain pending verified source access and story-specific evidence**. No story text or IDs were reconstructed.

## Next executable action

Continue the existing product work from the current checkpoint, preserving the Phase 11 appraisal pages and regressions. Resume the next functional, Figma-aligned Phase 11 flow only where existing schema and verified authorization define the behavior. Keep story-level mapping pending until the canonical source bytes are available and hash-verified. Finish and verify the product, then create and integrity-check the full Drive backup before the final GitHub push and deployment.

