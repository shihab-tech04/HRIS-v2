# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 18:56 Asia/Dhaka  
**State:** active implementation checkpoint; not a release candidate.  
**Current phase:** Phase 08 — Attendance, shift, roster and time management.  
**Current module slice:** Figma Attendance Report Team Name filter, sorting and export.

## Implementation

- Feature commit: `14aed5471ac1ba09b435cebf9e16154f6de5bd2c` (`feat: add accessible attendance team sorting`) on local-only branch `codex/recovery-checkpoint-20261012`. Prior local checkpoint commit: `34e2edb80fa00a31a1ded0736382e6a4903ecc27`.
- Figma node `17:28320` supplies the aggregate attendance table and Team Name exchange/sort icon; its filter component supplies Team selection and Apply Filter. The report now applies team selection to authorized aggregate rows, sorts Team Name ascending/descending, exposes `aria-sort`, keeps ties stable and unassigned teams last, and uses the same filtered/sorted rows for CSV. No endpoint, database, role or permission changed.
- Current slice changed `src/live/LiveHrisWorkspace.tsx`, `tests/browser/attendance-information.spec.ts`, `tests/contracts/attendance-report.test.mjs` and three refreshed Attendance evidence screenshots: **3 source/test paths, +40/−5**.
- Since the 14:20 baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, cumulative implementation/source/test changes are **23 paths, +6,146/−55**, excluding documentation and image evidence. Exact paths:
  - `playwright.config.ts`
  - `src/live/LiveApp.tsx`
  - `src/live/LiveHrisWorkspace.tsx`
  - `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`
  - `supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql`
  - `supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql`
  - `supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql`
  - `supabase/migrations/20261012183000_hris_attendance_report_team_name.sql`
  - `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql`
  - `supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`
  - `tests/browser/attendance-information.spec.ts`
  - `tests/browser/employee-leave.spec.ts`
  - `tests/browser/managerial-dashboard.spec.ts`
  - `tests/browser/shift-roster.spec.ts`
  - `tests/browser/system-workspace.spec.ts`
  - `tests/contracts/approval-resolution-migrations.test.mjs`
  - `tests/contracts/attendance-event.test.mjs`
  - `tests/contracts/attendance-report.test.mjs`
  - `tests/contracts/live-workspace.test.mjs`
  - `tests/contracts/phase1.test.mjs`
  - `tests/contracts/shift-roster.test.mjs`
  - `tests/sql/isolated-auth/fixture.sql`
  - `tests/sql/isolated-auth/run-local.mjs`
- Candidate checkout is clean at `a23bd58f35d8194551f46751e7c9b1938ab2b20e`; no Candidate files changed in this slice.

## Verification

- `npm run check`: TypeScript PASS, **37/37 contract tests PASS**, Vite build PASS. Existing minified JavaScript chunk advisory is 723.51 kB.
- Full Chromium suite on an isolated loopback port: **38/38 PASS**. Focused attendance journey: **1/1 PASS**. It verifies sort direction and screen-reader sort state, Team filter apply/reset, row visibility, filtered CSV, existing search/date/status behavior, correction actions and mobile table behavior.
- Disposable local Supabase Auth/RLS suite: **65/65 PASS, 0 failed**, rerun after this feature. It includes tenant-A/B read and RPC denials, report-only aggregate-vs-detail access, mismatched cross-tenant team suppression and all prior Auth/RLS cases.
- The five previously failing tenant-security checks remain **5/5 PASS**: attendance reads denied across A↔B, Tenant B denied Tenant A dashboard/attendance/leave RPCs, Tenant B denied Tenant A leave decisions, and Tenant B denied Tenant A attendance decisions.
- `git diff --check`: PASS before code commit. Evidence: `docs/evidence/attendance-information-desktop-20261012.png`, `docs/evidence/attendance-report-desktop-20261012.png`, `docs/evidence/attendance-report-mobile-20261012.png`.

## Canonical story catalogue and release state

- The owner reports the authoritative catalogue has **1,047 stories / 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- This task's read-only Project `sources/` mount has zero files; the exact-name connected Drive search returned no catalogue file. The repository JSON remains the empty tracking skeleton with SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`.
- **0/1,047 stories are mapped and accepted against canonical text; 1,047 remain pending story-level verification.** This does not measure how many application features are implemented; no story text or IDs were inferred.
- No production SQL, data, permissions or Auth settings changed. No paid service, GitHub push or deployment occurred. Continue implementation; release order remains full acceptance → owned Drive source archive plus integrity readback → final GitHub push → deployment.

## Current next action

Continue Phase 08 functional attendance/time journeys using the Figma structure and verified contracts; map functionality to the original story IDs once the source file is available to this task.
