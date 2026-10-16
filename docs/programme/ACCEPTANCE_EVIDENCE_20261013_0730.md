# Acceptance Evidence — 2026-10-13 07:30 Asia/Dhaka

## Phase 10: Projects and resource allocation

Feature commit: `6ac00e5e9e73a942a29fd0943b88dcb92c6a2fc2`.

`OrganizationProjects` supports project creation, employee allocation and release. `MyProjects` shows employee allocations. Candidate SQL defines tenant-bound project, allocation, and audit records, overlap validation, a 100% allocation ceiling, and tenant-scoped write RPCs. Browser tests cover the manager and employee journeys. The migration has not been applied to production; live production previously had no project/allocation tables, so production acceptance is not claimed. No dedicated exact Figma frame was available in the inspected references.

## Phase 11: Employee goal progress

The employee Performance page reads goals in the active tenant and allows only the linked employee to update their own `current_progress` between 0 and 100. The candidate migration uses membership tenant scope, limits grants to the progress column, and retains the existing goal history trigger. The screen supports search/filter, loading/error/retry/empty/success states, responsive cards, and prevents an in-flight request from an old tenant from repopulating the page after a tenant switch. The 4 new isolated SQL cases verify own-goal read, allowed progress write, blocked unrelated/out-of-range changes, and cross-tenant denial.

## Final verification since the Drive baseline

- `npm run check`: TypeScript PASS; **51/51 contract tests PASS, 0 FAIL**; Vite build PASS (existing large minified chunk advisory, about 800.72 kB).
- `HRIS_TEST_PORT=4193 npm run test:e2e`: **44/44 Chromium PASS, 0 FAIL**.
- `node tests/sql/isolated-auth/run-local.mjs`: **91/91 Auth/RLS PASS, 0 FAIL**, against disposable local Supabase with synthetic users and two tenants.
- `git diff --check`: PASS.

The 5 historic tenant-security regressions all pass: (1) Tenant B cannot read Tenant A attendance, (2) Tenant A cannot read Tenant B attendance, (3) Tenant B manager cannot call Tenant A dashboard/attendance/leave RPCs, (4) Tenant B manager cannot approve Tenant A leave, and (5) Tenant B manager cannot approve Tenant A attendance correction.

The browser suite uses synthetic API fixtures and blocks external requests. Auth/RLS tests use only disposable local resources and synthetic identities. No production data, permissions, Auth settings or schema were changed. No paid Supabase service, GitHub push or deployment occurred.

## Canonical story acceptance

Expected canonical source hash: `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. At this checkpoint the Project `sources/` mount has no files, Project resources expose no source, and exact-name Drive search returns no matrix. The local tracking skeleton remains `stories: []`, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. **0/1,047 stories are mapped and accepted against canonical text; 1,047 are pending source access and story-specific evidence.** No requirements or IDs were inferred.
