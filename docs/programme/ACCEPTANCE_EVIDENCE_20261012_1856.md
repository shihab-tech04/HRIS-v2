# Acceptance Evidence — Attendance Team Filter and Sorting

**Date:** 2026-10-12 18:56 Asia/Dhaka  
**Feature commit:** `14aed5471ac1ba09b435cebf9e16154f6de5bd2c`  
**Phase/module:** Phase 08 — Attendance Report, Figma `17:28320`  
**Environment:** mocked local Vite/Chromium and disposable local Supabase Auth/PostgreSQL with synthetic tenants. No production writes.

## User-visible behavior

- Aggregate report filter: Figma Team selector and Apply Filter action. `All teams` resets the applied filter; `Unassigned` is available when report data contains employees without a team.
- Team Name header: keyboard accessible toggle sorts ascending then descending. The `<th>` exposes the current `aria-sort`; stable ties retain their original report order and unassigned names remain at the end.
- The table, filtered empty state, export enabled state and CSV all use the same filtered/sorted rows. Team filter options come from the already-authorized `reports.view` response. No backend query, endpoint, permission or database access was added.

## Verification

- `npm run check`: TypeScript PASS, **37/37 contracts PASS**, Vite build PASS (existing 723.51 kB minified chunk advisory).
- Full Chromium suite: **38/38 PASS**. Focused attendance journey: **1/1 PASS** on the exact source. It verifies ascending and descending order, `aria-sort`, filter apply/reset, the selected row and CSV content, search/date/status filters, correction decisions, and the 375px responsive table. External requests are blocked.
- Disposable local Auth/RLS: **65/65 PASS, 0 failed**. Tenant isolation, Auth session behavior, permission grants, report-only aggregate access, team tenant joins and cross-tenant denial remain green. This UI-only feature adds no SQL change.
- All five prior tenant-security cases: **5/5 PASS**.
- No production data, schema, permission, Auth setting or paid service changed.

## Canonical story mapping

- Expected catalogue: 1,047 stories / 153 modules; expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The task's Project `sources/` mount is empty, exact-name Drive search found no catalogue file, and the local JSON is only an empty skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`).
- **0 stories mapped and accepted against canonical acceptance text; 1,047 pending source visibility and story-level verification.** No story requirements or IDs are reconstructed.
