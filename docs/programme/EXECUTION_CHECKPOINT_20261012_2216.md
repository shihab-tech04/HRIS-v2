# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 22:16 Asia/Dhaka  
**State:** active implementation checkpoint; not a release candidate.  
**Current phase:** Phase 08 — Attendance, shift, roster and time management.  
**Current module slice:** Shift Roster date and search filters.

## Implementation

- Feature commit: `7060c371adc8f3e0794fde473a251c85aa70bbda` (`feat: stage shift roster filters`), on local-only branch `codex/recovery-checkpoint-20261012`. Previous feature commit: `b0a3da24ae93162c401a19cca51b87aa81bc440c`.
- The roster's `Apply filters` form now commits the date range and employee/shift search together. Editing a date alone does not issue a roster RPC. The committed range is validated before loading, and the displayed date range and CSV filename use applied values. The existing tenant-scoped RPC, assignment flow, duplicate protection and permission model are unchanged.
- The current slice changed 3 code/test paths, **+36/−3**: `src/live/LiveHrisWorkspace.tsx` (+16/−3), `tests/browser/shift-roster.spec.ts` (+8/−0), and `tests/contracts/shift-roster.test.mjs` (+12/−0). No SQL changed.
- Since the 14:20 Main source baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, the committed implementation diff is **23 paths, +6,207/−55**, excluding docs and evidence images. The exact paths are:
  `playwright.config.ts`; `src/live/LiveApp.tsx`; `src/live/LiveHrisWorkspace.tsx`; migrations `20261012091930_hris_tenant_membership_role_permissions.sql`, `20261012111928_hris_tenant_shift_roster_read.sql`, `20261012113020_hris_tenant_shift_assignment_manage.sql`, `20261012115907_hris_employee_web_attendance_event.sql`, `20261012183000_hris_attendance_report_team_name.sql`; staged migrations `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql` and `20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`; browser tests `attendance-information.spec.ts`, `employee-leave.spec.ts`, `managerial-dashboard.spec.ts`, `shift-roster.spec.ts`, `system-workspace.spec.ts`; contract tests `approval-resolution-migrations.test.mjs`, `attendance-event.test.mjs`, `attendance-report.test.mjs`, `live-workspace.test.mjs`, `phase1.test.mjs`, `shift-roster.test.mjs`; and `tests/sql/isolated-auth/fixture.sql`, `tests/sql/isolated-auth/run-local.mjs`.
- Candidate remains clean at `a23bd58f35d8194551f46751e7c9b1938ab2b20e`. Main has no pending implementation changes after the feature commit; this checkpoint documentation is being added separately.

## Verification

- `npm run check`: TypeScript PASS, **39/39 contract tests PASS**, Vite build PASS. Existing JavaScript chunk advisory: 723.93 kB minified.
- `HRIS_TEST_PORT=4248 npm run test:e2e`: **38/38 Chromium tests PASS**. The roster journey verifies no request occurs while editing a date, then confirms Apply filters sends the applied tenant/date/search values. The suite uses synthetic responses and blocks external requests.
- `node tests/sql/isolated-auth/run-local.mjs`: **65/65 Auth/RLS checks PASS, 0 failed**, on the disposable local Supabase stack with synthetic users across two tenants. The five prior tenant-security failures all pass (listed in acceptance evidence). No production data, permissions, Auth settings or schema were changed.
- `git diff --check`: PASS. During this verification, an initial contract attempt had 38 pass/1 fail because the new contract omitted a browser-spec reference; that harness defect was fixed, and the final run passed 39/39. Initial browser and local-Docker launches were blocked before tests began by the sandbox; approved local-only reruns completed 38/38 and 65/65 respectively.

## Canonical stories and release

- The owner reports the recovered catalogue has **1,047 stories / 153 modules**, source-linked text, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- I checked the mounted Project `sources/` directory (0 files), the full project tree and the attachment directory. Only `docs/programme/CANONICAL_USER_STORY_MATRIX.json` is present locally; it is the empty tracking skeleton, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. Exact-name and hash searches of connected Drive returned preservation/checkpoint records, not the catalogue bytes. The recovered source is therefore not accessible in this task context and its expected hash cannot yet be verified.
- **0/1,047 stories are mapped and accepted against canonical requirements; 1,047 remain pending source visibility and story-level acceptance.** This is not a count of features absent from the product. No story IDs or requirements have been reconstructed, and the implementation matrix has not been overwritten.
- No paid service, production mutation, GitHub push or deployment occurred. Release order remains full product acceptance → owner-owned Drive source archive with integrity readback → final GitHub push → deployment.

## Next action

Continue the Phase 08 attendance and time-management journeys from the current code and available design references, while resolving the canonical source visibility discrepancy. Preserve the current passing tenant/Auth/RLS suite and continue recording acceptance evidence against real requirements once their source text is accessible.
