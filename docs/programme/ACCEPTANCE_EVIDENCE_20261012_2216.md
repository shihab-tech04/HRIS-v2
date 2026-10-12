# Acceptance Evidence — Shift Roster Apply Filters

**Date:** 2026-10-12 22:16 Asia/Dhaka  
**Feature commit:** `7060c371adc8f3e0794fde473a251c85aa70bbda`  
**Phase/module:** Phase 08 — Shift roster filters  
**Environment:** local Vite/Chromium with synthetic Auth/RPC responses; disposable local Supabase Auth/PostgreSQL for authorization regression. No production writes.

## User-visible behavior

- The roster's From, To and Employee or shift values are drafts until `Apply filters` is submitted.
- A date edit alone causes no service request. Applying the form sends the selected tenant ID, date range and committed search value to `hris_get_tenant_shift_roster_data`.
- An empty or reversed date range shows a validation error and does not load an invalid range.
- Applied dates continue to drive the roster range label and CSV filename. Assignment creation and duplicate-assignment recovery remain intact.

## Verification

- `npm run check`: TypeScript PASS, **39/39 contract tests PASS**, Vite build PASS (existing 723.93 kB minified chunk advisory).
- `HRIS_TEST_PORT=4248 npm run test:e2e`: **38/38 Chromium PASS**; the shift-roster journey passed as part of the suite. It checks that date drafts do not call the RPC, Apply filters commits the expected tenant/date/search payload, search works, assignment succeeds, duplicate assignment is rejected without overwrite, CSV downloads and the 375px view remains usable. External requests are blocked.
- `node tests/sql/isolated-auth/run-local.mjs`: **65/65 Auth/RLS PASS** using only synthetic accounts and two tenants on the disposable local stack. No SQL changed in this feature slice; the suite was rerun to retain current isolation evidence.
- All five prior tenant-security regressions passed: tenant A/B attendance reads are isolated in both directions; tenant B is denied tenant A dashboard/attendance/leave RPCs; and tenant B is denied tenant A leave and attendance decisions. Other acceptance covers active-membership role resolution, global-role-only denial, report-only visibility, Auth revocation, employee self-service, private evidence, leave approval, attendance correction and roster assignment.
- `git diff --check`: PASS. The test harness's first contract attempt failed 1/39 due a missing test file reference; fixed before the final 39/39 run. The first local browser/Docker attempts were denied by sandbox networking/socket access before tests executed; local-only reruns completed with explicit escalation.

## Canonical story mapping

- Expected catalogue: **1,047 stories / 153 modules**, SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The current task's Project `sources/` directory contains zero files. Local and Drive searches found only the empty local tracking skeleton, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`, and prior checkpoint records; the canonical source bytes are unavailable here.
- **0/1,047 mapped and accepted against canonical text; 1,047 pending source access and story-level acceptance.** No story IDs or acceptance criteria are inferred.
