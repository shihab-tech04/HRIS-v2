# Execution Checkpoint — Project Task Maintenance

**Recorded:** 2026-10-14 04:50 Asia/Dhaka  
**Working branch:** `codex/recovery-checkpoint-20261012`  
**Previous local checkpoint:** `6508d12347c15bfb67480af67daf094caf2db01a`  
**Release state:** Incomplete. No GitHub push or deployment.

## Functional batch

Continued Phase 11 from the verified Phase 16 checkpoint. Project Managers can now edit task title, description and due date before completion. The update is persisted through an active-tenant, appointed-Project-Manager RPC. Completed tasks are read-only. Existing task membership, overlap-based review obligations, review submission and notification behavior remain intact.

The save journey is resilient: a failed request keeps the entered values available for retry; a successful save refreshes from Postgres; Cancel exits without writing. The live UI was exercised at 375px and 1280px.

## Files changed

- `supabase/migrations/20261013224251_hris_project_task_edit_workflow.sql` — timestamp field and guarded update RPC.
- `src/live/ProjectTaskManager.tsx` — edit form, save/cancel, retry and refresh behavior.
- `tests/sql/isolated-auth/run-local.mjs` — tenant, role, validation, persistence, immutability and end-to-end database assertions.
- `tests/sql/isolated-auth/run-project-browser.mjs` — real local Auth/RPC UI outage-retry flow and responsive checks.
- `tests/contracts/project-task-peer-review.test.mjs` — feature and security contract checks.
- `docs/programme/MASTER_PHASE_LEDGER.md` — phase evidence update.
- `docs/programme/ACCEPTANCE_EVIDENCE_20261014_0450.md` — test evidence and scope.

## Test results

- `npm run check`: TypeScript PASS; **108/108** contracts PASS; Vite build PASS (existing bundle-size advisory).
- Full dedicated local Auth/Postgres/RLS/browser acceptance: **199/199 PASS**.
- This includes PM-only task editing, denial of ordinary Admin and cross-tenant writes, past-date validation without partial persistence, completed-task immutability, successful retry after an injected outage, refresh persistence, project review regressions, and mobile/desktop journeys.

## Safety and next step

- The prior local Supabase stack had a schema leftover from an interrupted run. Only `/private/tmp/synesis-local-hris-test` was reset, then the complete local suite passed from a clean disposable database. The test harness verified ports 55421/55422.
- The older local SynesisUX Auth runtime and its existing `@hris.test` entries remain untouched.
- No production data/permission/schema, paid service, GitHub branch, or deployment was changed.
- Continue the next independently executable functional batch in the 22-phase ledger; preserve all current passing journeys and avoid policy-gated payroll, expense-decision, and service-resolution rules.
- Final release remains gated on canonical story mapping, all required journey acceptance, and a final Drive archive/readback before GitHub push and deployment.
