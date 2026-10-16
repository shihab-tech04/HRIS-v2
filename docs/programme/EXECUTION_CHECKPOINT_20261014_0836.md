# Synesis HRIS execution checkpoint — 2026-10-14 08:36 Asia/Dhaka

## Position

- Candidate Phase 06 — complete vertical job-alert and matching-notification journey, added after the verified saved-jobs workflow.
- Candidate commit: `92b4481d3500ef6a0e69af6096d1bb3db7531854` (`feat(candidate): complete live job alerts journey`).
- Main runtime is unchanged from the prior Phase 11 commit; Main repository changes in this checkpoint are acceptance/programme records only.
- The overall product remains incomplete and not for release. No GitHub push, production write, paid-service activation, or deployment occurred.

## Delivered workflow

The authenticated Candidate can create an instant job alert with a required name and optional keywords, department, location, workplace and employment filters; see and remove saved alerts; receive matching in-app notifications created by the existing database trigger; mark a notification read with persisted state; and navigate to the matched vacancy. Save failures retain form values and can be retried. Alert and notice reads provide a retry state. Owner isolation is enforced by the existing production RLS contract and exercised locally against separate Auth identities. Matching notices are in-app only; this batch does not claim email delivery.

The Candidate UI uses the current saved-jobs route and design patterns. The demo-only localStorage job-alert contract is unchanged. No production schema, data, trigger, or permissions were modified.

## Source changes and verification

Candidate files changed: `src/lib/api.ts`, `src/pages/VerifiedSavedJobsPage.tsx`, `tests/candidate-application-local-e2e.mjs`, and `tests/candidate-application-local-fixture.sql` (+580/−35).

- Isolated local Supabase Auth/Postgres/browser acceptance: **171 PASS, 0 FAIL**. This includes alert field persistence, candidate B/anonymous denials, invalid frequency rejection, production-shaped trigger matching and duplicate prevention, notification ownership, retry, persisted read state, vacancy navigation, and previous Candidate application/saved-job regressions.
- Candidate route suite: **20 PASS, 0 FAIL**.
- TypeScript, Vite production build, Node test syntax and `git diff --check`: PASS. Existing Vite config-loader and bundle-size advisories remain.
- A broad Node invocation ran 28 tests: 24 passed; four Bun-based `.test.ts` files could not start because Bun is not installed and Node rejected the `bun:` import scheme. This is a test-runner limitation, not a product assertion failure. The supported Candidate route suite and local integration suite passed.
- Two intermediate local E2E attempts stopped on test-harness issues (a mismatched assertion variable and then a route handoff expectation); both were corrected and the final run passed 171/171.

The production schema, RLS policy definitions, and `notify_matching_job_alerts()` function were read-only inspected through the connected Supabase project. The isolated SQL fixture mirrors the verified match semantics for disposable testing. No production rows, policies, migrations, or paid services were touched.

## Story and release status

Canonical story-level acceptance remains **0/1,047 accepted; 1,047 pending** until the exact recovered catalogue bytes and requirement IDs are available to the implementation workspace. No story IDs or acceptance criteria were invented. Continue the higher-priority Phase 10/11 project-task-peer-review workflow under the latest approved eligibility rule; retain all Candidate and Main passing functionality. Complete product acceptance first, then versioned Drive preservation, final GitHub push and deployment.
