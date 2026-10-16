# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-13 06:39 Asia/Dhaka  
**State:** ACTIVE, INCOMPLETE, NOT FOR RELEASE  
**Branch:** `codex/recovery-checkpoint-20261012`  
**HEAD:** `d18563f73007dd3e1746018295d040f2e00d1f3f`

## Current implementation

**Phase 10 — Projects, teams and resource allocation. Current module: tenant-scoped Teams directory.** The live workspace exposes the directory only to an active membership with `organization.view` or `organization.manage`. It reads `teams` and `departments` with an explicit active `tenant_id`, and relies on the current RLS policies. Search covers name, code and department; status supports active/inactive/all; the page includes counts, loading/error/retry/empty states and a horizontally scrollable table.

Feature commit: `d18563f73007dd3e1746018295d040f2e00d1f3f` (`feat(organization): add tenant-scoped teams directory`), 5 files, **+228/-9**. The change is committed locally and the working tree is clean. It uses the established HRIS shell and tokens. No exact Projects/Teams Figma frame was found, so this is not claimed as pixel-matched to a dedicated frame.

The read-only production schema metadata confirmed `teams` and `departments` exist with RLS enabled. Authenticated table grants include SELECT but no INSERT/UPDATE/DELETE. No `projects` or `project_assignments` table was returned. No production data, schema, permissions, Auth settings, paid service, GitHub, or deployment was changed.

## Source changes since the 14:20 Drive baseline

Baseline: `4ded5f13f1ef2bf17237f347bfac9811283c52dc`. Current `src/`, `supabase/`, and `tests/` diff: **31 unique paths, +8,528/-51 lines**.

- `src/assets/attendance-download.png`, `src/assets/attendance-filter.svg`, `src/assets/attendance-search.svg`, `src/assets/attendance-team-sort.svg`
- `src/live/LiveApp.tsx`, `src/live/LiveHrisWorkspace.tsx`, `src/live/OrganizationTeams.tsx`
- `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`, `20261012111928_hris_tenant_shift_roster_read.sql`, `20261012113020_hris_tenant_shift_assignment_manage.sql`, `20261012115907_hris_employee_web_attendance_event.sql`, `20261012173106_hris_employee_timesheets_tenant_scope.sql`, `20261012183000_hris_attendance_report_team_name.sql`, `20261012230100_hris_membership_tenant_read_guards.sql`
- `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql`, `20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`
- `tests/browser/attendance-information.spec.ts`, `employee-leave.spec.ts`, `employee-timesheets.spec.ts`, `manager-leave.spec.ts`, `managerial-dashboard.spec.ts`, `shift-roster.spec.ts`, `system-workspace.spec.ts`
- `tests/contracts/approval-resolution-migrations.test.mjs`, `attendance-event.test.mjs`, `attendance-report.test.mjs`, `live-workspace.test.mjs`, `phase1.test.mjs`, `shift-roster.test.mjs`
- `tests/sql/isolated-auth/fixture.sql`, `tests/sql/isolated-auth/run-local.mjs`

## Verification

- `npm run check`: TypeScript PASS; **45/45 contracts PASS, 0 FAIL**; Vite build PASS (existing large-chunk advisory).
- Focused Teams browser journey: **2/2 PASS, 0 FAIL** at 375px and desktop; verifies active/all/inactive filtering, department search, explicit tenant query filter and no page overflow.
- Full Chromium suite: **41/41 PASS, 0 FAIL**.
- Disposable local Supabase Auth/RLS: **77/77 PASS, 0 FAIL**. The five previously failing tenant-security cases remain **5/5 PASS**.
- `git diff --check`: PASS. Browser-generated screenshots were restored to retain committed Figma evidence.
- One unprivileged local Docker launch was denied access to the Colima scratch socket before tests ran; **0 tests executed** in that attempt. The explicitly authorized local rerun completed 77/77. Production was not reached.

See `ACCEPTANCE_EVIDENCE_20261013_0639.md` for the exact security cases and test boundaries.

## Canonical story catalogue

Owner-reported catalogue: **1,047 original stories / 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. This Project's mounted `sources/` directory currently contains zero files. Exact-name search of the Project files and connected Drive did not return the recovered JSON. The only local file named `docs/programme/CANONICAL_USER_STORY_MATRIX.json` has `stories: []` and SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`; it is the tracking skeleton, not the catalogue. Project MCP resources also expose no story file. Therefore **0/1,047 are mapped and accepted against canonical story text; 1,047 remain pending verified source access and story-level acceptance**. This traceability count does not mean zero product functionality is implemented. No IDs or requirements were reconstructed.

## Blockers and next executable work

The catalogue-mapping blocker is source visibility: the current Project mount is empty and Drive search did not provide the source bytes, so its expected SHA cannot yet be verified. Continue implementing from verified schema and existing design patterns while keeping story acceptance pending.

Phase 10 project/resource allocation cannot be safely added from the current live schema: there is no projects or project-assignments table and the existing teams/departments API grants are read-only. Continue the functional Teams directory and move to another grounded module where data contracts and permissions exist; do not invent project authorization or production schema.

The separate timesheet reviewer path remains default-deny until a verified tenant-scoped project-lead mapping and timesheet permission are available. Production role IDs still do not match the allowed `hr_admin`/`hr_recruiter` membership values, and there are zero production tenant memberships. No fixtures or permission changes were made in production.

## Preservation and release order

This is a new local checkpoint; earlier bundles and Drive records remain untouched. Upload versioned checkpoint/evidence/ledger records to the owner-verified `HRMIS Preservation 2026-10-11` folder and read each back before recording receipt. A final full-source archive must be created and integrity-verified in the owner account's Drive before the final GitHub push. Complete product acceptance precedes that archive; deployment remains last.
