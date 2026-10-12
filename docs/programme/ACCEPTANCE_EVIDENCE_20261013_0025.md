# Acceptance Evidence — 2026-10-13 00:25 Asia/Dhaka

## Phase 08: manager attendance-correction decision note

**Feature commit:** `461cdcd` (`feat(attendance): capture correction decision notes`).

The manager attendance queue now opens an accessible rejection dialog with an optional decision note. It sends the note through the existing `admin_resolve_attendance_correction(p_id, p_decision, p_note)` RPC and displays the saved `resolution_note` in the queue. Cancel and Escape close the dialog without calling the RPC; Escape restores focus to the Reject action. Approval behavior and database contracts are unchanged.

### Verification

- `npm run check`: TypeScript PASS, **44/44 contract tests PASS**, Vite build PASS. The existing large-chunk advisory remains.
- `HRIS_TEST_PORT=44035 npx playwright test tests/browser/attendance-information.spec.ts --project=chromium --reporter=line`: **1/1 PASS**.
- `HRIS_TEST_PORT=44035 npx playwright test --project=chromium --reporter=line`: **40/40 PASS**.
- `node tests/sql/isolated-auth/run-local.mjs`: latest isolated Auth/RLS result remains **77/77 PASS**, including the five previously failing tenant-security tests (**5/5 PASS**). No SQL, Auth, RLS, or permission code changed in this UI slice.
- `git diff --check`: PASS before commit. Browser-generated screenshots were restored to their committed Figma versions.
- One browser-suite launch on the default sandbox failed before executing tests because loopback binding returned `EPERM`; rerunning with loopback permission on port 44035 completed with 40/40 passing tests. This was a local test-server permission issue, not a failed test.

### Tenant-security cases retained

All five cases pass in the 77/77 isolated suite: cross-tenant attendance reads are denied in both directions; a Tenant B manager cannot call Tenant A dashboard, attendance, or leave RPCs; and the same manager cannot approve Tenant A leave or attendance requests. Production data and permissions were not changed.

### Canonical-story status

The user reports the recovered catalogue contains 1,047 stories across 153 modules and has expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The active task's Project `sources/` mount exposes no files. A local exact-name search finds only `docs/programme/CANONICAL_USER_STORY_MATRIX.json`, which is an empty tracking skeleton (`stories: []`) with SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`; Drive search returned prior checkpoint records, not the matrix. No story requirements or IDs were inferred. **0/1,047 stories are mapped and accepted against canonical text; 1,047 remain pending source access and story-level evidence.** This is a traceability count, not a count of implemented product features.

No GitHub push or deployment occurred. The timesheet reviewer remains default-deny until a tenant-scoped project-lead mapping and permission are verified.
