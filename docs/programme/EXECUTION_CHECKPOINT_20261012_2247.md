# Synesis HRIS 360° — Execution Checkpoint

Date: 2026-10-12 22:47 Asia/Dhaka  
State: ACTIVE, INCOMPLETE, NOT FOR RELEASE  
Main branch: codex/recovery-checkpoint-20261012

## Current implementation checkpoint

Phase 08 — Attendance and time management; Figma-aligned Attendance Report toolbar and accessible Filters disclosure.

The report toolbar follows the inspected Figma reference: Search, Download Report, Filters, in that order. Desktop widths are 334px, 184px and 64px, with local Figma assets. Search submit, CSV export and filters retain their behavior. The Filters button's aria-controls target now remains in the DOM while hidden and follows aria-expanded when opened or closed. Browser coverage verifies order, dimensions, local icons and disclosure state.

Latest code commits:

- Figma toolbar: 7fc4135bfe1a6d7d520bf089be2e4498e7522b12.
- Filter disclosure: 2dc1ba40b6f8cce2919cb3302f37cca3d468cac4.

Since the 14:20 Main baseline 4ded5f13f1ef2bf17237f347bfac9811283c52dc, Main source, migrations and test changes total 26 paths, +6,319 / -51 lines. The disclosure slice changed 3 paths, +20 / -2 lines. Full changed-path list is recorded in EXECUTION_CHECKPOINT_20261012_2242.md; changes since that checkpoint are in the two attendance files under tests and the LiveHrisWorkspace component.

## Tests and acceptance

- npm run check: TypeScript PASS; 41/41 contract tests PASS; Vite build PASS. The existing large-bundle advisory remains (728.29 kB minified JS).
- HRIS_TEST_PORT=4248 npx playwright test --project=chromium tests/browser/attendance-information.spec.ts: 1/1 PASS, including filter disclosure target, hidden/expanded state, toolbar order, widths and local assets.
- HRIS_TEST_PORT=4248 npm run test:e2e: 38/38 Chromium PASS.
- node tests/sql/isolated-auth/run-local.mjs: 65/65 PASS at 22:15, using the free isolated local stack and synthetic identities. No SQL, Auth, RLS or permission code changed after that run.
- All five previously failing tenant-security cases remain PASS. Coverage includes cross-tenant attendance read isolation, Tenant B denial on Tenant A dashboard/attendance/leave RPCs, and Tenant B denial when deciding Tenant A requests.
- The earlier default-port attempt from the preceding checkpoint reached the stale local Auth runtime. Its 31 failed, 3 interrupted, 4 not-run result is environmental; the correct 4248 run passed 38/38. No new failed tests occurred in this checkpoint.

## Canonical stories and source visibility

The user reports the recovered authoritative catalogue contains 1,047 original stories across 153 modules, with expected SHA-256 c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520. The mounted Project sources directory exists but is empty. Exact-name Drive search returned no catalogue; related Drive results were earlier checkpoint records. The only repository copy is the empty tracking skeleton at docs/programme/CANONICAL_USER_STORY_MATRIX.json, SHA-256 456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996.

Canonical requirement acceptance remains 0/1,047 fully mapped and tested; 1,047 remain pending. This counts story-to-source acceptance, not product features. No requirement text or IDs have been reconstructed; the tracking skeleton remains untouched.

## Security, backup and release status

No production data, permissions, Auth settings or migrations changed. No paid Supabase service was activated or purchased. No GitHub push or deployment occurred.

The connected Drive folder HRMIS Preservation 2026-10-11 is owned by shihabshajib01@gmail.com. Five versioned checkpoint/evidence/ledger records and their preservation receipt were uploaded and exact-text readback verified at the previous checkpoint. The previous 18:56 source archive predates this implementation and remains unchanged; it is not labeled current or final. A new complete source archive is reserved for full acceptance.

## Next executable action

Continue Phase 08 functional attendance/time-management work from the available approved Figma and established RPC contracts. Continue isolated Auth/RLS tests whenever security code changes. Map stories only after the supplied-hash catalogue bytes are visible. Finish and verify the complete product, then make and read back the final Drive source archive, before the final GitHub push and deployment.
