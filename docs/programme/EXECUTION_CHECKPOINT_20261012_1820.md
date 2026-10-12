# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 18:19 Asia/Dhaka  
**State:** active implementation checkpoint; not a release candidate.  
**Current phase:** Phase 08 — Attendance, shift, roster and time management.  
**Current module slice:** Figma-aligned `reports.view` Attendance Report, preserving detailed attendance and correction actions for `attendance.view`/`attendance.manage` users.

## Local source checkpoint

- The report UI commit is `2d55ff93146445f6aaf799acb26b9e7149c52338` (`feat: align attendance report with Figma`). The preceding employee clock-in/out commit is `66d0a12b92f7dca38331848da82ab0d4da9acbf3`. Both are local on `codex/recovery-checkpoint-20261012`; no GitHub push or deployment occurred.
- Since the 14:20 Drive baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, the source diff is **21 paths, +5,882/−55**. The complete path list follows.
- The report-only screen follows Figma node `17:28320`: employee aggregate rows, date range, office/work hours, signed deviation, search, filters and CSV. Detailed attendance and correction-management remain available on the existing permission path. The current report RPC does not return `team_name` or photos; the UI shows an unavailable team value and initials rather than inventing data.
- The earlier clock-in/out slice persists events through `hris_employee_record_attendance_event(uuid,text)`, with live-session employee binding, tenant-local date, duplicate/out-of-order rejection and one audit event.

### Source and test files changed since the 14:20 baseline

`playwright.config.ts`; `src/live/LiveApp.tsx`; `src/live/LiveHrisWorkspace.tsx`; migrations `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`, `supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql`, `supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql`, `supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql`; staged approvals `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql` and `supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`; browser tests `tests/browser/attendance-information.spec.ts`, `tests/browser/employee-leave.spec.ts`, `tests/browser/managerial-dashboard.spec.ts`, `tests/browser/shift-roster.spec.ts`, `tests/browser/system-workspace.spec.ts`; contracts `tests/contracts/approval-resolution-migrations.test.mjs`, `tests/contracts/attendance-event.test.mjs`, `tests/contracts/live-workspace.test.mjs`, `tests/contracts/phase1.test.mjs`, `tests/contracts/shift-roster.test.mjs`; and `tests/sql/isolated-auth/fixture.sql`, `tests/sql/isolated-auth/run-local.mjs`.

## Acceptance

- `npm run check`: **32/32 contract tests PASS**, TypeScript check PASS, Vite build PASS. Existing minified-JavaScript size advisory remains (721.16 kB).
- Full mocked Chromium suite: **38/38 PASS**. The attendance scenario verifies both manager detail/correction behavior and report-only aggregates, signed deviation, filters, CSV and a horizontally scrollable 375px table. External requests are blocked.
- Disposable local Supabase Auth/RLS suite: **63/63 PASS, 0 failed** on the current SQL baseline; the report UI commit changed no SQL or Auth behavior. Nine synthetic users across two tenants were used.
- The five previously failing tenant-security checks pass: cross-tenant attendance reads in each direction; Tenant B calls against Tenant A dashboard/attendance/leave RPCs; Tenant B decisions against Tenant A leave and attendance.
- Screenshots: `docs/evidence/attendance-report-desktop-20261012.png` at 1920×1117, `docs/evidence/attendance-report-mobile-20261012.png` at 375px, plus employee clock-in/out evidence from the prior checkpoint.
- No production SQL, data, permissions or Auth settings changed; no paid service was used.

## Story catalogue status

- The owner reports the recovered canonical catalogue has **1,047 stories**, **153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The mounted Project `sources/` directory is empty. Local search finds only `docs/programme/CANONICAL_USER_STORY_MATRIX.json`, the empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`); exact-name Drive search returns no matrix. Thus **0 stories are mapped and accepted against recovered criteria; 1,047 remain pending story-level verification**. This is not a claim that no product functionality is implemented. No IDs or criteria have been reconstructed.

## Next executable work

Continue Phase 08 from the Figma report and existing attendance/correction contracts. Inspect the established schema for a real employee-to-team relationship before adding `team_name` to the report RPC; keep the current neutral value until that source field is verified. Continue independently verifiable features while resolving the Project source mount. Final backup certification, GitHub publication and deployment remain later gates.
