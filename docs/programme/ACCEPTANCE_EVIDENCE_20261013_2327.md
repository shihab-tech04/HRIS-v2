# Acceptance evidence — 2026-10-13 23:27 Asia/Dhaka

## Candidate assessment journey

**Main commit:** `3ad9230cd839a2263ac91dddccfc37d8f1caf873`

**Candidate commit:** `217bfeadd520f09d30e36b18af0589ac2ad6cee9`

The Main manager workspace creates an assessment for an open candidate application and reads the tenant-scoped queue through server RPCs. The Candidate workspace loads only the authenticated candidate's assessment, accepts a text response or HTTPS response link, and persists submission through its owner-bound RPC. A manager can transition a submitted row to reviewed once; candidate view then shows the reviewed state. The implementation intentionally introduces no numeric assessment or hiring-decision policy.

Acceptance executed on disposable local Supabase Auth/Postgres, not production:

- Main `npm run check`: TypeScript pass; **93/93 contracts pass**; Vite production build pass.
- Candidate `npm run lint`: pass; `npm run test:routes`: **18/18 pass**; Vite production build pass.
- Candidate local Auth/Postgres/browser journey: **132/132 pass**, with 375px and desktop journeys. This covers assessment assignment, validation, candidate submission, manager refresh/review, persisted reviewed state, tenant/role denials, candidate isolation, and existing interview, reschedule, offer/preboarding journeys.
- Main isolated Auth/Postgres/browser suite: **167/167 pass, 0 fail**. Task/review cases cover assigned Project Manager authority, ordinary Admin/Manager/Super Admin denials, tenant isolation, release/completion with feedback pending, overlap-based obligations, submission-time overlap revalidation, no self-review, invalid scores, 0 and 5 scores, separate Not Observed, employee history, and persisted browser journey. A unique reviewer/reviewee/task constraint and pending-only submission transition prevent duplicate obligations and rewriting; the runtime suite did not make a second-submit attempt.
- `git diff --check`: pass before both implementation commits.

## Source-linked story mapping status

The owner reports an authoritative matrix of 1,047 stories across 153 modules with expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The only local matrix file is an empty tracking skeleton: 0 stories, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. The synced project `sources/` directory contains no catalogue file, and the connected Drive search for the exact filename returned no result. Therefore no story ID is asserted or marked accepted from this evidence; only observed functional acceptance is recorded here.

## Safety and known limitations

- The disposable test harness refused the first nonexistent workdir before running SQL. The subsequent full suite used the existing isolated `synesis-local-hris-test` Supabase stack and verified both Auth service and `auth.users` had zero users before creating synthetic Auth/tenant fixtures.
- A generated `supabase/.temp/` directory is present as untracked local CLI state; it was not committed into either source commit.
- Drive folder ownership was read back for `HRMIS Preservation 2026-10-11`; archive upload and readback metadata are recorded in the separate checkpoint manifest/receipt after transfer.
- No paid service was activated, no production data or permissions were modified, and no GitHub push or deployment occurred.
