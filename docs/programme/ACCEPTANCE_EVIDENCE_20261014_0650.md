# Acceptance Evidence — released collaborator peer-review journey

## Checkpoint

- Branch: `codex/recovery-checkpoint-20261012`
- Test-harness commit: `a51497312762fafbbcb9b6b8a449c2caec83a129`
- Base product checkpoint: `185a363cb17433e38692f8860ac82f4bb695fa52`
- No product UI, SQL migration, hosted schema, production data, permission, GitHub, or deployment change was made in this acceptance slice.

## Phase 10/11 task → peer-review journey

The approved overlap rule is verified in both the real browser flow and the isolated Auth/Postgres suite:

- A Project Manager can add and release task members; canceling release or completion leaves the task unchanged.
- Release creates a required review for each other task member with an overlapping assignment. Task completion creates reciprocal obligations for overlapping pairs. Self-review, non-overlapping assignments, duplicate obligations, and cross-tenant access are denied.
- A reviewer whose own assignment has been released can retrieve and submit an eligible review while the task is still open. The review remains linked to both task assignments. Completing the task afterward succeeds with the remaining reciprocal review tracked as `Feedback Pending`.
- The browser journey also completes the task with two reviews pending, then signs in as the released collaborator, recovers the inbox after a simulated outage, submits a review after task completion, clears the notification, and displays the saved review in performance history.
- Review entry uses four 0–5 criteria with separate Not Observed handling. Empty submission validation, retry, mobile and desktop layouts, task/release cancellation, persisted state, locale switching, and tenant isolation remain covered.
- Completing operational work and releasing members do not wait for feedback. Outstanding reviews remain visible separately.

### Fresh local Auth/Postgres evidence

The complete suite ran against the unique, free local Supabase stack at `/private/tmp/synesis-peer-review-isolated-20261014`, with API `127.0.0.1:58421` and Postgres `127.0.0.1:58422`, using Docker context `colima-hris-scratch`. Result: **206/206 PASS, 0 failed**. The run includes synthetic Auth sessions, Postgres persistence, tenant isolation, RLS, permission denials, and real browser-to-local-service journeys.

The first run on that stack reported 198/206 because the nested leave-browser runner still required port 55421 and a reverse-review fixture lookup omitted task identity. Both harness issues were fixed. The complete rerun passed 206/206. The older local Auth service and its entries were left untouched.

### Repository verification

- Focused contracts: **21/21 PASS**.
- `npm run check`: TypeScript PASS, **120/120 contracts PASS**, Vite production build PASS. Existing bundle-size advisory remains.
- Full Chromium regression suite: **50/50 PASS** at the previous checkpoint; it was not repeated here because this slice changed only test harnesses and contracts, not application UI.
- `git diff --check`: PASS.

## Changes in this slice

- `tests/sql/isolated-auth/run-local.mjs`: configurable loopback API/DB ports with safe defaults; verifies a released reviewer can submit before completion; scopes reverse-review lookup to the specific task.
- `tests/sql/isolated-auth/run-leave-evidence-browser.mjs`: accepts the configured isolated loopback API port while rejecting any host other than `127.0.0.1`.
- `tests/contracts/project-task-peer-review.test.mjs` and `tests/contracts/approval-resolution-migrations.test.mjs`: guard the new release-review and port-safety cases.

The user-recovered 1,047-story catalogue remains unmapped in this slice. No story IDs or acceptance counts are inferred. Reviewer anonymity and annual-score weighting remain unapproved policies; no anonymity guarantee or annual weighting was added. The existing performance-history browser screen displays the reviewer name, so that presentation remains an explicit policy question for a later approved decision.

No paid services were activated. No production data, Auth records, hosted permissions, GitHub, or deployments were changed.
