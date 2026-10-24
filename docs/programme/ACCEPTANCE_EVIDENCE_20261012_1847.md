# Acceptance Evidence — Figma Attendance Team Filter

**Date:** 2026-10-12 18:49 Asia/Dhaka  
**Feature commit:** `a839b07a57757cbb17a0c16284e8c23f5633f9ca`  
**Phase/module:** Phase 08 — Attendance Report, Figma `17:28320`  
**Environment:** mocked local Vite/Chromium and disposable local Supabase Auth/PostgreSQL with synthetic tenants. No production writes.

## User journey

- The aggregate Attendance Report exposes the Figma `Select Team` control and `Apply Filter` action alongside date controls.
- Applying a team selection filters visible employee summary rows. `All teams` restores all report rows. Employees without a team can be selected as `Unassigned` where present.
- CSV export uses the same filtered rows shown in the report. If the selected team has no rows, the report shows a matching empty state and disables export.
- Team choices are derived only from the existing tenant-scoped report response. This change adds no endpoint, data query, role, permission or database write.

## Verification

- `npm run check`: TypeScript PASS, **36/36 contracts PASS**, Vite build PASS (existing 722.40 kB minified chunk advisory).
- Full Chromium browser suite: **38/38 PASS**. Dedicated Attendance Report journey: **1/1 PASS** on the exact source commit. Browser mocks synthesize two report rows with different teams; assertions verify both selection and reset, the hidden/shown row behavior, and that downloaded CSV contains the selected team's row and excludes the other team. Existing search, date/status filter, correction, desktop and 375px behavior also pass. External requests are blocked.
- Disposable local Supabase Auth/RLS: **65/65 PASS, 0 failed**. This code slice contains no SQL/security modifications. The suite covers synthetic identities in two tenants, report-only aggregate access versus denied detail, same-tenant team labels and null for a mismatched cross-tenant team link, plus all prior RLS/Auth cases.
- Five previously failing tenant-security checks: **5/5 PASS**—cross-tenant attendance read denial A↔B, Tenant B denied Tenant A dashboard/attendance/leave RPCs, Tenant B denied Tenant A leave decisions, and Tenant B denied Tenant A attendance decisions.
- No production data, schema, permissions, Auth settings or paid services changed.

## Canonical story mapping

- Expected catalogue: 1,047 stories / 153 modules; expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- Current Project `sources/` mount is empty and exact-name Drive search returned no matching file. The local JSON is an empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`).
- **0 stories mapped and accepted against canonical acceptance text; 1,047 pending source visibility and story-level verification.** No story IDs or requirements are reconstructed.
