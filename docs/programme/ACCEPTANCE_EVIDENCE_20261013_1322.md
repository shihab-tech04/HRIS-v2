# Acceptance evidence — Phase 6 HRIS recruitment pipeline — 2026-10-13 13:22 Asia/Dhaka

## Delivered journey

Recruitment-authorized tenant members can open the Candidate pipeline in the active HRIS workspace, search by candidate/job/stage, filter by stage, page through results, inspect candidate-visible milestones, refresh, and export the current page. It is read-only; no application status transition or recruiter note is written.

The tenant-scoped `hris_get_recruitment_pipeline` RPC requires a live Auth session, active tenant, active membership, and `recruitment.view` or `recruitment.manage`. Its payload includes only candidate name, job reference/title, stage, applied timestamp, and candidate-visible milestone stage/time. It excludes contact details, CV/cover-letter references, application answers, private notes, reviewer identities, and panel evaluations. Direct reads of application tables remain denied to authenticated and anonymous callers.

## Exact source changes

- Added `supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql` for the sanitized tenant-scoped RPC, explicit search path, and restricted grants.
- Added `src/live/RecruitmentPipeline.tsx` with tenant RPC loading, search/stage filters, pagination, current-page CSV, milestone disclosure, and loading/error/retry/empty states.
- Updated `src/live/LiveApp.tsx` to resolve recruitment permissions from active membership checks and admit recruitment-only users to the HRIS workspace without triggering unrelated employee-directory reads.
- Updated `src/live/LiveHrisWorkspace.tsx` to mount the Candidate pipeline from the actual application shell and navigation.
- Added `tests/sql/isolated-auth/recruitment-fixture.sql` and `tests/sql/isolated-auth/run-recruitment-browser.mjs`; extended `tests/sql/isolated-auth/run-local.mjs` with synthetic tenants, roles, candidate records, confidentiality checks, and Auth/RLS cases. The disposable fixture now resets only its three synthetic recruitment tables before each run.
- Added `tests/contracts/recruitment-pipeline.test.mjs` and updated the workspace contract in `tests/contracts/phase1.test.mjs` for recruitment-only access.

## Verification evidence

- Disposable local Supabase Auth/Postgres integration: **124/124 PASS, 0 FAIL**. Includes tenant A/B separation, active-membership/permission checks, global-role-only/no-permission/anon denials, denied direct application reads, sanitization, pagination, search and stage filtering.
- Real Auth-to-Postgres browser journey: **PASS** at 375px and 1280px, including candidate-visible milestones, sensitive-content absence, search, stage filter, refresh, and overflow checks.
- Chromium regression suite: **50/50 PASS**.
- Contract suite: **66/66 PASS**.
- TypeScript check and Vite production build: **PASS**. Vite emitted its existing large JavaScript chunk advisory; build completed successfully.
- Runner syntax checks and `git diff --check`: **PASS**.

## Catalogue traceability and policy boundary

This implementation maps to the Phase 6 recruitment/candidate-pipeline functional area. No canonical story IDs are asserted in this evidence because the local project mirror has an empty `sources/` directory and its only `docs/programme/CANONICAL_USER_STORY_MATRIX.json` is an empty tracking skeleton (actual SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`); a focused Drive search for the exact filename returned no file. This does not replace the user-provided canonical source hash `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. No requirement text or story IDs were reconstructed. Product acceptance here is based on the actual SQL and browser evidence above; story-ID mapping remains pending access to the full source bytes.

Candidate status-change permissions and transition policy are not specified by the verified contract, so this batch intentionally provides no write action. Continue other independently specified journeys while that policy remains open.

No production data, production permissions, paid services, GitHub push, or deployment were used.
