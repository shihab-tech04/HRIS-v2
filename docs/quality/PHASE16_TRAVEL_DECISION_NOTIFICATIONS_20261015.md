# Phase 16 — Travel decision notifications

Date: 2026-10-15
Repository: `shihab-tech04/HRIS-v2`
Parent checkpoint: `7da9dcb987617a0b9ed34800a28d7e9012af50db` (`fix: complete employee contact editing acceptance`)

## Delivered in this checkpoint

- Persisted approved/rejected notifications transactionally from the existing travel status-history event, with composite tenant-bound foreign keys and one notification per decision event.
- Added owner-only notification reads and a tenant-scoped projection containing only the request destination and dates. The feed does not expose reviewer notes, travel purpose, or costs and does not add read/unread behavior.
- Merged travel outcomes into the existing keyset-paged notification feed while preserving project-review unread semantics and adding no changes to travel decision permissions or status transitions.
- Added localized English/Bengali decision cards. The notification passes its request ID to My Travel, where the matching owner-scoped request is brought into view and its existing status history is expanded. If that request is absent from the refreshed employee history, a localized recovery message appears.
- Extended the isolated Auth/Postgres runner for notification ownership, tenant privacy, duplicate prevention, history linkage, and anonymous/direct-read denial; extended its browser journey to assert the specific request and expanded approval history, alongside retry, refresh, language, and responsive checks.
- Fixed the Managerial Dashboard export test's ambiguous button selection by scoping it to the dashboard action group. Browser screenshots from this run were written under `/private/tmp/hris-dashboard-acceptance-20261015`, leaving tracked evidence untouched.

## Source changes

- `supabase/migrations/20261015022305_hris_travel_decision_notifications.sql`
- `src/live/LiveHrisWorkspace.tsx`
- `src/live/ProjectNotifications.tsx`
- `src/live/project-locale.ts`
- `tests/contracts/travel-decision-notifications.test.mjs`
- `tests/browser/managerial-dashboard.spec.ts`
- `tests/sql/isolated-auth/run-local.mjs`
- `tests/sql/isolated-auth/run-travel-browser.mjs`

The Phase 05 contact-editing source was not changed. No production data, permissions, GitHub `main`, or deployment was touched.

## Verification evidence

| Check | Result | Scope |
|---|---:|---|
| `npm run check` | PASS — 159/159 contract tests; TypeScript and Vite build passed | Full existing contract suite and production build; not a database integration certification |
| Focused travel contracts | PASS — 7/7 | Notification, existing travel locale, and exact-request history handoff contracts |
| Managerial Dashboard Playwright | PASS — 2/2 | Desktop and 375 px mobile browser regression with the existing synthetic test setup |
| Phase 16 isolated Auth/Postgres/browser runner | BLOCKED — not executed | The separately approved disposable Colima profile has no Lima VM; Docker socket and local PostgreSQL alternatives are unavailable. No repeated VM rebuild was attempted. |
| `git diff --check` | PASS | Whitespace/conflict-marker check before commit |

The planned SQL/RLS/Auth assertions are present in `tests/sql/isolated-auth/run-local.mjs`, but their presence is not evidence of a runtime pass. Notification persistence, server-side RLS, real Auth ownership, and the integrated browser journey remain unaccepted until run against an isolated database. The known local-runtime evidence and root cause are recorded in `/private/tmp/HRIS-Phase05-local-acceptance-revalidation-20261015.md` and its diagnostic logs.

## Release state

This is a development checkpoint only. Do not deploy until the isolated Auth/Postgres/browser acceptance is completed and all remaining release requirements are satisfied.
