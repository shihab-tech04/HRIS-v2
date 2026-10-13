# Acceptance Evidence — 2026-10-13 06:51 Asia/Dhaka

## Phase 10: Teams directory filtered CSV export

**Feature commit:** `a2834b6550d2f42c56c94c1ace066d99f6b4e6a1`.

The organization Teams directory exports only rows currently visible after its active-tenant load, status filter and search. It uses the shared spreadsheet-safe CSV utility already used by the manager workspace; no backend write path was added. The synthetic browser row uses a formula-leading team code to verify the exported cell is neutralized.

### Final verification

- `npm run check`: TypeScript PASS; **45/45 contracts PASS, 0 FAIL**; Vite build PASS (existing large-chunk warning: 762.46 kB minified JS).
- `HRIS_TEST_PORT=44039 npx playwright test tests/browser/system-workspace.spec.ts --project=chromium --reporter=line`: **2/2 PASS, 0 FAIL**. Confirms the Teams flow and that the filtered CSV includes only the inactive matching team with formula-leading text escaped.
- `HRIS_TEST_PORT=44040 npx playwright test --project=chromium --reporter=line`: **41/41 PASS, 0 FAIL**.
- `node tests/sql/isolated-auth/run-local.mjs`: latest run before this UI-only change was **77/77 PASS, 0 FAIL**. The CSV change did not modify SQL, Auth, RLS or RPC code. The five prior tenant-security cases remain **5/5 PASS**.
- `git diff --check`: PASS; generated screenshots restored.

### Test-run history for this slice

- The first `npm run check` reached the contracts with **44 PASS / 1 FAIL** because an existing source-level contract expected the helper in `LiveHrisWorkspace.tsx`. After extracting the helper into `src/live/csv.ts`, the contract was updated to inspect that shared module; final run is **45/45 PASS**.
- One first focused browser launch failed before tests because sandboxed localhost binding returned `EPERM` on port 44039; **0 tests executed**. The explicitly authorized local-loopback retry passed **2/2**.
- Full Chromium final run passed **41/41**.

### Tenant-security regression cases

Latest local Auth/RLS suite is 77/77 PASS. These prior five failures remain 5/5 PASS: cross-tenant attendance read denial in both directions; denial of Tenant B manager calls to Tenant A dashboard/attendance/leave RPCs; and denial of Tenant B manager approval of Tenant A leave and attendance requests.

The browser suite uses synthetic responses with external requests blocked. Auth/RLS uses disposable local Supabase with synthetic identities. Production schema inspection was read-only; there were no production mutations.

## Canonical story evidence

Expected canonical SHA-256: `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. Current Project `sources/` mount is empty; exact-name Project/Drive searches exposed no source bytes. The local skeleton (`stories: []`) hashes to `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. **0/1,047 mapped and accepted; 1,047 pending verified source access and story-level evidence.** This does not count implemented product functionality.
