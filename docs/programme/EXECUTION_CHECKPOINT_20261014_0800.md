# Execution Checkpoint — 2026-10-14 08:00 Asia/Dhaka

## Position

- Main HRIS commit: `fb9614e` — `feat(recruitment): add tenant-scoped stage transitions`.
- Candidate commit: `bfd39e7` — `fix(candidate): stabilize interview refresh in auth restore`.
- Workstream: Phase 06 recruiter stage transitions and Candidate stage-history continuity; verified alongside the existing Phase 10/11 task and peer-review journeys.
- Status: local implementation and acceptance complete for this batch. No GitHub push, production mutation, paid-service activation, or deployment.

## Functional result

Recruitment managers with an active tenant `recruitment.manage` membership can move an application into `under_review`, `screening`, or `rejected` through a tenant-scoped, row-locked RPC. The RPC rejects inactive/cross-tenant applications, unauthorized viewers/candidates, invalid or regressive transitions, and direct table writes; retries are idempotent. Candidate-facing history receives persisted stage events without recruiter notes or actor identity. The existing Main recruitment pipeline now exposes the permitted actions, rejection confirmation/cancellation, loading/error/success states, and refresh recovery at mobile and desktop widths.

Candidate integration exposed and fixed an interview-page refresh race: duplicate Auth events for the same user ID no longer restart loading, and stale requests cannot replace newer data. Its disposable integration fixture now models the already documented owner-scoped saved-jobs fields queried by shared navigation; this is a test-fixture correction, not a production schema change.

## Changed files

Main HRIS (`fb9614e`):

- `src/live/LiveHrisWorkspace.tsx`
- `src/live/RecruitmentPipeline.tsx`
- `supabase/migrations/20261014012249_recruiter_application_stage_transition.sql`
- `tests/contracts/recruitment-pipeline.test.mjs`
- `tests/contracts/recruitment-stage-transition.test.mjs`
- `tests/sql/isolated-auth/fixture.sql`
- `tests/sql/isolated-auth/run-local.mjs`
- `tests/sql/isolated-auth/run-recruitment-browser.mjs`

Candidate (`bfd39e7`):

- `src/pages/InterviewsPage.tsx`
- `tests/candidate-application-local-e2e.mjs`
- `tests/candidate-application-local-fixture.sql`

## Acceptance evidence

- Main `npm run check`: TypeScript PASS, **124/124 contracts PASS**, Vite build PASS (existing large-bundle advisory).
- Focused Main recruitment contracts: **5/5 PASS**.
- Main fresh disposable local Auth/Postgres/RLS/browser suite: **208/208 PASS**, including all five previously called-out tenant-security cases, Phase 10 project-manager boundaries, overlap eligibility, review uniqueness/Not Observed, and persisted task-to-review mobile/desktop journeys.
- Candidate fresh disposable Auth/Postgres/browser integration: **140/140 PASS**; application submission, recruiter review/screening history, assessments, interviews, offers, preboarding, tenant boundaries, refresh recovery, and mobile/desktop states.
- Candidate `npm run test:routes`: **20/20 PASS**; TypeScript and Vite build PASS (existing config-loader and bundle-size advisories).
- No canonical story IDs are marked accepted by this checkpoint; these results are technical acceptance evidence and do not infer story-to-test mappings.

The Candidate stack was isolated under `/private/tmp/synesis-candidate-c1-auth-stage-fresh`. Realtime was excluded because its local health check timed out under Colima resource pressure; Auth, PostgreSQL, REST, Storage, and the browser journey were retained. Older local Auth entries and stacks were left untouched.

## Remaining gates

The overall product remains incomplete. The canonical 1,047-story acceptance mapping, unresolved employee-conversion and manager-approval policies, complete visual review, final Drive backup/readback, GitHub push, and deployment remain open. Continue with the next complete, independently executable business journey; preserve the Phase 10/11 task and peer-review work.
