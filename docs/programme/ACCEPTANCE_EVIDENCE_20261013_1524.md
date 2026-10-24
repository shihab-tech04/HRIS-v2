# Acceptance Evidence — 2026-10-13 15:24 Asia/Dhaka

## Phase 11: project task peer-review eligibility

Implementation commit: `cbf727b1fa39b66c5267ac0bbc389f12f3867916`.

The existing Phase 11 migration, RLS, RPCs, and responsive UI were exercised against a disposable local Supabase stack. The added staggered-assignment fixture starts three members at different times: the first and second overlap; the third joins only after the second has been released. The test verifies that:

- Releasing the second member creates the first member's review obligation.
- Completing the task creates the reciprocal review between the first and second members, plus reciprocal reviews between the first and third.
- No review row exists between the second and third members because their assignment intervals did not overlap.
- The third member sees only their eligible review and cannot submit a review assigned to the second member (`42501`).
- Existing tests continue to verify self-review prohibition, tenant isolation, duplicate prevention, authorized submission, 0–5 scoring, separate Not Observed values, performance-history visibility, and non-blocking completion/release.

## Verification results

- Isolated local Auth/PostgreSQL and browser acceptance: **133 pass, 0 fail**.
- Focused Phase 11 contract tests: **4 pass, 0 fail**.
- `node --check` on both changed test runners: **pass**.
- `git diff --check`: **pass**.
- Responsive journey: 375px mobile task creation, member release, completion, peer-review submission, and 1280px performance-history view; refresh reads persisted task/review state from local Postgres.

The full isolated suite also exercises the prior tenant-security cases. All test identities and records are synthetic and local. No production data, permissions, Auth records, paid service, GitHub remote, or deployment was changed.
