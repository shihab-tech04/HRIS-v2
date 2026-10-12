# Synesis HRIS 360° — Execution Checkpoint

Date: 2026-10-12 23:08 Asia/Dhaka  
State: ACTIVE, INCOMPLETE, NOT FOR RELEASE  
Main branch: `codex/recovery-checkpoint-20261012`

## Current phase and module

**Phase 19 — Data migrations, security and cross-system certification.** Current module: tenant-scoped direct reads for the 20 tenant-keyed HRIS tables previously identified by the production security snapshot. This change restores each active tenant role's own authorized records in the existing read-only System Workspace and constrains the older permissive policies to that same tenant role.

The latest local implementation commit is `2d8216e3f70574c9a3e8241192b1f52f10517483` (`security: scope legacy reads to tenant memberships`). It adds `supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql` and extends the isolated RLS fixture, contract and runtime tests. The migration has **not** been applied to any hosted database.

## Code changes since the 14:20 Drive checkpoint

The Main `src`, `tests`, and `supabase` diff from baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc` is **27 files, +6,951 / -51 lines**. Changed paths:

- `src/assets/attendance-download.png`
- `src/assets/attendance-filter.svg`
- `src/assets/attendance-search.svg`
- `src/assets/attendance-team-sort.svg`
- `src/live/LiveApp.tsx`
- `src/live/LiveHrisWorkspace.tsx`
- `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`
- `supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql`
- `supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql`
- `supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql`
- `supabase/migrations/20261012183000_hris_attendance_report_team_name.sql`
- `supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql`
- `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql`
- `supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`
- `tests/browser/attendance-information.spec.ts`
- `tests/browser/employee-leave.spec.ts`
- `tests/browser/managerial-dashboard.spec.ts`
- `tests/browser/shift-roster.spec.ts`
- `tests/browser/system-workspace.spec.ts`
- `tests/contracts/approval-resolution-migrations.test.mjs`
- `tests/contracts/attendance-event.test.mjs`
- `tests/contracts/attendance-report.test.mjs`
- `tests/contracts/live-workspace.test.mjs`
- `tests/contracts/phase1.test.mjs`
- `tests/contracts/shift-roster.test.mjs`
- `tests/sql/isolated-auth/fixture.sql`
- `tests/sql/isolated-auth/run-local.mjs`

The current security slice modified four files: the new tenant-read migration, `tests/contracts/phase1.test.mjs`, `tests/sql/isolated-auth/fixture.sql`, and `tests/sql/isolated-auth/run-local.mjs`. It did not change front-end source. Existing Figma-aligned Attendance Report and Personal Leave pages remain intact.

## Tests executed

- `node tests/sql/isolated-auth/run-local.mjs`: final **69/69 PASS, 0 FAIL**. It used real local Auth sessions, synthetic users and records in two tenants, and an empty disposable local Supabase stack. The suite checks both tenants' authorized reads on all 20 tables, cross-tenant denial, global-role-only denial, anonymous denial despite local SELECT grants, and tenant-viewer permissions. All five previously failing tenant-security cases pass.
- `npm run check`: TypeScript PASS, **43/43 contract tests PASS**, Vite production build PASS. The existing 728.46 kB bundle advisory remains.
- `HRIS_TEST_PORT=4248 npm run test:e2e`: **38/38 Chromium PASS**. Tests use synthetic Auth/RPC/storage responses and block external requests.
- Two intermediate SQL-suite iterations each reported **68/69 PASS, 1 FAIL** while the new membership-permissive reads were incomplete. The failure identified Tenant B losing access to its own rows. Adding the role-scoped read policies fixed it; the final two runs passed 69/69. An unprivileged browser attempt exited before tests because the sandbox denied loopback binding; the authorized local rerun passed 38/38.

## Story catalogue status

Expected source: 1,047 stories / 153 modules, SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The mounted Project `sources/` directory still contains zero files. The repository matrix is the empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`). **0/1,047 stories are mapped and accepted against authoritative story text; 1,047 remain pending.** This measures story traceability, not how many product functions have been implemented. No story IDs or requirement text have been inferred.

## Active blocker and next executable action

Read-only production metadata shows the `tenant_memberships.role` constraint permits `hr_admin` and `hr_recruiter`, but neither value exists in `roles.id`; current role IDs are `1`, `12345`, `hris_system_admin`, and `nadiaaa`. `tenant_memberships` has zero rows. Therefore the approved membership-role authorization model has no current production mapping. No production data or permissions were changed to create test fixtures. Before applying the migration, reconcile the real HR role identifiers and assignments, then rerun the same local two-tenant suite against that explicit mapping.

The connected Supabase cost lookup for organization `qdcgrdntvspjsdszuzmy` remains unavailable. No paid service or branch was activated. Continue functional Phase 08/09 work and proceed to the next unverified module while the role mapping and recovered catalogue source are resolved. Preserve the Figma-aligned pages and existing passing journeys.

## Preservation and release order

The owner-verified Drive folder is `HRMIS Preservation 2026-10-11` (`1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`). Earlier checkpoint records were uploaded and read back exactly. This checkpoint's evidence records are being added as new versioned files; older archives remain untouched. The 18:56 source ZIP is stale, not the final archive.

No production changes, paid Supabase services, GitHub push or deployment occurred. Complete and verify the entire product, then create and read back the full Drive source archive, then perform the final GitHub push and deployment.
