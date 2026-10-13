# Acceptance checkpoint — Project → Task → Peer Review — 2026-10-13 12:40 Asia/Dhaka

## Verified journey

From the existing Phase 11 local checkpoint (`ecb875d`), the isolated project/task/peer-review acceptance ran against disposable local Supabase Auth, Postgres, and the actual Vite application. The final run passed **112/112 checks, 0 failed**.

- Project creation and PM appointment remain Super Admin only; ordinary Admin and Manager attempts are denied.
- Assigned PM task creation, member assignment/release, and completion persist through tenant-scoped RPCs. Release and completion proceed while reviews remain pending.
- Review obligations follow overlapping task assignments, exclude self-review, enforce tenant and submission eligibility, support 0–5 criteria and separate Not Observed values, and persist into employee performance history.
- The real browser journey used 375×812 viewports for the PM project/task journey and peer-review submission, then verified performance history and 375px overflow. The database confirmed a completed task, two review obligations, one submitted review, one still pending, and Not Observed with no numeric quality score.
- Existing organizational-team membership remained intact while employees held concurrent project allocations.

## Change in this checkpoint

Only the repeatable isolated browser acceptance harness changed in this checkpoint:

- `tests/sql/isolated-auth/run-project-browser.mjs` now follows the existing mobile menu entry point and checks horizontal overflow throughout the mobile task and reviewer journeys.
- `tests/sql/isolated-auth/run-local.mjs` now matches the updated mobile-journey success message.

No product route, database migration, authorization contract, production data, or Auth record changed in this test-harness checkpoint. Both runner files pass `node --check`; `git diff --check` passes. The final 112/112 run includes the Auth/RLS and database-backed browser journey.

## Traceability and release state

The reported authoritative catalogue contains 1,047 stories / 153 modules and has expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The canonical bytes are not available in this task's mounted sources, so **0/1,047 are accepted against source-linked story text**. This is not a count of implemented product functionality; no story requirements were reconstructed.

No hosted Supabase changes, paid services, GitHub push, or deployment occurred. Next functional batch follows Phase 11's existing next-sequence item: continue the employee/reviewer appraisal journey using verified schema and role rules; keep score writes disabled until authoritative scoring rules are available.
