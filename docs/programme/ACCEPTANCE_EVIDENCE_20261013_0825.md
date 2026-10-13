# Acceptance Evidence — 2026-10-13 08:25 Asia/Dhaka

## Phase 11: Organization Performance review-cycle context

Feature commit: `4db38ba255ea06d8a4738719a516fdf9d0d9a095`.

- The organization Performance page loads review-cycle records and goals with explicit active-tenant filters.
- The cycle selector narrows goals by the selected `cycle_id`; search and status filters remain available.
- The selected cycle displays its existing status, period, self-review deadline, and manager-review deadline.
- Summary cards use the selected cycle's goals. A failed cycle lookup leaves the goal view available and announces the degraded state.
- No insert/update/delete controls or schema changes were added. Employee self-progress remains on its existing separately permissioned page.

Verification:

- Focused manager Performance browser journey: **1/1 PASS**.
- Full Chromium suite: **47/47 PASS, 0 FAIL**, including Phase 10 project-permission cases.
- `npm run check`: TypeScript PASS; **53/53 contract tests PASS, 0 FAIL**; Vite build PASS.
- Latest unchanged disposable Supabase Auth/RLS suite: **94/94 PASS** at checkpoint 08:05; this feature added no SQL.

The page is a verified functional slice, not complete Phase 11 acceptance. Employee appraisal submission, manager appraisal, cycle administration, finalization/release, and the full acceptance path remain open.

## Phase 10 security correction regression

The preceding commit `ae41175db1adcbf917ce6043db404ce17cfd870a` enforces the approved Super Admin / assigned Project Manager rules. Ordinary organization Admin/Manager creation, appointment, and project membership-management actions are denied. Employee teams and multiple project allocations remain supported. Current full browser suite passes; latest local Auth/RLS run covers negative/positive role and tenant cases, including the five historic tenant-security failures.

## Canonical user-story mapping

The expected recovered matrix hash is `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The current Project `sources/` mount is empty and the local tracking skeleton has `stories: []` and hash `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. **0/1,047 stories mapped and accepted; 1,047 pending source verification and story-specific evidence.** No story IDs were inferred.
