# Synesis HRIS 360° — Execution Checkpoint

Date: 2026-10-12 22:42 Asia/Dhaka  
State: ACTIVE, INCOMPLETE, NOT FOR RELEASE  
Main branch: codex/recovery-checkpoint-20261012

## Current implementation checkpoint

Phase 08 — Attendance and time management; Attendance Report aggregate toolbar.

The report toolbar now follows the inspected Figma reference: Search, Download Report, Filters, in that order. At desktop width the controls measure 334px, 184px, and 64px. Search, download, and filter use local copies of the Figma source assets. Existing search submission, CSV export, filter panel and access behavior remain in place. Evidence and the browser assertion verify the local dimensions and order. This is a bounded toolbar acceptance, not whole-page or whole-product Figma acceptance.

Main feature commit: 7fc4135bfe1a6d7d520bf089be2e4498e7522b12.

Since the 14:20 Main baseline 4ded5f13f1ef2bf17237f347bfac9811283c52dc, the Main source, migrations and test changes total 26 paths, +6,301 / -51 lines. The current toolbar slice is 8 paths, +70 / -6 lines. The actual changed source/test paths since baseline are listed below:

- Application: src/live/LiveApp.tsx; src/live/LiveHrisWorkspace.tsx.
- Figma assets: src/assets/attendance-download.png; src/assets/attendance-filter.svg; src/assets/attendance-search.svg; src/assets/attendance-team-sort.svg.
- Database release candidates: supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql; supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql; supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql; supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql; supabase/migrations/20261012183000_hris_attendance_report_team_name.sql; supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql; supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql.
- Browser tests: tests/browser/attendance-information.spec.ts; tests/browser/employee-leave.spec.ts; tests/browser/managerial-dashboard.spec.ts; tests/browser/shift-roster.spec.ts; tests/browser/system-workspace.spec.ts.
- Contracts and isolated Auth/RLS fixtures: tests/contracts/approval-resolution-migrations.test.mjs; tests/contracts/attendance-event.test.mjs; tests/contracts/attendance-report.test.mjs; tests/contracts/live-workspace.test.mjs; tests/contracts/phase1.test.mjs; tests/contracts/shift-roster.test.mjs; tests/sql/isolated-auth/fixture.sql; tests/sql/isolated-auth/run-local.mjs.

Recent implementation commits include 5ae9ae89772c351bfae1db920813935b14797738 (employee dashboard), 25f612da0972d0336af38b83d9e145572566c1ce (Attendance Information), 1edd97d1e13d58330e6df2ab9a8ace13a99ec61b (employee correction requests), cb1e8de08ac8100463c5182b87119f4d29cb95ee (tenant-scoped Shift roster), 35231292540afc076bb2dd88c9435bb6073db709 (Personal Leave page), 66d0a12b92f7dca38331848da82ab0d4da9acbf3 (employee web attendance), 2d55ff93146445f6aaf799acb26b9e7149c52338 (Figma Attendance Report), a458865709c6dbee79091c193a6527c4d9789001 (tenant-safe Team Name), a839b07a57757cbb17a0c16284e8c23f5633f9ca (Team filter), 14aed5471ac1ba09b435cebf9e16154f6de5bd2c (accessible Team sort), b0a3da24ae93162c401a19cca51b87aa81bc440c (applied aggregate filters), 7060c371adc8f3e0794fde473a251c85aa70bbda (roster filters), 84d71177d54da1bb42f3e3dc0c39e2fdce62adf8 (Figma sort asset), and 7fc4135bfe1a6d7d520bf089be2e4498e7522b12 (toolbar).

## Tests and acceptance

- npm run check: TypeScript PASS; 40/40 contract tests PASS; Vite build PASS. The existing large-bundle advisory remains.
- HRIS_TEST_PORT=4248 npx playwright test --project=chromium tests/browser/attendance-information.spec.ts: 1/1 PASS, including toolbar order, measured widths and local assets.
- HRIS_TEST_PORT=4248 npm run test:e2e: 38/38 Chromium PASS.
- node tests/sql/isolated-auth/run-local.mjs: 65/65 PASS at 22:15, using the free isolated local stack and synthetic identities. No SQL, Auth, RLS or permission code changed after that run.
- All five previously failing tenant-security cases remain PASS: both directions of cross-tenant attendance row denial; Tenant B denied access to Tenant A dashboard/attendance/leave RPCs; and Tenant B denied Tenant A leave and attendance decisions.
- One initial full-suite launch used the default 4173 port and reached the stale local Auth runtime. That invalid attempt recorded 31 failures, 3 interrupted tests and 4 not run. Rerunning on the isolated 4248 port passed all 38/38; the first attempt is not counted as a product regression.
- The refreshed report screenshots are docs/evidence/attendance-report-desktop-20261012.png and docs/evidence/attendance-report-mobile-20261012.png. No unrelated test-generated screenshots were retained.

## Canonical stories and source visibility

The user reports the recovered authoritative catalogue contains 1,047 original stories across 153 modules and has expected SHA-256 c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520. The mounted Project sources directory exists but is empty. Exact-name Drive search returned no catalogue; related Drive results were prior checkpoint records. The only repository copy is the empty tracking skeleton at docs/programme/CANONICAL_USER_STORY_MATRIX.json, whose SHA-256 is 456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996.

Canonical requirement acceptance remains 0/1,047 fully mapped and tested; 1,047 remain pending. This is a story-to-source acceptance count, not a claim that no product features are implemented. No requirement text or IDs have been reconstructed, and the tracking skeleton remains untouched.

## Security, backup and release status

No production data, permissions, Auth settings or migrations were changed. No paid Supabase service was activated or purchased. No GitHub push or deployment occurred.

The connected Drive folder HRMIS Preservation 2026-10-11 was rechecked: it is owned by shihabshajib01@gmail.com. Versioned records are being added to that folder with readback verification. The latest source archive remains the older 18:56 archive and does not contain this or later code; it is not labeled current or final. A new complete source archive remains reserved for full acceptance.

## Next executable action

Continue Phase 08 functional attendance/time-management work from the available approved Figma and established RPC contracts. Continue security validation against the isolated local Auth/RLS stack whenever security code changes. Map stories only after the supplied-hash catalogue bytes are visible. Preserve the sequence: finish and verify the complete product, make and read back the final Drive source archive, then perform the final GitHub push and deployment.
