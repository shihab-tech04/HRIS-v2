# Acceptance evidence — Phase 6 recruitment-only authorization — 2026-10-13 13:30 Asia/Dhaka

## Security acceptance added after the 13:22 feature checkpoint

The local Auth/RLS fixture now includes a recruiter-only tenant role with exactly `recruitment.view`. A real local Auth browser session with that role reaches the Candidate pipeline at 375px and 1280px. It receives no candidate from another tenant, does not render candidate contact/file/application-answer/private-note fields, and does not query the employee directory or departments. Deactivating this membership causes `hris_get_recruitment_pipeline` to return SQLSTATE `42501`; the fixture restores the membership before continuing the remaining test cases.

The broader Phase 6 UI and sanitized RPC implementation remains as described in `ACCEPTANCE_EVIDENCE_20261013_1322.md`. Recruitment remains read-only because the existing verified contract does not specify status transitions.

## Files changed in this security follow-up

- `tests/sql/isolated-auth/fixture.sql`: adds a synthetic recruiter-only role and active membership with only `recruitment.view`.
- `tests/sql/isolated-auth/run-local.mjs`: authenticates the recruiter fixture, proves inactive-membership revocation, and runs the pipeline browser journey as that constrained user.
- `tests/sql/isolated-auth/run-recruitment-browser.mjs`: confirms the recruiter-only page does not request employee-directory or department data.
- `tests/contracts/recruitment-pipeline.test.mjs`: requires the inactive-membership denial assertion.

## Verification

- Disposable local Supabase Auth/RLS/Postgres: **125/125 PASS, 0 FAIL**.
- Real recruiter-only Auth-to-Postgres journey: **PASS** at 375px and 1280px.
- Contract suite: **66/66 PASS**.
- Chromium regression: **50/50 PASS** on the unchanged application code from the 13:22 feature checkpoint.
- TypeScript and Vite build: **PASS** on that same application code.
- Runner syntax and SQL fixture checks: **PASS**.

No production Auth rows, permissions, or data were touched. No paid services, GitHub push, or deployment were used.

## Catalogue traceability

This validates the Phase 6 recruiter-only access slice against the actual RPC and browser behavior. No canonical story ID is asserted: the full source matrix bytes are not present in this task's mounted Project sources. The local JSON file is only the empty tracking skeleton with SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`, which does not match the user-provided full matrix SHA. No criteria or story IDs were reconstructed.
