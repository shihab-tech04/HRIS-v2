# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 16:58 Asia/Dhaka

**State:** RECOVERABLE LOCAL CHECKPOINT — NOT FOR RELEASE.

## Active implementation

- **Phase 08 — Attendance, shift, roster and time management; module: Attendance Information.** Phase 17 Employee and Managerial Dashboards remain implemented slices.
- Implemented Figma-referenced Attendance Information frame `17:28320` in the authenticated live workspace. Users with tenant `attendance.view`/manage access see employee-level attendance detail; report-only roles continue to receive aggregate report rows. The page now has tenant-scoped search, date/status filters, CSV download, attendance corrections and a keyboard-focusable horizontal table on narrow screens.
- Attendance loads ignore stale concurrent responses and hide rows belonging to a previous tenant during tenant switches. Employee names use initials because the current RPC has no profile-photo field; team name is not invented because the current RPC/schema does not return it.
- Main HRIS branch: `codex/recovery-checkpoint-20261012`. Feature commit: `25f612da0972d0336af38b83d9e145572566c1ce`; 15 paths, +303/−61 text lines plus added/refreshed screenshots. The preceding Employee Dashboard commit is `5ae9ae8e58d7e4c5eb2dab21d19e8feb1a40b17c`. This checkpoint record is committed separately after the feature commit.
- Browser tests now accept `HRIS_TEST_PORT` and require a strict isolated port. This avoided reusing a TaxPay process already listening on port 4173; that unrelated process was left untouched.

## Verification at this checkpoint

- `npm run check`: TypeScript PASS; contracts **26/26 PASS**; Vite build PASS with existing 691.16 kB JavaScript chunk warning.
- `HRIS_TEST_PORT=4190 npm run test:e2e`: full Chromium suite **37/37 PASS, 0 failed**. Attendance Information alone also passed **1/1**. Browser traffic is synthetic/mock-backed; external requests are blocked or explicitly mocked.
- Latest free isolated local Supabase Auth/RLS suite: **44/44 PASS, 0 failed** on synthetic identities across two tenants. The current Attendance UI slice changed no SQL. The five previously failing cross-tenant security checks still pass in that suite.
- `git diff --check`: PASS.
- No production data or permissions were modified; no paid Supabase services, GitHub push, final source archive or deployment occurred.

## Canonical story source and mapping

- The user identified the recovered catalogue as **1,047 stories / 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- This task's mounted Project `sources/` directory is empty. Connected Drive filename/hash searches did not return the catalogue. The repository's `docs/programme/CANONICAL_USER_STORY_MATRIX.json` remains an empty tracking skeleton (0 rows, expected count 1,047, actual SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`).
- Functional acceptance evidence is recorded in `docs/programme/ACCEPTANCE_EVIDENCE_20261012_1657.md`. **Canonical status is 0/1,047 story IDs mapped/accepted; 1,047 unmapped.** This is not a claim that no functionality exists. Do not invent story IDs, requirements or acceptance criteria.

## Blocker and next work

- Story-to-requirement mapping remains blocked until the exact-hash source is present in the mounted Project/Library files.
- Product work is not blocked. Continue Phase 08 with Attendance Requests and employee correction journeys using the existing tenant-scoped contracts and approval RPC; keep synthetic Auth/RLS checks in the regression loop.
- Release is still gated on all 22 phases, canonical story acceptance, complete Main/Candidate integration, verified final Drive source archive, then GitHub push, then deployment.

## Drive preservation

Use the owner-verified folder `HRMIS Preservation 2026-10-11` (`1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`). Add this versioned checkpoint without replacing prior records. Upload and integrity-round-trip the full source archive only after full acceptance and before the final GitHub push.
