# Acceptance Evidence — Shift Roster Filters and Figma Sort Glyph

**Date:** 2026-10-12 22:27 Asia/Dhaka  
**Phase/module:** Phase 08 — Shift Roster and Attendance Report  
**Main commits:** `7060c371adc8f3e0794fde473a251c85aa70bbda`, `93e4c532378eadb8029a7d20187fba2e50476ebe`, `84d71177d54da1bb42f3e3dc0c39e2fdce62adf8`.

## Shift Roster journey

- From, To and employee/shift search are draft values until `Apply filters`. Date edits alone issue no RPC.
- Empty or reversed dates show `Choose a valid roster date range.` and issue no roster RPC. After correction to a valid range, the roster applies the new tenant/date/search payload and reloads.
- Existing successful assignment, duplicate-assignment rejection without overwrite, CSV export and 375px table usability remain covered.
- Browser evidence: `tests/browser/shift-roster.spec.ts`.

## Figma Attendance Report sort glyph

- Figma source node `17:28320`, table header `17:28324`, Team Name vector `17:28334` were inspected with a rendered screenshot. The exact 14 × 11.5957 SVG was downloaded to `src/assets/attendance-team-sort.svg` and loaded as a local asset. There are no temporary Figma asset URLs in application code.
- The header still announces ascending/descending, updates `aria-sort`, and shares order between visible rows and CSV.
- Browser evidence: `tests/browser/attendance-information.spec.ts`; rendered desktop evidence: `docs/evidence/attendance-report-desktop-20261012.png`. This accepts the icon and the tested interaction, not full application-wide Figma parity.

## Verification

- `npm run check`: **39/39 contracts PASS**, TypeScript PASS and Vite build PASS (existing 726.66 kB minified chunk advisory).
- Full `HRIS_TEST_PORT=4248 npm run test:e2e`: **38/38 Chromium PASS**. Focused attendance report journey: **1/1 PASS**.
- Latest disposable local Auth/RLS suite: **65/65 PASS** at 22:15; no SQL/security code changed after that run. All five previous tenant-security blockers passed.
- Browser requests used synthetic Auth/RPC responses and blocked external traffic. No production database/data/permissions or paid service were used.

## Canonical story mapping

- Expected catalogue: 1,047 stories / 153 modules, SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- This task's Project `sources/` directory is empty. Local and Drive searches found only the empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`) and preservation records, not the canonical source bytes.
- **0/1,047 mapped and accepted against canonical text; 1,047 pending** exact source access and story-level acceptance. No story IDs or criteria are inferred.
