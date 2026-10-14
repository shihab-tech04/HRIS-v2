# Acceptance evidence — employee details and Phase 11 review policy

## Checkpoint

- Working branch: `codex/recovery-checkpoint-20261012`
- Base checkpoint: `24ef9557e9e34854ffc4b96351ff98645675647f`
- Feature commit: `b07db7d5134a27ddb4c8a5122b04814fa4f9f079`
- No migration, production data, hosted permissions, GitHub push, or deployment changed.

## Employee directory detail journey

The existing tenant-scoped directory RPC remains the sole data source. A user with the existing `employees.view` or `employees.manage` permission can open a read-only detail sheet containing only the fields already returned by that RPC: name, employee number, department, designation, team, and employment status. No new employee fields, direct table reads, or edit actions were added.

The detail sheet works from mobile cards and the desktop table. The local Auth/Postgres browser journey verified the displayed values, absence of private email/joining-date/gender data, Escape and close-button recovery with focus returned to the invoking action, and layouts at 375px and 1280px. Directory labels, status, and CSV headings follow the active English/Bengali locale.

## Project/task/peer-review security

The approved release/completion eligibility rule is enforced in the existing tenant-scoped RPCs and verified by the current isolated suite:

- On member release, every other member with an overlapping assignment receives a required review for the released member.
- On task completion, every overlapping pair receives reciprocal review obligations.
- Self-review and non-overlapping pairs are rejected; submission rechecks overlap server-side.
- Release and task completion persist while reviews are pending. Not Observed remains separate from a numeric 0–5 score.
- Tenant A/B, ordinary Admin/Manager, direct table access, duplicate submission, review history, and notifications were exercised against local Auth/Postgres.

## Test results

- `node --test tests/contracts/employee-directory.test.mjs tests/contracts/project-task-peer-review.test.mjs`: **14 passed, 0 failed**.
- `node tests/sql/isolated-auth/run-local.mjs`: **206 passed, 0 failed**. Correction: the 06:38 invocation did not set `HRIS_SUPABASE_TEST_WORKDIR`; it used the runner default `/private/tmp/synesis-local-hris-test` on ports 55421/55422, not the newly named disposable stack. Do not use that run as proof of the fresh-stack requirement. The complete fresh-stack result is recorded in `ACCEPTANCE_EVIDENCE_20261014_0650.md`. Previously populated local Auth services were left untouched.
- `npm run check`: TypeScript PASS; **117/117 contract tests PASS**; Vite production build PASS. Existing bundle-size advisory remains.
- `npm run test:e2e`: **50/50 Chromium tests PASS**. The first attempt was blocked by sandbox loopback binding (`EPERM`); the same suite passed after granting local-only preview-server access.
- Generated screenshots from the regression runner were restored; no unrelated screenshot evidence changed.

## Scope and traceability

- No SQL/RLS/Auth change was needed for directory detail; the feature reuses the permission-limited RPC contract.
- The canonical catalogue still has 1,047 source stories reported by the owner. This checkpoint does not map or claim any story IDs because source-linked acceptance rows were not verified.
- No production service was used, no paid service was activated, and nothing was pushed or deployed.
