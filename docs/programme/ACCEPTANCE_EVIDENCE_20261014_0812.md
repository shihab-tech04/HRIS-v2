# Acceptance evidence — Candidate saved-jobs journey — 2026-10-14 08:12 Asia/Dhaka

The saved-jobs journey was exercised in the disposable local Supabase Auth/Postgres environment through the Candidate browser application. No hosted database, production account, paid service, or real candidate data was used.

## Passed behavior

- Candidate A saves a published vacancy from the public list; the UI reports the save and Postgres contains the owner/job pair with a persisted timestamp.
- A second insert of the same owner/job pair is rejected by the database unique constraint (`23505`).
- Candidate B cannot read or create Candidate A's saved-job row; anonymous access is denied.
- The saved vacancy returns after route navigation, page refresh, and a separate authenticated browser context.
- A transient saved-job lookup failure is surfaced; Retry recovers the list and leaves the saved row intact.
- Details and Apply open from the saved list and return to the vacancy journey.
- Remove deletes the persisted owner/job row and returns the empty state.
- Saved-job controls expose accessible names, `aria-pressed`, and busy state; save success is announced through a live status.
- Mobile (375px) and desktop (1280px) saved-list views do not overflow horizontally.

## Test results

- Disposable Supabase Auth/Postgres/browser acceptance: **152 passed, 0 failed**.
- Candidate route tests: **20 passed, 0 failed**.
- TypeScript, Vite build, syntax check, and `git diff --check`: passed.

The authorization checks ran against the isolated SQL fixture for the existing `candidate_saved_jobs` API contract. This batch adds no production schema or policy migration. These results are implementation evidence only; no canonical story ID is asserted or accepted.
