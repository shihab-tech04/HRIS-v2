# Acceptance Evidence — 2026-10-12 23:57 Asia/Dhaka

**Scope:** Phase 08 employee timesheets; continuation from the 14:20 Drive source baseline.
**Latest feature commit:** `9c28d08910c1ea83ee682c96ab6eb67061ccd44c`.
**Decision:** PASS for employee-side save/edit/rejection recovery/submit in the isolated scope; reviewer authorization, canonical story acceptance, production and release remain open.

## Implemented journey

An employee can load their tenant-bound timesheets, create a daily/weekly draft, add activity/date/hours/note entries, view live per-day totals, receive a pre-save warning for a day over 24 hours, save and edit drafts, and submit for review. If a returned row is rejected, its reviewer note remains visible and the action is labeled **Revise timesheet**. Saving the correction returns it to draft; the employee can then resubmit. Invalid daily totals never call the save RPC. Server-side limits, active employee/tenant checks, audit writes, submission lock and default-deny direct-table RLS remain authoritative in the local-only migration.

The page reuses the established HRIS shell and responsive patterns. No dedicated timesheet frame was available in the recovered Figma references; no pixel-level Figma parity is claimed.

## Checks since the source baseline

| Check | Result |
|---|---:|
| `npm run check` | TypeScript PASS; **44/44 contracts PASS**; Vite build PASS (existing >500 kB chunk advisory remains) |
| `HRIS_TEST_PORT=43978 npx playwright test tests/browser/employee-timesheets.spec.ts --project=chromium` | **1/1 PASS, 0 FAIL** |
| `HRIS_TEST_PORT=43979 npx playwright test --project=chromium` | **40/40 PASS, 0 FAIL** |
| `node tests/sql/isolated-auth/run-local.mjs` | **77/77 PASS, 0 FAIL** on disposable local Auth/RLS before the client-only UI slice; no SQL behavior changed afterwards |
| `git diff --check` | PASS |

The five prior tenant-security failures remain **5/5 PASS**: tenant B cannot read tenant A attendance; tenant A cannot read tenant B attendance; tenant B cannot call tenant A dashboard/attendance/leave RPCs; tenant B cannot resolve tenant A leave; tenant B cannot resolve tenant A attendance correction. They remain covered by the unchanged 77/77 isolated suite. The SQL release candidate remains unapplied to hosted production; no production data, Auth settings or permissions changed.

## Source delta and story traceability

From baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, `src/`, `tests/`, and `supabase/` show **30 changed files, +8,120/-51**. Since the 23:53 checkpoint, two source/test files changed **+32/-5**; Figma-aligned evidence captures were refreshed. Exact paths are listed in `EXECUTION_CHECKPOINT_20261012_2357.md`.

The owner reports the canonical 1,047-story / 153-module matrix is in Project sources and expects SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The task's mounted Project `sources/` directory currently returns no files; the local tracking skeleton remains unchanged at SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. Catalogue-level acceptance is therefore **0/1,047 verified; 1,047 pending** authoritative source visibility and story-by-story evidence. This is not a count of implemented product features. No requirements or story IDs were reconstructed.

## Blocker and next action

The reviewer workflow lacks a verified project-lead-to-employee mapping, project/allocation tables and timesheet-specific production permission. The legacy reviewer RPCs use a pinned tenant resolver and remain unused. Continue independently executable Phase 08/09 product work from existing contracts while resolving the source mount; do not invent reviewer authorization. Complete all product/story acceptance, then verify the account-owned Drive destination and final source archive integrity/readback before the final GitHub push and deployment.
