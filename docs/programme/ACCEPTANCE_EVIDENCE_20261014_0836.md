# Acceptance evidence — Candidate job-alert workflow — 2026-10-14 08:36 Asia/Dhaka

Run against the disposable Candidate Supabase Auth/Postgres stack with synthetic Candidate A/B identities and a local browser. Production access was read-only for confirming the existing table, RLS and trigger contracts.

## Verified outcomes

- Candidate A created an alert with keywords, department, location, workplace and employment filters; the row persisted with `frequency='Instant'` and `is_active=true`.
- Candidate B could not read or create an alert for Candidate A. Anonymous reads were denied. A non-Instant frequency failed the local database constraint.
- A same-tenant active profile and a published job satisfying all configured filters generated the verified `job_alert_match` notification shape. A repeated update did not duplicate the notice.
- Candidate B could neither read nor mark Candidate A's notification read. Anonymous reads were denied.
- An aborted alert save retained the form and displayed a retry state; a subsequent save succeeded. An aborted notification read also displayed a retry state.
- Marking the matching notification read persisted in Postgres. Opening it navigated to the vacancy details page.
- Existing saved-job, application, assessment, interview and preboarding regression journeys remained green in the same local run.
- Mobile 375px/desktop 1280px journeys remained part of the integrated acceptance coverage.

## Results

- Local Auth/Postgres/browser: **171 assertions passed, 0 failed**.
- Candidate route tests: **20 passed, 0 failed**.
- TypeScript, Vite build, test syntax and whitespace checks: passed.
- Four additional Bun-based static test files were not executable through Node because Bun is unavailable; no product assertion was run in those files.

The notice is an in-app notification from the existing trigger. Email delivery is not part of this acceptance result.
