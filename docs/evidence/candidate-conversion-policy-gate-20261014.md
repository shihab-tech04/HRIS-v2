# Candidate conversion policy gate — 2026-10-14

## Change

Candidate preboarding remains reviewable, but the employee-conversion action is held until employee-status and role-mapping rules are approved. The new migration revokes the activation RPC from `PUBLIC`, `anon`, and `authenticated`; the existing server function is retained. Recruitment and onboarding views show a localized hold notice and no activation controls.

## Local verification

- Main contract suite: **143 passed, 0 failed**.
- Main TypeScript check: **passed** (`npm run lint`).
- Main production build: **passed** (`npm run build`); Vite emitted the existing large-chunk advisory.
- Candidate route/profile suite: **20 passed, 0 failed** (`npm run test:routes`).
- Candidate E2E syntax check: **passed** (`node --check tests/candidate-application-local-e2e.mjs`).
- Candidate Auth/PostgreSQL/browser acceptance: **blocked; 0 assertions executed**. The existing dedicated test stack contained Auth users, so the runner refused to modify it. Those users were left untouched. A new disposable local stack then failed its PostgreSQL health check and exited with `DbConnectError: ... password authentication failed for user "postgres" (SQLSTATE 28P01)`. Its logs showed `127.0.0.1:5432 - no response`; no E2E fixtures were created.

## Checkpoint

- Main local commit: `53e71ffc378e6a64714cd52eb1f32b17a4aa8fbf`.
- Candidate local commit: `0a90462ac48c2125f048cfbfebcee1c2455a17ec`.
- The commits have not been pushed. The last GitHub CLI push attempt failed DNS resolution for `github.com`; it will not be retried until network access changes.
- No production database, permissions, `main` branch, or deployment was changed.
