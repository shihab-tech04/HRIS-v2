# Synesis HRIS execution checkpoint — 2026-10-14 08:22 Asia/Dhaka

## Position

- Phase 06 — Candidate integration; saved-jobs journey extended through vacancy details.
- Candidate latest local commit: `98e415eae0b08da6c0a0094164134ace4e9f8a2a` (`fix(candidate): recover vacancy detail loading`), following `14185ba` and `837308e`.
- Main runtime code remains at `fb9614e`; Main changes in this checkpoint are programme records only.
- The product remains incomplete and not for release. No GitHub push, production mutation, paid-service activation, or deployment.

## Implemented journey

Candidates can save/remove published jobs on both the public listing and vacancy details page. The detail page loads and resets state when vacancy/account changes, ignores stale account responses, prevents duplicate toggles, exposes accessible busy/pressed/status state, and offers recovery for failed loads. The saved list persists across refresh and a second authenticated browser context, supports Details and Apply, recovers from transient errors, removes saved jobs, and shows an empty state. Owner isolation, uniqueness, and anonymous denial are exercised against disposable local Auth/Postgres.

No production schema, migration, or permission was changed.

## Candidate source changes

- `src/pages/PublicJobsPage.tsx`
- `src/pages/VerifiedSavedJobsPage.tsx`
- `src/pages/VerifiedJobDetails.tsx`
- `tests/candidate-application-local-fixture.sql`
- `tests/candidate-application-local-e2e.mjs`

The first saved-jobs commit changed four files (+230/−50); the details-flow commit added two files (+148/−58); retry recovery changed two files (+26/−4).

## Verification

- Candidate isolated Auth/Postgres/browser acceptance: **158 PASS, 0 FAIL**. Covers authenticated persisted save/remove from listing and details, saved state after refresh and a second browser context, uniqueness, cross-candidate and anonymous denial, failed lookup/load retry, Details/Apply navigation, and mobile/desktop overflow.
- Candidate route tests: **20 PASS, 0 FAIL**.
- Candidate TypeScript, production build, JavaScript syntax, and `git diff --check`: PASS. Vite emits existing config-loader and large-chunk advisories.
- Existing Phase 10/11 tenant and peer-review acceptance remains from the prior Main **208/208** local suite; this Candidate-only change did not alter Main runtime code.

The Candidate acceptance used the disposable local stack at `/private/tmp/synesis-candidate-c1-auth-stage-fresh`; older local Auth entries were untouched.

## Story and release status

The owner reports the recovered canonical catalogue as 1,047 stories across 153 modules with expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The project-root read-only `sources/` mount currently contains zero files, so the exact source bytes and hash are not locally verified. The local `stories:[]` file is only a tracking skeleton. Story mapping remains **0/1,047 accepted; 1,047 pending**; this Candidate evidence is not mapped to story IDs.

Continue the next complete, independently executable journey. Finish the product and acceptance before the final Drive backup, GitHub push, and deployment sequence.
