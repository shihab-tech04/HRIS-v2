# Phase 12 — Enrolled learning session access checkpoint

## Delivered

- An employee with an active enrollment can open the meeting link for their own scheduled session from My Learning.
- A tenant-scoped `SECURITY INVOKER` RPC returns links only for the signed-in employee's enrolled sessions. Anonymous execution is revoked. Pending approval requests and employees from another tenant receive no link.
- The link opens in a separate tab with a protocol allowlist and safe `rel` attributes. Link-read errors have a refresh recovery state.
- This journey does not record attendance, mark learning complete, issue certificates, or award skills.

## Acceptance evidence

- `npm run check`: TypeScript passed, contract tests **82/82 passed**, build passed. The existing main-chunk size advisory remains.
- Disposable local Supabase Auth/Postgres/RLS/browser suite: **151/151 passed**, including authorized employee access, anonymous denial, cross-tenant empty result, pending-request exclusion, simulated link-service outage/retry, and 375px/1280px views.
- Local Supabase security advisor: **no issues found**.
- Only synthetic local test records were used. No hosted schema, production data or permissions were changed.

This note records behavior-based acceptance evidence. It does not claim canonical story IDs or learning-completion policy approval.
