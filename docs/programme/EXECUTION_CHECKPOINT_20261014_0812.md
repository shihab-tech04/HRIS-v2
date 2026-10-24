# Synesis HRIS execution checkpoint — 2026-10-14 08:12 Asia/Dhaka

## Position

- Phase 06 Candidate integration: saved-jobs vertical journey is implemented and locally committed in Candidate.
- Candidate commit: `837308edaad754dc1efa17fb27da1103158d155b` (`feat(candidate): complete saved jobs journey`).
- Main code remains at `fb9614e56377ea8cb1fa52d4c527db017089dd87`; Main contains only this preservation-document update.
- Phase 10/11 project, task and overlapping-peer-review workflows remain intact at their prior verified checkpoint.
- Overall product state remains incomplete. No GitHub push, production mutation, paid-service activation, or deployment.

## Functional result

Authenticated candidates can save and remove published vacancies from the existing public jobs page. Saved state is owner-bound in Postgres and reloads from the account on refresh and in an independent browser context. The saved-jobs page supports details and application entry, handles vacancies that are no longer published, and provides retry recovery. Save/remove actions expose busy/pressed state and accessible status, and stale account responses do not overwrite the active account's UI.

The disposable test fixture defines the owner-bound fields and row policies used by the existing API contract. It is test-only; no production migration or schema was changed.

## Source changes in Candidate commit

- `src/pages/PublicJobsPage.tsx` — saving state, account-switch protection, accessible state and status messaging.
- `src/pages/VerifiedSavedJobsPage.tsx` — request sequencing, stale-account guards, retry/error/loading/empty/unpublished states, and per-item removal state.
- `tests/candidate-application-local-fixture.sql` — isolated owner/uniqueness/RLS fixture for saved jobs.
- `tests/candidate-application-local-e2e.mjs` — persisted UI journey, second-client and refresh recovery, duplicate/foreign/anonymous denials, error retry, navigation, remove, and responsive assertions.

## Verification

- Candidate isolated local Supabase Auth/Postgres/browser suite: **152 PASS, 0 FAIL**. Includes persisted saves, owner-only reads/writes, duplicate uniqueness rejection, anonymous denial, independent-context and refresh recovery, transient lookup failure/retry, Details/Apply navigation, successful removal, and mobile/desktop layout checks.
- Candidate `npm run test:routes`: **20 PASS, 0 FAIL**.
- Candidate TypeScript (`npm run lint`): PASS.
- Candidate Vite production build: PASS. Existing config-loader and large-chunk advisories remain.
- `node --check tests/candidate-application-local-e2e.mjs`: PASS; `git diff --check`: PASS before commit.
- Prior Main Phase 10/11 and tenant-security acceptance is preserved from the 08:00 checkpoint; this Candidate-only feature did not alter Main runtime code.

The browser journey used the disposable local stack at `/private/tmp/synesis-candidate-c1-auth-stage-fresh`; older local Auth entries and production were untouched. Realtime remained excluded from this local stack due to the previously recorded Colima resource-health issue.

## Story and release status

No canonical story IDs are claimed by this batch. The owner reports the full 1,047-story/153-module source and expected hash `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`; the current project mirror's read-only `sources/` directory has no file, and the local `stories:[]` tracking skeleton is not used as requirements. Story acceptance remains **0/1,047 mapped; 1,047 pending** until the canonical source bytes are available and mapped to observed evidence.

The product is not ready for final release. Continue the next complete business journey from the master phase ledger. Create and verify the final versioned Drive archive only after full acceptance, then perform the final GitHub push and deployment in that order.
