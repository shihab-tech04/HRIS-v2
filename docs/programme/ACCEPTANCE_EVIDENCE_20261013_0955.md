# Acceptance Evidence — 2026-10-13 09:55 Asia/Dhaka

## Phase 11 — Filtered Organization Performance export

**Feature commit:** `efcdfa008a2b50ccfde3e68582269724bfbab7ad`

The organization-performance export contains only the page's currently visible, tenant-scoped goal progress and appraisal status after the existing search and filter controls are applied. It uses the shared CSV helper, which quotes CSV cells and prefixes nonnumeric formula-leading text. It does not export appraisal scores or final feedback. The page remains permission-gated and read-only for performance viewers.

Evidence:

- TypeScript check: PASS.
- Contract tests: **56/56 PASS**.
- Focused `tests/browser/manager-performance.spec.ts`: **1/1 PASS**; verifies filtered CSV content, filename, and absence of appraisal score/feedback data.
- Full Chromium suite: **48/48 PASS**.
- Disposable local Supabase Auth/RLS suite: **105/105 PASS, 0 FAIL**. No SQL changed in the Phase 11 export commit; this run reconfirmed the current security baseline.
- Vite build: PASS; the existing entry-chunk advisory remains at 819.02 kB minified.

## Preserved Phase 10 — Project creation and membership permissions

Feature commit `a2d5007814af244d059c0e4563b210052d453dc8`; expanded boundary-test commit `ab21b62559ae73231048ef7dfcab4194df97acd9`. Active Super Admin alone can create projects and appoint Project Managers. Only the assigned Project Manager can add or release project members on projects assigned to them; Super Admin has no member-management override. Ordinary Admin/Manager creation, direct manager reassignment, cross-manager same-tenant membership, and unauthorized direct project writes are denied. Employee organizational team membership remains while allocations span multiple projects. The current local Auth/RLS run passes all these cases. No hosted migration, production data or permission change occurred.

## Source and release limitations

Canonical story-specific acceptance remains **0/1,047 mapped and accepted; 1,047 pending**. The expected canonical SHA-256 is `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`; this task's source mount is empty and the local `stories: []` skeleton remains unmodified with SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. No GitHub push or deployment occurred. A final complete-product archive and cryptographic Drive readback are still required before push/deployment.
