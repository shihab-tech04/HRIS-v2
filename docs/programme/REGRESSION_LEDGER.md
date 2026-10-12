# Regression Ledger

**Checkpoint:** 2026-10-12 16:44 Asia/Dhaka.

| Area | Regression protection executed | Result | Limit |
|---|---|---|---|
| Main authenticated workspace | `npm run check`; TypeScript, **26/26** contract tests and Vite production build | PASS | Build emits the existing >500 kB chunk warning; local build is not deployment acceptance. |
| Employee dashboard UI and leave journey | `npm run test:e2e` full Chromium suite; mocked Auth/database/storage, external requests blocked | **36/36 PASS** | Employee path covers linked profile, tenant-local day, attendance, work hours/location, leave balance, leave type, holiday, mobile 2×2 tabs without horizontal overflow, private evidence upload, keyboard dismissal, submit and request history. Screenshots: `docs/evidence/employee-dashboard-desktop-20261012.png`, `docs/evidence/employee-dashboard-mobile-20261012.png`. UI is mock-backed and does not alone establish live backend behavior or formal Figma parity. |
| Tenant/Auth/RLS and leave evidence | `node tests/sql/isolated-auth/run-local.mjs`; real local Auth sessions, two synthetic tenants, storage API, RLS and RPC grants | **44/44 PASS** | Free local scratch database only; synthetic fixtures only; no production data/permissions changed. Includes tenant-scoped employee profile/date and the five previously failing tenant-security cases. Does not certify all 1,047 stories or every exposed table/function. |
| Approval SQL runtime | Same isolated command applies the exact staged SQL plus tenant release candidate; distinct managers test concurrency, audit/balance, rollback, partial attendance fields and no-row creation | PASS within **44/44** | No hosted database or browser journey; Supabase release approval remains outstanding. |
| Candidate public vacancy search | Candidate lint, four contract tests and public-only build | PASS | No live Supabase integration or real browser workflow. |
| Responsive/Figma parity | Employee and managerial desktop/mobile captures refreshed by the browser suite; mobile tabs and page overflow asserted at 375px. | PARTIAL | Current captures are local; no formal side-by-side comparison or Candidate/Super Admin Figma recovery. |
| Auth recovery email and cross-product role journeys | No email/password-recovery journey or full app browser role flow was executed. | NOT TESTED | Requires authorized test inbox and story-specific browser acceptance. |

Do not upgrade source-level contract results to end-to-end acceptance. Add new rows only with the exact command/journey, outcome and evidence path.
