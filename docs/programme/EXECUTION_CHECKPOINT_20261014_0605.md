# Execution Checkpoint — 2026-10-14 06:05 Asia/Dhaka

## Position

- Current branch: `codex/recovery-checkpoint-20261012`.
- Starting commit for this batch: `160f31b282edf84906e56ace5a5ee195f90d9896`.
- Workstream: Phase 18 EN/BN behavior for the existing Phase 10/11 project → task → peer-review journey.
- Status: implementation verified locally; no push or deployment.

## Functional work

Connected the existing workspace language switch to the complete project/task/review experience. The locale persists in browser storage and updates the document language. Bengali labels now cover project navigation and allocations, task management and portfolio, task statuses and feedback-pending state, reviewer forms and validation, notifications, and task-linked performance history. The existing shell, routes, RPCs, schema, permissions, and business behavior were preserved.

The user-approved review policy remains unchanged: active overlapping task assignments determine peer eligibility; no self-review; four 0–5 criteria with Not Observed separate; release and task completion do not wait for feedback; outstanding review obligations stay independently visible as Feedback Pending; and every review remains linked to its task, assignment, and performance history.

## Verification

- `npm run check`: TypeScript PASS; contracts **114/114 PASS**; Vite build PASS (existing large-bundle advisory).
- `npm run test:e2e`: Chromium **50/50 PASS**.
- `node tests/sql/isolated-auth/run-local.mjs`: isolated Auth/Postgres/RLS/browser acceptance **206/206 PASS**. Real browser task create/edit/retry, release, completion, one review submission, remaining pending obligation, Bengali task UI, persisted locale, and performance history all passed.
- Production data, Auth entries, and permissions were not modified. No paid service, GitHub push, or deployment was used.

## Changed source and tests

- Source: `src/live/LiveHrisWorkspace.tsx`, `src/live/MyPerformance.tsx`, `src/live/MyProjectWork.tsx`, `src/live/MyProjects.tsx`, `src/live/OrganizationProjects.tsx`, `src/live/ProjectNotifications.tsx`, `src/live/ProjectTaskManager.tsx`, `src/live/ProjectTaskPortfolio.tsx`, and new `src/live/project-locale.ts`.
- Tests: `tests/browser/project-workspace.spec.ts`, `tests/contracts/live-workspace.test.mjs`, `tests/contracts/performance-management.test.mjs`, `tests/contracts/project-task-peer-review.test.mjs`, and `tests/sql/isolated-auth/run-project-browser.mjs`.

## Remaining release gates

Overall program remains incomplete. This checkpoint does not certify all 22 phases or map stories to the owner-recovered 1,047-story canonical catalogue. Hosted schema/permission acceptance, remaining workflow policy decisions, full visual review, final source backup and readback, GitHub publication, and deployment are not complete. Continue the next independently executable vertical business batch from the master ledger.
