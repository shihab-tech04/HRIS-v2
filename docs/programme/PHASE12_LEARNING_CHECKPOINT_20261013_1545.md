# Phase 12 Learning Self-Service Checkpoint — 2026-10-13 15:45 Asia/Dhaka

## Delivered

- Added the employee **My Learning** page to the existing personal workspace navigation.
- Added tenant-scoped program and scheduled-session browsing, session seat counts, target skills, and the linked employee's recorded skills.
- Employees can self-enroll only where `self_enrollment=true`, or submit an approval request where it is false.
- Enrollment/request history includes current, completed, rejected, and cancelled states returned by the existing contract. Employees can cancel only their own non-mandatory `requested` or `enrolled` rows.
- Learning catalog and enrollment reads use RLS plus authenticated RPCs. Direct table writes are revoked; every employee write verifies a live session and linked active employee in the requested tenant. Session seat checks serialize on the session row.
- The page includes loading/error/retry, validation via server errors, empty/search states, cancellation confirmation, refresh recovery, and responsive mobile/desktop layouts.

## Source changes

- `src/live/MyLearning.tsx`
- `src/live/LiveHrisWorkspace.tsx`
- `supabase/migrations/20261013153500_hris_learning_employee_self_service.sql`
- `tests/sql/isolated-auth/fixture.sql`
- `tests/sql/isolated-auth/run-local.mjs`
- `tests/sql/isolated-auth/run-learning-browser.mjs`
- `tests/contracts/learning-self-service.test.mjs`

## Acceptance evidence

- Isolated local Supabase Auth/Postgres/RLS suite: **141/141 passed, 0 failed**.
- Learning-specific checks covered two tenants, employee ownership, inactive program filtering, skill privacy, direct table-write denial, duplicate prevention, self-enrollment vs approval-request routing, cross-tenant session rejection, capacity rejection and concurrent one-seat enrollment, owner/mandatory cancellation restrictions, and persisted cancelled history.
- A real local Auth-to-Postgres browser run passed enrollment, approval request, cancellation, refresh recovery, search empty state, simulated load failure/retry, and mobile/desktop overflow checks.
- Contract tests: **74/74 passed, 0 failed**.
- TypeScript check passed. Vite production build passed; Vite reported its existing large JavaScript chunk advisory.
- No hosted Supabase migration, production data/permission write, GitHub push, or deployment was performed.

## Not complete yet

- This checkpoint covers employee self-service. The tenant-authorized manager approval/rejection journey and the broader program/session administration UI remain for the next vertical batch.
- Enrollment deadline enforcement remains unspecified by the approved requirements and is not invented here; the existing production RPC contract did not enforce it.
- No source-linked story IDs were reconstructed. The recovered 1,047-story catalogue still needs explicit row-to-evidence mapping against its verified source in the subsequent catalogue pass.

## Next batch

Build the tenant-authorized learning request decision journey (manager/admin queue → approve/reject with resolution note → employee status refresh), first confirming the existing permission and decision contracts. Keep approval separate from self-enrollment and preserve the existing membership-scoped tenant model.
