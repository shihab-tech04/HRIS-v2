# Acceptance Evidence — 2026-10-12 23:53 Asia/Dhaka

**Scope:** Phase 08 employee timesheets; continuation from the 14:20 Drive source baseline.
**Feature commits:** `a7d4d580cc9a4c7b02d5e5d0a125824de010fd47`, `fbb26aa3107cfd6a50b0087d1855e013f8160600`, `36998dc465d95486cd417e51e2eedee9db2e0eb0`.
**Decision:** PASS for employee-side save/edit/submit in the isolated local scope; reviewer, canonical story, production and release acceptance remain open.

## Implemented employee journey

Employees can load tenant-scoped timesheet context, create a daily or weekly draft, add activity/date/hours/note rows, save and reopen a draft, edit and save it again, and submit it for review. The editor totals hours by work date and warns before save when any day exceeds the existing 24-hour server-enforced limit; the UI makes no save RPC while invalid. The SQL release-candidate migration binds access to the active Auth employee and tenant, validates same-tenant active activities and dates, writes audit events, locks submitted rows, and default-denies direct table reads. The SQL migration is local-only. No dedicated timesheet Figma frame was available; the screen reuses the existing HRIS shell and responsive patterns, so pixel-level Figma parity is not claimed.

## Checks since the source baseline

| Check | Result |
|---|---:|
| `npm run check` | TypeScript PASS; **44/44 contracts PASS**; Vite build PASS |
| `HRIS_TEST_PORT=43976 npx playwright test tests/browser/employee-timesheets.spec.ts --project=chromium` | **1/1 PASS, 0 FAIL** (includes draft edit, daily total warning, no invalid save RPC, re-save, submit and mobile no-overflow) |
| `HRIS_TEST_PORT=43977 npx playwright test --project=chromium` | **40/40 PASS, 0 FAIL** |
| `node tests/sql/isolated-auth/run-local.mjs` | **77/77 PASS, 0 FAIL** on the disposable local Auth/RLS stack before the UI-only totals/test slice; no SQL behavior changed afterwards (the migration change was a comment correction) |
| `git diff --check` | PASS |

The five previously failing tenant-security cases remain **5/5 PASS**: tenant B manager cannot read tenant A attendance; tenant A manager cannot read tenant B attendance; tenant B manager cannot call tenant A dashboard/attendance/leave RPCs; tenant B manager cannot resolve tenant A leave; tenant B manager cannot resolve tenant A attendance correction. These remain covered by the unchanged 77/77 isolated suite. No production data, Auth settings, or permissions were changed.

## Source delta and story traceability

Compared with `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, `src/`, `tests/`, and `supabase/` contain **30 changed files, +8,095/-51**. Since the 23:44 local checkpoint, the Phase 08 timesheet slice changed three source/test files **+43/-10**, plus a phase-comment correction in the migration. Latest feature/test commits are listed above; the local checkpoint also has commit `119c56d4e3cb5b8310c37e3cc4780daa2cfe0169` and Drive receipt commit `03f410e14232586ceda6cc9b4b39cd07f22e63e9`.

The expected catalogue SHA-256 is `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520` for 1,047 stories across 153 modules. The mounted Project `sources/` directory returned no files; the repository `stories:[]` skeleton remains SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. Therefore catalogue-story acceptance is **0/1,047 verified; 1,047 pending** authoritative source visibility and story-level evidence. This does not claim that 0 product features have been implemented. No story IDs or requirement text were reconstructed.

## Remaining blocker and release order

Production metadata has no timesheet-specific permission, project/allocation tables or verified project-lead-to-employee mapping. The legacy reviewer RPCs use a pinned tenant resolver and remain unused. Manager review needs authoritative permission and approver mapping before implementation. Continue independently executable Phase 08/09 work while resolving the canonical source mount. Complete product/story acceptance, then verify destination ownership/write access, upload and read back the final full-source Drive archive, and only then perform the final GitHub push and deployment.
