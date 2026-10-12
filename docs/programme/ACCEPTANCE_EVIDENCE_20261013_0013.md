# Acceptance Evidence — 2026-10-13 00:13 Asia/Dhaka

**Scope:** Phase 09 manager leave decision notes, employee-visible decision history, and repeatable local Auth/RLS fixture dates.
**Implementation commit:** `673c374ab8e900a4153b2f661e1afcc54f2029c0`.
**Keyboard acceptance commit:** `3a408800a08c1b8ec2b706c3298c8b43cf42c562`.
**Release decision:** Slice accepted in synthetic/local scope; HRIS remains incomplete and NOT FOR RELEASE.

## Implemented journey

The authorized leave manager can open a named rejection confirmation dialog, add an optional decision note, cancel without issuing a decision RPC, dismiss with Escape, and confirm rejection. The existing `admin_resolve_leave_request` contract receives the trimmed note through `p_note`; approval behavior remains unchanged. The queue displays saved `resolution_note` values already returned by `hris_get_tenant_leave_data`, and the employee's existing Personal Leave history displays the same note after refresh. The dialog uses the existing responsive workspace styling and restores focus to the triggering Reject action or the page heading when that row disappears.

No SQL, schema, permission, production data, Auth configuration, paid service, GitHub remote, or deployment was changed for the leave UI feature. The separate local Auth/RLS harness fixture now derives the relevant correction dates and expected timestamps from the synthetic `Asia/Dhaka` test date. That corrects a 4-test rollover failure caused by Oct 12 constants while the synthetic attendance row followed Oct 13; the SQL release candidate was not changed.

## Verification

| Check | Result |
|---|---:|
| `npm run check` | TypeScript PASS; **44/44 contracts PASS**; Vite build PASS (existing 750.75 kB chunk-size advisory) |
| `HRIS_TEST_PORT=44034 npx playwright test tests/browser/manager-leave.spec.ts --project=chromium` | **1/1 PASS** including cancel, Escape/focus restoration, optional note, and refreshed note display |
| `HRIS_TEST_PORT=44033 npx playwright test --project=chromium` | **40/40 PASS** |
| `node tests/sql/isolated-auth/run-local.mjs` | **77/77 PASS, 0 FAIL** on disposable local Supabase Auth/RLS with synthetic identities and two tenants |
| Prior tenant-security regressions | **5/5 PASS** within the 77/77 suite |
| `git diff --check` | PASS |

The first post-rollover Auth/RLS run was 73/77 because the test fixture dated three corrections on Oct 12 while the attendance record followed the local Oct 13 date. The corrected repeatable fixture run passed 77/77. The five cross-tenant visibility/authorization cases passed in both runs.

## Story mapping and release gates

The authoritative matrix is still not readable in this task's mounted Project `sources/` directory (empty) or available as an exact-name Drive file. Its expected SHA-256 remains `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The local `stories: []` tracking skeleton is unchanged. Therefore **0/1,047 stories are mapped and accepted against the canonical source; 1,047 remain pending**. This is catalogue evidence status, not a count of product features.

The Phase 08 timesheet reviewer path remains default-deny pending a verified tenant-scoped approver mapping and permission. Production role/membership catalog alignment, remaining security review, Candidate integration, full story coverage, final account-owned Drive source archive, final GitHub push, and deployment are still open. No early deployment occurred.
