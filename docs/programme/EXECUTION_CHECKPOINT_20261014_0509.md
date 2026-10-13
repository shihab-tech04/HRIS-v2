# Execution Checkpoint — Project Manager Task Portfolio

**Recorded:** 2026-10-14 05:09 Asia/Dhaka
**Working branch:** `codex/recovery-checkpoint-20261012`
**Previous local checkpoint:** `c60abfe438914f15a357611727ab319d55a9af67`
**Release state:** Incomplete. No GitHub push or deployment.

## Functional batch

Continued Phase 11/16 with a Project Manager task portfolio across projects the active employee is appointed to lead. The portfolio uses an authenticated tenant RPC; it does not expose peer-review scores or comments. Project Managers can search tasks and members, filter by task status or Feedback Pending, see status and outstanding review totals, refresh, retry, and open the existing project task controls.

The existing project and task screens remain in place. The portfolio action appears only when the current workspace includes a project the signed-in employee can manage. Returning from a task card scrolls and focuses that project's existing heading and task manager.

## Source changes

- `supabase/migrations/20261013225608_hris_project_manager_task_portfolio.sql` — authenticated, active-tenant, assigned-Project-Manager RPC; returns only projects led by the linked employee and excludes review score/comment fields.
- `src/live/ProjectTaskPortfolio.tsx` — responsive, searchable/filterable portfolio, summary counts, error/retry/refresh/empty/loading states and project handoff.
- `src/live/OrganizationProjects.tsx` — conditional portfolio navigation and focus/scroll return to existing task controls.
- `tests/sql/isolated-auth/run-local.mjs` — positive PM access in Tenant A and Tenant B; denies ordinary Admin, non-PM project member, and both directions of cross-tenant access; checks task membership and pending-review totals.
- `tests/sql/isolated-auth/run-project-browser.mjs` — real local Auth/Postgres journey injects one portfolio read outage, retries, verifies persisted completed-task data and pending reviews, filters, opens project tasks, and checks 375px/1280px layouts.
- `tests/sql/isolated-auth/fixture.sql` — resets the existing synthetic notification table in the disposable stack between runs.
- `tests/contracts/project-task-peer-review.test.mjs` — SQL authorization, safe projection, grants, UI and runner contracts.
- `tests/browser/project-workspace.spec.ts` — aligns release/completion test actions with the existing accessible confirmation dialogs.
- `tests/browser/employee-leave.spec.ts` — supplies the existing monthly-attendance RPC fixture used by the employee dashboard browser journey.
- Full browser regression execution refreshed 13 existing desktop/mobile evidence captures under `docs/evidence/` and `docs/phase-1/screenshots/`.
- `docs/programme/MASTER_PHASE_LEDGER.md` — updates Phase 11, 16, 17 and 19 evidence.

## Verification

- `npm run check`: TypeScript PASS; **109/109** contract tests PASS; Vite build PASS (existing bundle-size advisory).
- `HRIS_TEST_PORT=48376 npm run test:e2e`: **50/50** Chromium tests PASS. The first full run exposed two stale test fixtures: one expected native confirmation dialogs instead of the existing accessible confirmation UI; the other did not mock the monthly attendance RPC. Both were corrected at the test source, and the complete rerun passed.
- `node tests/sql/isolated-auth/run-local.mjs`: **200/200** PASS using synthetic users and two tenants in the disposable local Supabase Auth/Postgres stack. Includes the actual task portfolio RPC, role/tenant denials, task/review persistence, and mobile/desktop browser journey. The runner reset its own local fixture; production was not contacted.
- Focused confirmation and attendance browser tests: **8/8** PASS.
- The task UI journey’s portfolio retry read persisted task data from local Postgres, showed Feedback Pending separately from task completion, and returned to the existing project task controls.

## Safety, acceptance and next step

- The first Auth/RLS attempt found an old synthetic `hris_in_app_notifications` table left by the isolated test fixture. The fixture now drops that table before replaying migrations; the final isolated suite passed.
- The five previously failing tenant-security regression cases remain passing in the full 200/200 suite.
- No production data, permissions, Auth entries, paid Supabase service, hosted database, GitHub branch, or deployment was changed.
- No canonical story IDs are newly claimed by this batch. The 1,047-story count remains subject to mapping each canonical requirement to observed acceptance evidence; no requirements or story IDs were inferred.
- Continue the next complete executable HRIS journey while preserving the task/review, project permissions, notification and responsive regression coverage. Final Drive backup verification still precedes any GitHub push or deployment.
