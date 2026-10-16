# Acceptance Evidence — 2026-10-12 17:25 Asia/Dhaka

This checkpoint records a new Phase 08 Shift roster slice. It does not certify all of Phase 08, the 22-phase product, or the canonical user-story catalogue.

## Implemented slice

- Added the authenticated **Shift roster** workspace page, reusing the existing HRIS shell, responsive navigation, color and table patterns.
- The page reads explicit per-employee/day assignments through `hris_get_tenant_shift_roster_data(uuid,date,date,text)`. It supports a date range, employee/shift search, refresh and CSV export. It does not invent assignments where no schedule row exists.
- The function requires `attendance.view` or `attendance.manage` through an active tenant membership and tenant-binds assignment, employee, shift and department joins. The client does not directly read `employee_shift_assignments`.
- This slice is read-only. Shift assignment creation/change workflow remains open. The roster-specific Figma node was not available in the mounted project source; direct Figma parity is not claimed.

## Verification

- `npm run check`: TypeScript **PASS**; contract suite **28/28 PASS**; Vite build **PASS**. The existing >500 kB bundle warning remains.
- `node tests/sql/isolated-auth/run-local.mjs`: **50/50 PASS** on the disposable local Supabase Auth/RLS stack, with eight synthetic Auth users across two tenants. New cases cover tenant A/B rows, viewer/search, inverted-range rejection, cross-tenant denial, global-role-only denial and RPC execute grants. The five previously failing tenant-security cases also pass.
- `HRIS_TEST_PORT=4199 npm run test:e2e`: **38/38 PASS**. All browser Auth/API calls use synthetic mocks; external calls are blocked.
- `HRIS_TEST_PORT=4197 npx playwright test tests/browser/shift-roster.spec.ts --project=chromium`: **1/1 PASS** after updating the capture to show the complete synthetic roster.
- `git diff --check`: **PASS**.
- Visual evidence: `docs/evidence/shift-roster-desktop-20261012.png` and `docs/evidence/shift-roster-mobile-20261012.png`. At 375px the page fits the viewport; the labeled table region scrolls horizontally inside the page.

## Story traceability and release boundary

- The user reports a recovered 1,047-story, 153-module catalogue with expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The mounted Project `sources/` directory still has no readable source file; the repository tracking skeleton contains no stories.
- Catalogue-level status: **0/1,047 stories mapped and fully accepted; 1,047 pending source verification and story-by-story mapping.** No story IDs or requirement text have been inferred. The roster implementation and test results above are actual evidence, but not yet tied to canonical IDs.
- Production data, policies and Auth settings were not changed. No paid service was created or purchased. No GitHub push, release archive or deployment occurred.
- The local roster migration is a release candidate. Preserve the required order: finish full product/story acceptance, verify the final owner-owned Drive source archive and integrity, then push to GitHub and deploy.
