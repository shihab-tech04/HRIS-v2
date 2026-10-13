# Phase 12 — Learning approval checkpoint (2026-10-13 17:25 Asia/Dhaka)

## Delivered

- Added a tenant-scoped manager queue for pending employee learning requests, with approve/decline decisions and optional employee-facing notes.
- Managers enter the queue only through their active tenant membership's `learning.manage` permission. Ordinary managers, employees, global-only callers, anonymous users, and cross-tenant IDs are denied server-side.
- Approval locks the request and scheduled session, checks session capacity, and changes only a still-pending `employee_request`. Full or unavailable sessions leave requests pending. Duplicate decisions cannot overwrite a completed decision.
- The employee learning history returns the resolved status and note after refresh. Manager queue and employee actions use the existing shell, typography, spacing, and responsive patterns.

## Verification evidence

- Disposable local Auth/Postgres/RLS integration: **145/145 passed, 0 failed**. This includes tenant A/B authorization, manager/employee denial, approval, rejection, note persistence, duplicate-decision denial, and concurrent approvals for a one-seat session.
- Browser journey against the same local Auth/Postgres stack passed at 375px and 1280px: employee request, manager approval, and employee refresh confirmed the enrolled state and note. Existing employee learning enrollment/cancellation/retry journeys also passed.
- `npm run check`: TypeScript lint passed; contract tests **77/77 passed**; Vite production build passed.
- No hosted Supabase migration, production data or permission write, GitHub push, or deployment was performed.

## Remaining Phase 12 work

- Continue with the next usable learning journey: manager program/session administration and existing assigned-learning completion flow.
- The existing enrollment deadline field remains informational in this slice; enforcement policy is not specified. No deadline behavior was invented.
- Canonical story IDs were not added in this batch; implementation evidence is recorded here by workflow and test result.

The Vite build retains the existing advisory that the main JavaScript chunk exceeds 500 kB.
