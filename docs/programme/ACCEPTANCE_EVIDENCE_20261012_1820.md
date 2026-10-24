# Acceptance Evidence — Figma-Aligned Attendance Report

**Date:** 2026-10-12 18:19 Asia/Dhaka  
**Feature commit:** `2d55ff93146445f6aaf799acb26b9e7149c52338`  
**Figma source:** frame `17:28320`, “attendance information”  
**Environment:** mocked local React/Chromium and the previously verified isolated local Supabase/Auth/RLS stack. No production mutation.

## Results

- **Contracts:** `npm run check` — **32/32 PASS**, 0 failed.
- **TypeScript:** PASS.
- **Vite build:** PASS; existing large-chunk advisory at 721.16 kB minified JavaScript.
- **Chromium:** **38/38 PASS**. The attendance journey verifies detailed rows and correction approve/reject for a manager, then reloads with only `reports.view` and verifies aggregate report rows, date range, two-decimal hours, positive/negative signed deviation, search submit, date filters, CSV download and a contained horizontal table at 375px.
- **Local Auth/RLS:** **63/63 PASS** on the current SQL baseline, including cross-tenant reads/decisions, global-role-only denial, permission scoping, active employee checks, attendance clock event rules and audit. No SQL changed in the report UI commit.

## Figma data boundary

- The report-only layout matches the reference hierarchy: title and compact controls, employee rows, designation/team/department/date fields, office/work hours and deviation.
- The existing tenant-scoped report RPC returns no `team_name` or employee photos. The view displays a neutral unavailable team value and initials; it does not fabricate either field.
- Employee clock-in/out remains in local commit `66d0a12b92f7dca38331848da82ab0d4da9acbf3` and was verified by the same 38-test suite plus the 63/63 local SQL/Auth/RLS suite.

## Prior tenant-security failures

All five pass in the local 63/63 suite:

1. Tenant B cannot read Tenant A attendance.
2. Tenant A cannot read Tenant B attendance.
3. Tenant B cannot request Tenant A dashboard, attendance or leave RPC data.
4. Tenant B cannot approve Tenant A leave.
5. Tenant B cannot approve Tenant A attendance.

## Catalogue state

The recovered 1,047-story/153-module catalogue is reported to have SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`, but the mounted Project `sources/` directory is empty and the exact-name Drive search returns no file. **0/1,047 stories are mapped and accepted against that source; 1,047 remain pending verification.** No story IDs or acceptance text were inferred.
