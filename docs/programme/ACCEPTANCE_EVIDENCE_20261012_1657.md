# HRIS Acceptance Evidence — 2026-10-12 16:57 Asia/Dhaka

This checkpoint records executed evidence for the authenticated employee dashboard and Attendance Information page. It does not certify the complete product release or assign invented canonical story IDs.

## Employee Dashboard — Phase 17

| Functionality | Evidence | Result and limits |
|---|---|---|
| Tenant-linked employee identity, organization-local date, attendance, recent work hours/location, leave balances, request entry/history and holidays | `EmployeeOverview` in `src/live/LiveHrisWorkspace.tsx`; `hris_get_my_dashboard_data` in the local tenant-membership migration; `tests/sql/isolated-auth/run-local.mjs`; `tests/browser/employee-leave.spec.ts` | Local Auth/RLS suite validates each synthetic employee receives their own linked profile/date. Browser suite exercises the displayed journey using mocked external data. |
| All four dashboard views fit at 375px | `tests/browser/employee-leave.spec.ts`; `docs/evidence/employee-dashboard-mobile-20261012.png` | Two-column tabs are all visible with no page/tab-strip horizontal overflow. |
| Private evidence leave request | `tests/browser/employee-leave.spec.ts`; isolated Auth/RLS suite | Browser journey covers focus/Escape, private proof upload, sticky footer clearance, submit and history refresh; local SQL/Auth/RLS covers tenant scope and storage policy. |

## Attendance Information — Phase 08

Figma frame `17:28320` was inspected. The live Attendance page uses the existing shared HRIS shell and tenant-scoped `hris_get_tenant_attendance_data` contract.

| Functionality | Evidence | Result and limits |
|---|---|---|
| `attendance.view` or `attendance.manage` receives detail rows; `reports.view`-only retains aggregate output | Separate `attendanceView`, `attendanceManage` and `attendanceReport` permissions in `src/live/LiveApp.tsx`; detail/aggregate selection in `src/live/LiveHrisWorkspace.tsx`; assertions in `tests/browser/attendance-information.spec.ts` and `tests/contracts/live-workspace.test.mjs` | Mock-backed browser check verifies both tenant IDs, both RPC modes and that detail mode does not render the deliberately distinct aggregate response. The current RPC does not supply `team_name` or employee photos, so the UI uses returned employee number and initials without inventing profile data. |
| Search, date range, status filtering and CSV export | `tests/browser/attendance-information.spec.ts` | Browser test verifies submitted search, date bound, status selection and retained status options after filtered server results, plus the downloaded report filename. |
| Mobile attendance table | `tests/browser/attendance-information.spec.ts`; `docs/evidence/attendance-information-desktop-20261012.png`; `docs/evidence/attendance-information-mobile-20261012.png` | At 375px the document does not overflow; the wide table is contained in a labeled, keyboard-focusable horizontal region. |
| Tenant changes and concurrent loads | `AttendanceReport` request sequence and `dataTenantId` guard in `src/live/LiveHrisWorkspace.tsx` | Stale RPC responses are ignored and rows from a prior tenant are hidden while new tenant data loads. |

## Verification

- `npm run check`: TypeScript PASS; contracts **26/26 PASS**; Vite build PASS with the existing 691.16 kB JavaScript chunk warning.
- `HRIS_TEST_PORT=4190 npm run test:e2e`: full Chromium **37/37 PASS, 0 failed**. A dedicated test port avoided an unrelated local TaxPay server already listening on port 4173. Browser tests use synthetic or mocked data, and external requests are blocked or explicitly mocked.
- Latest free local Auth/RLS suite: **44/44 PASS, 0 failed** on synthetic identities across two tenants. No production data or permissions changed. No SQL source was changed in the current Attendance UI slice.
- `git diff --check`: PASS.

The five previous tenant-security cases remain PASS in the 44/44 local suite: cross-tenant attendance reads in both directions, cross-tenant dashboard/attendance/leave RPC calls, and cross-tenant leave and attendance approvals.

## Canonical story linkage

The owner identifies the recovered catalogue as **1,047 stories / 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The mounted Project `sources/` directory is empty and connected Drive filename/hash searches did not return the catalogue. The repository copy remains an empty tracking skeleton (0 rows; SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`).

There are **0/1,047 canonical story IDs mapped or accepted; 1,047 unmapped**. These pages have concrete local/browser acceptance evidence but cannot receive canonical story credit until the expected-hash catalogue is available. Do not synthesize IDs, requirements or criteria.

## Release state

Checkpoint only; not for release. No production mutation, paid Supabase service, GitHub push, final source archive or deployment occurred. Final sequence remains: complete and verify the product; archive to the verified owner Drive folder and verify integrity; then push the exact archive source to GitHub; then deploy.
