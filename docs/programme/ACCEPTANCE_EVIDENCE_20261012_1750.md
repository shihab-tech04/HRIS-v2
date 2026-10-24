# Acceptance Evidence — 2026-10-12 17:50 Asia/Dhaka

This evidence covers the current functional slices only; it does not certify the entire Phase 09, all of Phase 08, the 22-phase product, or the canonical story catalogue.

## Phase 09 — Employee Personal Leave

- **Figma reference:** Personal Leave node `3:39880` in file `XEXLe9J1oATlITS9I5u1P9`.
- **Implemented:** employee-only navigation; current-year balance breakdown; leave history filtered by selected calendar year, including requests overlapping a year boundary; CSV download scoped to the selected year; existing leave request flow retained.
- **Backend boundary:** uses existing `hris_get_my_dashboard_data(uuid)` and `hris_employee_submit_leave_request(uuid,jsonb)`. No new SQL/RPC was added in this UI slice.
- **Browser evidence:** targeted employee leave journey **1/1 PASS**; full Chromium suite **38/38 PASS** after the change. Tests verify navigation, history year filter, CSV filename/download and 375px viewport behavior using mocked service calls with external requests blocked.
- **Visual evidence:** `docs/evidence/personal-leave-desktop-20261012.png` and `docs/evidence/personal-leave-mobile-20261012.png`.

## Security and regression state

- Main `npm run check`: TypeScript **1/1 PASS**, contracts **29/29 PASS**, Vite build **1/1 PASS** (existing >500 kB bundle warning).
- Disposable local Supabase Auth/RLS: **55/55 PASS**, run before this UI-only slice; no SQL/security code changed afterward.
- The five earlier tenant-security failures passed: attendance isolation A→B and B→A; Tenant B cannot call Tenant A dashboard, attendance or leave RPCs; Tenant B cannot approve Tenant A leave or attendance.
- Assignment and approval coverage remains local-scratch only. No production data or permissions changed.

## Story mapping limit

- Canonical source as reported: 1,047 stories / 153 modules; expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The source is not visible in the current Project mount (`sources/` contains 0 files); exact-name Drive search returned no matrix. The only local matrix is the empty tracking skeleton and its hash does not match.
- **Canonical acceptance: 0/1,047 mapped and accepted; 1,047 pending verified source access.** The browser and local Auth/RLS evidence above are real, but have not been attributed to guessed story IDs or criteria.
