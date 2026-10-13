# Acceptance Evidence — Peer-Review Notifications

**Recorded:** 2026-10-14 04:37 Asia/Dhaka  
**Repository:** Main HRIS, branch `codex/recovery-checkpoint-20261012`  
**Pre-change commit:** `7cc73e15ffb30090f33a0e1db042410fd893a6c6`  
**Scope:** Phase 16 in-app alerts connected to the approved Phase 10/11 project-task peer-review workflow.

## Implemented

- Added `hris_in_app_notifications`, tenant-bound to the recipient employee and peer-review obligation, with duplicate prevention and row-level security.
- Eligible notifications are created in the same transaction as an overlap-qualified review obligation. The notification trigger independently checks task state and assignment overlap.
- Existing pending eligible reviews receive a notification during migration backfill. Submitting a review marks only its matching alert as read.
- Added an authenticated RPC that returns only the current linked employee’s notifications, with a bounded cursor page and unread count.
- Added an employee Notifications page with retry, empty/loading/error states, older-notification paging, completed/pending status, and an Open review action that routes to My Projects.
- No email delivery, reminder cadence, reviewer anonymity, annual-score weighting, or compensation rule was added.

## Verification

`npm run check`:

- TypeScript: PASS.
- Contract suite: **107 passed, 0 failed**.
- Vite production build: PASS. Existing bundle-size advisory remains (main JavaScript chunk is over 500 kB).

Disposable local Supabase Auth/Postgres/RLS/browser suite:

- **198 passed, 0 failed**.
- Uses the dedicated local project `synesis-local-hris-test` on ports 55421/55422 and synthetic identities across two tenants.
- Notification checks cover active-tenant reviewer visibility, no notification for other tenant members, direct-table RLS scope, and read-state transition after review submission.
- Browser journey covers injected notification-service outage and retry, mobile notification display, Open review navigation, persisted review submission, a one-item unread-count reduction, and employee performance-history visibility at mobile and desktop widths.
- The same full suite retains the existing project-creation, appointed-Project-Manager, task release/completion, overlap eligibility, self-review denial, uniqueness, Not Observed, and tenant-isolation regressions.

## Limits and release state

- Phase 16 remains **PARTIAL**. This evidence certifies peer-review alerts only.
- Canonical story IDs were not mapped in this checkpoint because the recovered catalogue is not present in the local `sources/` mirror. No requirement text or IDs were inferred.
- Testing used the free isolated local stack. No hosted schema, Auth setting, production data, production permission, paid service, GitHub push, or deployment was changed.
- This feature is a local implementation checkpoint; final preservation and publication gates remain open.
