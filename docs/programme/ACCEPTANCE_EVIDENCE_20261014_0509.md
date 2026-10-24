# Acceptance Evidence — Project Manager Task Portfolio

**Recorded:** 2026-10-14 05:09 Asia/Dhaka
**Repository:** Main HRIS, branch `codex/recovery-checkpoint-20261012`
**Previous checkpoint commit:** `c60abfe438914f15a357611727ab319d55a9af67`
**Scope:** PM task portfolio and handoff to the existing project task workflow.

## Implemented

- Added `hris_get_my_project_task_portfolio(uuid)`, which requires a live session, active requested tenant, and an employee linked to at least one project they lead.
- The server response includes only the linked PM's managed projects, their tasks, active/released task member names, task status, due date and pending-review counts. Scores, review comments and private review content are omitted.
- Ordinary Admin, ordinary Manager, non-PM project member, anonymous, missing employee, and cross-tenant access are denied by the server-side RPC authorization and session checks.
- Added the portfolio page using the existing project workspace, typography and surface patterns. It supports task/project/member search, task-state and Feedback Pending filters, summary counts, loading, error, retry, refresh, and empty states.
- The project workspace exposes the portfolio only when the signed-in employee manages a project. Each portfolio project links back to the existing task manager and returns focus to that project's heading.
- Task completion and outstanding feedback remain separate: the portfolio counts pending reviews without changing or gating task state.

## Verification

- `npm run check`: TypeScript PASS; **109 passed, 0 failed** contract tests; Vite build PASS (existing bundle-size advisory).
- Full Chromium regression suite: **50 passed, 0 failed**. Focused project workspace and employee leave dashboard journeys: **8 passed, 0 failed**.
- Disposable local Supabase Auth/Postgres/RLS/browser suite: **200 passed, 0 failed**.
- SQL acceptance positively verified PM portfolio access in both synthetic tenants. Tenant A's assigned PM saw exactly three led projects and the persisted task; Tenant B's assigned PM saw exactly two led projects and no tasks. A non-PM member, ordinary Admin, ordinary Manager, anonymous role and both cross-tenant directions were denied.
- The SQL acceptance verified `Feedback Pending` counts against persisted review rows and checked that the portfolio projection contains no peer-review scores or comments.
- The real Auth/Postgres browser acceptance created, edited and completed a task, confirmed feedback remained pending separately, retried an injected portfolio RPC failure, loaded persisted task data, filtered Feedback Pending, and returned to the task controls. The portfolio and return journey passed at **375px and 1280px** without horizontal page overflow.

## Test fixture correction

The first full Chromium run found two existing test harness mismatches, not application failures: the project test still triggered native browser dialogs after the UI had moved to accessible confirmation dialogs, and the employee dashboard fixture did not answer its monthly-attendance RPC. The tests were corrected to exercise the current interfaces. The focused pair then passed 8/8, followed by the full 50/50 rerun. The isolated local fixture also now removes its prior synthetic notification table before migration replay; the complete Auth/RLS/browser rerun passed 200/200.

## Limits

- Acceptance uses synthetic users/data in the disposable local Supabase environment. It does not certify hosted production configuration.
- No new canonical user-story IDs are marked complete; this evidence is feature/test evidence pending requirement-level story mapping.
- No production data, permissions, Auth records, paid service, GitHub push, or deployment changed.
