# Acceptance Evidence — 2026-10-13 06:39 Asia/Dhaka

## Phase 10: tenant-scoped Teams directory

**Feature commit:** `d18563f73007dd3e1746018295d040f2e00d1f3f`.

The authenticated workspace exposes a read-only Teams directory to active members with `organization.view` or `organization.manage`. It fetches teams and departments using the active tenant ID, applies client-side name/code/department search and active/inactive/all status filters, and provides counts, loading, error/retry and empty states. The table scrolls within its region on narrow screens. The data query does not add write operations. Current live schema metadata confirms both tables have RLS and authenticated SELECT grants; no project tables or write grants were found.

### Verification

- `npm run check`: TypeScript PASS; **45/45 contracts PASS, 0 FAIL**; Vite production build PASS (existing large-chunk advisory).
- `HRIS_TEST_PORT=44037 npx playwright test tests/browser/system-workspace.spec.ts --project=chromium --reporter=line`: **2/2 PASS, 0 FAIL**. The directory test covers active default, all/inactive, department search, tenant ID in the REST request, 375px no-page-overflow and table-region horizontal scrolling.
- `HRIS_TEST_PORT=44038 npx playwright test --project=chromium --reporter=line`: **41/41 PASS, 0 FAIL**.
- `node tests/sql/isolated-auth/run-local.mjs`: **77/77 PASS, 0 FAIL** using disposable local Auth and Postgres fixtures across two tenants. No production database or test identities were used.
- `git diff --check`: PASS; test-generated screenshots were restored.

### Previously failing tenant-security cases

All **5/5 PASS** in the 77-check isolated suite:

1. Tenant B cannot read Tenant A attendance rows.
2. Tenant A cannot read Tenant B attendance rows.
3. Tenant B cannot call Tenant A dashboard, attendance or leave RPCs.
4. Tenant B cannot approve Tenant A leave requests.
5. Tenant B cannot approve Tenant A attendance corrections.

### Boundaries

The browser flow uses synthetic HTTP responses, with external requests blocked. Auth/RLS uses real sessions against the local disposable Supabase stack. Production was only inspected through read-only schema metadata/SELECT; no production data, permissions, Auth settings or SQL were changed. The page follows the established HRIS shell and tokens, but no dedicated Teams Figma frame was available for pixel comparison.

## Canonical stories

Expected source SHA-256: `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The current Project `sources/` mount is empty; Project file search, Project MCP resources and exact-name Google Drive search did not return canonical bytes. Local `docs/programme/CANONICAL_USER_STORY_MATRIX.json` remains the empty skeleton, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. **0/1,047 story requirements are mapped and accepted; 1,047 remain pending source verification and story-level acceptance.** This is not a product-feature completion count.
