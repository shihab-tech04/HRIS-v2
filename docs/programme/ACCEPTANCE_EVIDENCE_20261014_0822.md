# Acceptance evidence — Candidate saved-jobs and details journey — 2026-10-14 08:22 Asia/Dhaka

This run used the Candidate browser app with disposable local Supabase Auth/Postgres and synthetic users. It did not use production accounts or data.

## Observed outcomes

- Saving a published vacancy from the listing persisted the authenticated candidate/job pair in Postgres.
- A duplicate pair failed with unique-constraint code `23505`.
- A second candidate could not read or create the first candidate's saved row; anonymous reads were denied.
- Save state survived route navigation, page refresh, and a separate browser context.
- Simulated saved-row lookup failure displayed recovery; retry restored the list without losing the row.
- Vacancy details correctly loaded the candidate's saved state. Removing and re-saving there updated both `aria-pressed` and the persisted database row.
- Simulated vacancy-details load failure displayed Retry; retry restored the details view and saved state.
- Details and Apply returned through the existing vacancy routes; removing from the saved list persisted deletion and showed the empty state.
- Mobile 375px and desktop 1280px saved-list views had no horizontal overflow.

## Results

- Local Auth/Postgres/browser assertions: **158 passed, 0 failed**.
- Candidate route tests: **20 passed, 0 failed**.
- TypeScript, build, syntax, and diff checks: passed.

These results validate this Candidate flow, not the full 1,047-story catalogue or final product release. No canonical story IDs were inferred.
