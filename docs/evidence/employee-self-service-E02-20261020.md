# Employee self-service source evidence — E02-08 and E02-12

**Checkpoint:** Main `development/hris-checkpoints` at `012f3a999ac9ec288dd37837db1487a88e014fc6`  
**Canonical catalogue:** 1,047 stories / 153 modules; catalogue SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`  
**Verification:** disposable Supabase Auth, PostgreSQL, RLS/API, and Chromium run [39369899972](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39369899972), completed successfully.

| Story | Canonical requirement | Source and acceptance evidence |
| --- | --- | --- |
| E02-08 | As an employee, I want to view my employment information. | Tenant-checked self-only employment information RPC exposes employee number, designation, department, and status. Covered by `tests/sql/isolated-auth/run-local.mjs`, `tests/sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs`, `tests/contracts/employee-identity-card.test.mjs`, and browser marker `E02-08_EMPLOYMENT_INFORMATION_BROWSER_PASS`. |
| E02-12 | As an employee, I want to manage skills. | Employee-owned skill create/edit/delete persists; duplicate, anonymous, and cross-tenant access is rejected; verified-skill changes are protected. Covered by `tests/sql/isolated-auth/run-local.mjs`, `tests/sql/isolated-auth/run-learning-browser.mjs`, `tests/contracts/learning-self-service.test.mjs`, and browser marker `E02-12_SKILL_PROFILE_BROWSER_PASS`. |

These are source-level/disposable results only. No hosted authentication, production data, database schema, migration history, permissions, or deployment was changed by this evidence checkpoint. Hosted acceptance remains pending the separate Phase 03/04 migration workstream and its API/RLS gates.
