# Acceptance Evidence — Local Auth Recovery Integration

Date: 2026-10-13 21:49 Asia/Dhaka  
Branch: `codex/recovery-checkpoint-20261012`  
Implementation commit: `d459cd67f8cc5e671c1b4d0059ce8153d22ba01f`

## Delivered acceptance coverage

- The isolated Auth/RLS runner creates one fresh, randomized `@hris.test` account on the disposable local Supabase stack and refuses to proceed if that stack already contains Auth users.
- A real recovery request is sent through the local HRIS UI. The browser test retrieves the resulting message from local Mailpit, redeems the local Auth callback, validates short and mismatched password errors, saves a new password, signs out, and signs in with that password.
- The recovery flow is checked at mobile and desktop widths. The new account is only a local test fixture and is removed by the runner's cleanup.
- Recovery links/tokens and the synthetic email address are not printed in test output. The browser uses an isolated Vite port and does not use or reconfigure production Auth.
- No recovery UI or product runtime code changed; this closes the missing real-email integration acceptance gap for the existing flow.

## Source changes

- `tests/sql/isolated-auth/run-local.mjs` — fresh recovery fixture and end-to-end runner integration.
- `tests/sql/isolated-auth/run-password-recovery-browser.mjs` — real local Auth/Mailpit mobile-reset and desktop sign-in journey.
- `tests/contracts/auth-recovery-integration.test.mjs` — runner contract assertions.

## Verification

- `node tests/sql/isolated-auth/run-local.mjs` on the disposable local Supabase Auth/Postgres stack: **167 passed / 0 failed**.
- The run includes all five previously failing tenant-security checks, Phase 10 project authority denials, Phase 11 project/task peer-review overlap eligibility, self-review denial, Not Observed handling, nonblocking completion/release, and the real recovery email journey. All passed.
- `npm run check`: TypeScript pass; **89/89 contract tests pass / 0 fail**; Vite production build pass. The build retains the existing advisory large-chunk warning.
- `git diff --check`: pass.
- Local-only; no production database, Auth configuration, permission, or data was changed. No paid service was activated; no GitHub push or deployment occurred.

## Remaining gates

- This checkpoint does not complete overall product acceptance or the 1,047 canonical stories. No story was marked complete from this test run.
- Google Drive preservation remains versioned and must be verified independently of this local test evidence.
- Existing policy blockers for manager expense decisions and manager service-request resolution remain unresolved; no decision authority was inferred.
