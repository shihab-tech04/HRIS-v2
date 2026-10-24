# Acceptance Evidence — Project Task Maintenance

**Recorded:** 2026-10-14 04:50 Asia/Dhaka  
**Repository:** Main HRIS, branch `codex/recovery-checkpoint-20261012`  
**Previous checkpoint commit:** `6508d12347c15bfb67480af67daf094caf2db01a`  
**Scope:** PM edit and recovery flow for unfinished project tasks, preserving Phase 10/11 security and peer-review behavior.

## Implemented

- Added a tenant-scoped `hris_update_project_task` RPC. Only the appointed Project Manager can update an unfinished task; completed tasks are immutable.
- Added `updated_at`, backfilled from task creation time for existing records.
- Added task edit controls for title, description, and due date to the existing Project Manager task card. Saving refreshes the task from the database; failed saves retain the draft for retry; Cancel discards it.
- Existing task assignments and review obligations are not changed by editing task details.
- Date and field validation is enforced in SQL. Ordinary Admin, cross-tenant callers, past-date changes, and completed-task edits are denied.

## Source changes

- `supabase/migrations/20261013224251_hris_project_task_edit_workflow.sql`
- `src/live/ProjectTaskManager.tsx`
- `tests/sql/isolated-auth/run-local.mjs`
- `tests/sql/isolated-auth/run-project-browser.mjs`
- `tests/contracts/project-task-peer-review.test.mjs`
- `docs/programme/MASTER_PHASE_LEDGER.md`
- `docs/programme/ACCEPTANCE_EVIDENCE_20261014_0450.md`
- `docs/programme/EXECUTION_CHECKPOINT_20261014_0450.md`

## Verification

- `npm run check`: TypeScript PASS; contract tests **108 passed, 0 failed**; Vite build PASS (existing >500 kB chunk advisory).
- Disposable local Supabase Auth/Postgres/RLS/browser suite: **199 passed, 0 failed**.
- Local SQL checks persisted title, description, due date and `updated_at`; ordinary Admin and cross-tenant edits returned authorization errors; a past-date edit returned a validation error and did not overwrite the accepted values; completed-task edits were denied.
- Real mobile browser journey at 375px injected one edit-service outage, retained the draft, retried, refreshed the updated details from local Postgres, and continued into member assignment, task release/completion, peer-review submission and performance-history display. Desktop rendering at 1280px remained free of horizontal overflow.
- Existing tenant, role, overlap-eligibility, self-review, uniqueness, Not Observed, and notification regressions remained in the same full local suite.

## Release and mapping status

- Phase 11 remains **PARTIAL**; this acceptance covers task-detail maintenance only.
- Canonical story IDs are not mapped in this local mirror because the synced `sources/` catalogue is unavailable here. No story ID or requirement text was inferred.
- All test data was synthetic in the dedicated local stack. No hosted schema, production data/permissions, paid service, GitHub push, or deployment changed.
