# Acceptance Evidence — 2026-10-12 17:35 Asia/Dhaka

This checkpoint records a functional Phase 08 manager assignment slice. It does not certify all of Phase 08, the 22-phase product, or the canonical user-story catalogue.

## Implemented functionality

- The authenticated Shift roster now offers an assignment form to managers with `attendance.manage` in the active tenant membership.
- The options RPC returns active employees and shifts for only the requested tenant. The assignment RPC rechecks permission, active same-tenant employee and shift, creates a scheduled employee/date assignment, and writes one audit event in the same transaction.
- The existing unique employee/date rule is preserved. A duplicate is rejected and the existing assignment remains unchanged; the UI reports that outcome.
- The page reuses the existing HRIS shell and responsive form/table styles. The assignment form stacks on mobile; the roster remains in its labeled horizontal-scroll region. No separate roster Figma frame is available in the current mount, so no frame-specific parity is claimed.

## Verification

- `npm run check`: TypeScript **PASS**; contracts **29/29 PASS**; Vite production build **PASS**. Existing minified bundle warning remains (>500 kB).
- `SUPABASE_HOME=/private/tmp/synesis-supabase-home SUPABASE_TELEMETRY_DISABLED=1 node tests/sql/isolated-auth/run-local.mjs`: **55/55 PASS, 0 failed**, using a disposable local Supabase Auth/RLS stack and synthetic users/tenants.
- `HRIS_TEST_PORT=4199 npm run test:e2e`: **38/38 PASS** on Chromium with mocked Auth/API services and blocked external calls.
- `git diff --check`: **PASS**.
- Screenshots: `docs/evidence/shift-roster-desktop-20261012.png` and `docs/evidence/shift-roster-mobile-20261012.png`. Desktop capture shows the assignment error state after duplicate rejection; the existing assignment remains visible. At 375px, the form stacks and the table scrolls inside its labeled region without page overflow.

## Previously failing tenant-security cases

All five remain passing in the 55/55 local suite:

1. Tenant B cannot read Tenant A attendance.
2. Tenant A cannot read Tenant B attendance.
3. Tenant B cannot call Tenant A dashboard, attendance, or leave RPCs.
4. Tenant B cannot approve Tenant A leave.
5. Tenant B cannot approve Tenant A attendance.

## Story traceability and release boundary

- User-reported canonical catalogue: **1,047 stories across 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The mounted Project `sources/` directory currently contains 0 files. An exact-name search of the mounted Project and connected Drive did not return the canonical matrix. The only local catalogue file is the empty tracking skeleton and does not match the expected hash.
- Catalogue-level status: **0/1,047 mapped and fully accepted; 1,047 pending source verification and story-by-story mapping**. The implementation and tests above are actual acceptance evidence, but cannot yet be linked to canonical story IDs. No requirement text or IDs were reconstructed.
- The assignment migration is local only. No production data, permissions, Auth settings or paid services were changed. No GitHub push, final archive certification or deployment occurred.
- Release order remains: finish product and story acceptance, verify an owner-owned Drive backup and integrity, then final GitHub push, then deployment.
