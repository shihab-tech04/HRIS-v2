# Regression Ledger

**Checkpoint:** 2026-10-12.

| Area | Regression protection executed | Result | Limit |
|---|---|---|---|
| Main authenticated workspace | Main `npm run check`, including TypeScript, 24 contract tests and Vite production build | PASS | Source/build-level only; no authenticated browser or visual role journey. |
| Employee leave mobile UI | `npm run test:e2e -- --grep 'linked employee can complete'`; Chromium at 375×812, mocked Auth/database/storage; external requests blocked | PASS | Covers dialog focus/Escape, proof upload, scroll above sticky actions, submit/refresh, and horizontal overflow. Screenshot: `docs/evidence/employee-leave-mobile-20261012.png`. Mock-only; no real Auth or Figma parity claim. |
| Tenant/Auth/RLS and leave evidence | `node tests/sql/isolated-auth/run-local.mjs`; real local Auth sessions, two synthetic tenants, storage API, RLS and RPC grants | 42/42 PASS | Local scratch database only; no production change. Does not certify all 1,047 stories or every exposed table/function. |
| Approval SQL runtime | Same isolated command applies the exact staged SQL plus tenant release candidate; distinct managers test concurrency, audit/balance, rollback, partial attendance fields and no-row creation | PASS | No hosted database or browser journey; Supabase release approval remains outstanding. |
| Candidate public vacancy search | Candidate lint, four contract tests and public-only build | PASS | No live Supabase integration or real browser workflow. |
| Responsive/Figma parity | Earlier layout screenshots exist in source; no current full-page comparison was run here. | NOT ACCEPTED | No authenticated screenshots at required widths; no Candidate/Super Admin Figma recovery. |
| Auth recovery email and cross-product role journeys | No email/password-recovery journey or full app browser role flow was executed. | NOT TESTED | Requires authorized test inbox and story-specific browser acceptance. |

Do not upgrade source-level contract results to end-to-end acceptance. Add new rows only with the exact command/journey, outcome and evidence path.
