# Acceptance Evidence — 2026-10-13 10:10 Asia/Dhaka

## Phase 11 — Organization Performance appraisal-status filter

**Feature commit:** `00e61962a38361c915bbcd985a7b090035cffacd`

The organization view now filters appraisals separately from goal status. Filter choices come from the statuses returned by the current tenant-scoped query; search and review-cycle filtering remain intact. No appraisal score or feedback fields are selected, exported, or made writable. The 375px overflow check remains part of the browser journey.

Evidence since the 09:55 checkpoint:

- TypeScript check: PASS.
- Complete contract suite: **57/57 PASS**.
- Focused `tests/browser/manager-performance.spec.ts`: **1/1 PASS**; exercises `submitted_by_employee` and `draft` filtering, existing goal/cycle/search filters, filtered CSV, and 375px layout.
- Complete Chromium suite: **48/48 PASS**.
- Vite production build: PASS; large entry chunk advisory at 819.66 kB minified.
- `git diff --check`: PASS.
- Isolated local Supabase Auth/RLS suite: not rerun for this UI-only slice. Last result remains **105/105 PASS** at 09:55. The Phase 10 project permission tests and five prior tenant-security cases passed in that run.

## Preserved security and release state

Phase 10 project creation and membership boundaries remain at commits `a2d5007814af244d059c0e4563b210052d453dc8` and `ab21b62559ae73231048ef7dfcab4194df97acd9`. Ordinary Admin/Manager project creation denials, assigned Project Manager scope, direct reassignment denials, tenant isolation, and team retention across multiple projects remain covered. No production database, identity, permissions, or paid services were changed.

## Canonical stories

The expected source digest is `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520` (1,047 stories / 153 modules). Those bytes were not visible in the mounted Project sources or the connected Drive search results in this execution. The empty repository tracking skeleton remains untouched at SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. Story mapping/acceptance remains **0/1,047 mapped; 1,047 pending verified source and story-specific evidence**. No story IDs or criteria were inferred.

No GitHub push or deployment occurred. Full product acceptance and final Drive archive verification remain prerequisites for publication.
