# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-13 06:51 Asia/Dhaka  
**State:** ACTIVE, INCOMPLETE, NOT FOR RELEASE  
**Branch:** `codex/recovery-checkpoint-20261012`  
**Feature HEAD:** `a2834b6550d2f42c56c94c1ace066d99f6b4e6a1`

## Current implementation

**Phase 10 — Projects, teams and resource allocation. Current module: tenant-scoped Teams directory.** The directory is restricted to an active membership with `organization.view` or `organization.manage`. It fetches teams and departments with an explicit active `tenant_id`, and relies on the current RLS policies. Search covers name/code/department; status supports active/inactive/all. Counts, loading/error/retry/empty states, responsive table scrolling and filtered CSV export are present.

Latest feature commit: `a2834b6550d2f42c56c94c1ace066d99f6b4e6a1` (`feat(organization): export filtered teams safely`), 6 files, **+55/-33**. It extracts the existing spreadsheet-safe CSV helper for reuse and exports only the directory's filtered visible rows. The Teams CSV acceptance checks that formula-leading text is neutralized. This follows the established HRIS shell/tokens; a dedicated Teams Figma frame was not found, so no pixel-match claim is made.

Read-only live schema metadata confirms `teams` and `departments` have RLS and authenticated SELECT grants; no INSERT/UPDATE/DELETE grants or `projects`/`project_assignments` tables were found. No production data/schema/permissions/Auth settings, paid services, GitHub or deployment were changed.

## Source changes since the 14:20 Drive baseline

Baseline commit: `4ded5f13f1ef2bf17237f347bfac9811283c52dc`. Current `src/`, `supabase/`, and `tests/` diff: **32 unique paths, +8,550/-51 lines**.

- `src/assets/attendance-download.png`, `src/assets/attendance-filter.svg`, `src/assets/attendance-search.svg`, `src/assets/attendance-team-sort.svg`
- `src/live/LiveApp.tsx`, `src/live/LiveHrisWorkspace.tsx`, `src/live/OrganizationTeams.tsx`, `src/live/csv.ts`
- `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`, `20261012111928_hris_tenant_shift_roster_read.sql`, `20261012113020_hris_tenant_shift_assignment_manage.sql`, `20261012115907_hris_employee_web_attendance_event.sql`, `20261012173106_hris_employee_timesheets_tenant_scope.sql`, `20261012183000_hris_attendance_report_team_name.sql`, `20261012230100_hris_membership_tenant_read_guards.sql`
- `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql`, `20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`
- `tests/browser/attendance-information.spec.ts`, `employee-leave.spec.ts`, `employee-timesheets.spec.ts`, `manager-leave.spec.ts`, `managerial-dashboard.spec.ts`, `shift-roster.spec.ts`, `system-workspace.spec.ts`
- `tests/contracts/approval-resolution-migrations.test.mjs`, `attendance-event.test.mjs`, `attendance-report.test.mjs`, `live-workspace.test.mjs`, `phase1.test.mjs`, `shift-roster.test.mjs`
- `tests/sql/isolated-auth/fixture.sql`, `tests/sql/isolated-auth/run-local.mjs`

## Verification

- Latest `npm run check`: TypeScript PASS; **45/45 contracts PASS, 0 FAIL**; Vite build PASS (existing 762.46 kB minified chunk advisory).
- Focused Teams journey: **2/2 PASS, 0 FAIL** on isolated loopback port 44039. Verifies active/all/inactive filter behavior, department search, tenant ID filter, 375px no page overflow/table scroll and CSV contents for the currently filtered rows. The export test includes a formula-leading code and confirms spreadsheet-safe output.
- Full Chromium suite: **41/41 PASS, 0 FAIL** on isolated loopback port 44040.
- Latest isolated local Supabase Auth/RLS run: **77/77 PASS, 0 FAIL**. No SQL/Auth/RLS code changed in this CSV slice, so the result remains applicable. All five previously failing tenant-security cases pass **5/5**.
- `git diff --check`: PASS. Browser-generated images were restored to keep committed Figma evidence intact.
- A first contract run had **44/45 PASS, 1 FAIL** because the contract searched for the CSV helper in its old file after extraction; the contract now reads the shared utility and the final run is 45/45. One unprivileged Playwright attempt was blocked before execution by localhost `EPERM` (**0 tests ran**); the isolated local retry passed 2/2. These are resolved setup/assertion issues, not failures in the final runs.

See `ACCEPTANCE_EVIDENCE_20261013_0651.md` for exact test evidence and limits.

## Canonical story catalogue

Owner-reported source: **1,047 original stories / 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The current Project `sources/` mount is empty. Exact-name searches of Project files and connected Drive and Project MCP resource listing did not expose the recovered JSON. The only local `CANONICAL_USER_STORY_MATRIX.json` remains `stories: []`, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. It is a tracking skeleton. **0/1,047 stories are mapped and accepted against authoritative text; 1,047 remain pending verified source access and story-level evidence.** This is traceability, not a product-function count; no story IDs/criteria were reconstructed.

## Blockers and next executable work

The story-mapping blocker is source visibility: no canonical file bytes are available in the current Project source mount, so the expected hash cannot be confirmed. Continue implementation from verified schema and existing UI patterns while maintaining that status.

Phase 10 allocation and project write flows cannot be completed safely against the current live database: it has no projects or project-assignment tables, and teams/departments are SELECT-only for authenticated users. Continue other functional work whose schema and authorization are available; do not invent project authorization or alter production schema.

The timesheet reviewer remains default-deny pending a verified tenant-scoped project-lead mapping and permission. Production role IDs still do not match the allowed `hr_admin`/`hr_recruiter` membership values, and there are zero production tenant memberships. No fixture/permission changes were made in production.

## Preservation and release order

This is an intermediate checkpoint. Append new versioned records to the owner-verified Drive folder and read back each record with exact text/parent verification. Finish full product acceptance, then create/read-back verify the complete source archive in the connected account's Drive; only then final-push to GitHub and deploy last.
