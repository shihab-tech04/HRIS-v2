# Acceptance Evidence — Tenant-Safe Attendance Team Names

**Date:** 2026-10-12 18:32 Asia/Dhaka  
**Feature commit:** `a458865709c6dbee79091c193a6527c4d9789001`  
**Phase/module:** Phase 08 — Attendance Report, Figma `17:28320`  
**Environment:** local Vite/Chromium with mocked app endpoints; disposable local Supabase CLI/Auth/PostgreSQL with synthetic tenants. No production writes.

## Functional change

- Read-only Supabase schema metadata confirmed `employees.team_id -> teams.id`; both tables have `tenant_id`. No employee records or personal data were queried.
- The aggregate `hris_get_tenant_attendance_data(..., p_report=true)` response now includes `team_name` through a `teams` join constrained to the selected tenant. Employee, department, designation and shift joins remain scoped to the requested tenant.
- The report renders Team Name and includes it in CSV. Existing detailed attendance/correction screens retain their prior permission path.
- The synthetic fixture intentionally gives one Tenant A employee a Tenant B `team_id`; the report returns no team label for that row. Valid Tenant A and Tenant B employees receive their own team labels.

## Verification

- `npm run check`: **35/35 contract tests PASS**, TypeScript PASS, Vite build PASS. Existing large JavaScript chunk advisory remains (721.19 kB).
- Isolated local Auth/RLS suite: **65/65 PASS, 0 failed**. Includes a `reports.view`-only active membership that can read the aggregate report but is denied attendance detail; tenant A/B team names; a deliberately mismatched team reference; cross-tenant attendance denial in each direction; cross-tenant dashboard/attendance/leave RPC denial; cross-tenant leave/attendance decision denial; and all previously passing Auth/RLS cases.
- Focused Chromium Attendance Report journey: **1/1 PASS**. Verifies report-only page, Team Name, positive/negative deviation, filters, CSV contents and 375px table behavior. The immediately preceding full suite was **38/38 PASS**; the current change was verified with the focused attendance journey.
- `git diff --check`: PASS before code commit.

## Story mapping and release state

- The user reports recovery of the canonical **1,047-story / 153-module** catalogue, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The current task's Project `sources/` mount contains zero files. Connected Drive exact-name searches return preservation records that cite the catalogue, not the catalogue bytes. The expected SHA therefore cannot be verified in this task. The repository's `CANONICAL_USER_STORY_MATRIX.json` remains an empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`).
- **0/1,047 stories are mapped and accepted against the authoritative story text; 1,047 remain pending source access and story-level verification.** This does not mean no product functionality has been implemented. No IDs or requirements were inferred.
- Migration `20261012183000_hris_attendance_report_team_name.sql` is local release-candidate code only. No production SQL, data, permissions, Auth settings, paid service, GitHub push or deployment was used.
