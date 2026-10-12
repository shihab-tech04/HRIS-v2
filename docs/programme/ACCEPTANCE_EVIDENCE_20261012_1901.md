# Acceptance Evidence — Figma Attendance Date and Team Filters

**Date:** 2026-10-12 19:01 Asia/Dhaka  
**Feature commit:** `b0a3da24ae93162c401a19cca51b87aa81bc440c`  
**Phase/module:** Phase 08 — Attendance Report, Figma `17:28320` / filter `17:28323`  
**Environment:** mocked local Vite/Chromium and previously validated disposable local Supabase Auth/PostgreSQL. No production writes.

## User-visible behavior

- Aggregate report date fields are draft values. Apply Filter commits From, To and Team together and reloads the report once for the committed range.
- Invalid date order shows the existing date-range error and makes no RPC request.
- Team options remain available after an applied date change; the report table and CSV use the committed Team filter and current sort order.
- Detailed attendance remains on its existing immediate date/status behavior.

## Verification

- `npm run check`: TypeScript PASS, **38/38 contracts PASS**, Vite build PASS (existing 723.77 kB minified chunk advisory).
- Full Chromium suite: **38/38 PASS**; focused attendance journey **1/1 PASS** on the exact source. Synthetic RPC call counts confirm changing an aggregate date input alone sends no report request; Apply Filter then sends the new date. Detailed date behavior, sort, team filter apply/reset, CSV and mobile table also pass. External requests are blocked.
- Disposable local Auth/RLS suite: **65/65 PASS** in the preceding checkpoint. No SQL/security files changed in this slice. Five prior tenant-security cases were all passing in the same run.
- No production data, schema, permission, Auth setting or paid service changed.

## Canonical story mapping

- Expected catalogue: 1,047 stories / 153 modules, SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The current Project `sources/` mount has zero files; the exact-name Drive search returned no catalogue item. The in-repo JSON is only an empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`).
- **0 stories mapped and accepted against canonical text; 1,047 pending verified source visibility and story-level acceptance.** No IDs or acceptance criteria are reconstructed.
