# Acceptance Evidence — 2026-10-12 23:44 Asia/Dhaka

**Scope:** Phase 08 employee timesheet self-service; regression baseline from 14:20.
**Feature commit:** `a7d4d580cc9a4c7b02d5e5d0a125824de010fd47`.
**Decision:** PASS for the isolated employee-side implementation; NOT ACCEPTED for reviewer scope, canonical story coverage, production or release.

## Implemented journey

The employee timesheet page loads tenant-scoped context and supports weekly/daily periods, adding/removing activity rows, date/hours/note entry, draft save/edit and submit-for-review. Submitted periods are locked. The SQL migration exposes only Auth-bound SECURITY DEFINER RPCs with a fixed `search_path`; direct table reads default-deny. Writes require an active linked employee and same-tenant active activity, valid period dates, at most 24 hours per entry/day, non-empty submission, and append audit activity. The screen reuses the current authenticated HRIS shell and responsive patterns. No dedicated timesheet Figma frame was found, so no pixel-level Figma acceptance is claimed.

## Executed checks since the 14:20 source baseline

| Command / scope | Result |
|---|---:|
| `npm run check` | TypeScript PASS; **44/44 contracts PASS**; Vite production build PASS (existing large-bundle advisory remains) |
| `HRIS_TEST_PORT=43973 npx playwright test --project=chromium` | **40/40 PASS, 0 FAIL** |
| `HRIS_TEST_PORT=43972 npx playwright test tests/browser/employee-timesheets.spec.ts --project=chromium` | **1/1 PASS, 0 FAIL** |
| `node tests/sql/isolated-auth/run-local.mjs` | **77/77 PASS, 0 FAIL**, real synthetic local Auth sessions and two tenant fixtures on a disposable local Supabase stack |
| `git diff --check` | PASS |

The five tenant-security regressions from the previous checkpoint are still **5/5 PASS**: tenant B cannot read tenant A attendance rows; tenant A cannot read tenant B attendance rows; tenant B cannot invoke tenant A dashboard/attendance/leave RPCs; tenant B cannot decide tenant A leave requests; tenant B cannot decide tenant A attendance corrections. The isolated suite also checks same-tenant reads, global-role-only denial, anon denial, and the new timesheet tenant boundary. No production data, policy, Auth setting, or permission was modified.

## Source delta and traceability

Relative to baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, `src/`, `tests/`, and `supabase/` have **30 changed files, +8,062/-51**. The timesheet slice is six files, **+899/-2**, committed as `a7d4d580cc9a4c7b02d5e5d0a125824de010fd47`.

The canonical matrix expected by the owner contains 1,047 stories across 153 modules and should hash to `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The mounted Project `sources/` directory is currently empty; the in-repo `stories:[]` tracking skeleton is unchanged at SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. Therefore **0/1,047 stories are accepted against authoritative story text; 1,047 remain pending source visibility and story-level mapping**. This is not a count of implemented product capabilities. No story IDs or requirements were reconstructed.

## Known acceptance limits and release gate

Production metadata has no timesheet-specific permission, project/allocation tables or verified project-lead-to-employee mapping. The legacy reviewer RPCs use a pinned tenant resolver and are not used. Reviewer UI/backend remains pending verified authorization semantics. The migration remains local-only. No paid Supabase service, hosted test branch, GitHub push or deployment was used. Finish functional journeys and complete story-level acceptance; create and read-back-verify the final full-source archive in a verified account-owned Drive folder before any final push or deployment.
