# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 17:50 Asia/Dhaka  
**State:** Recoverable local checkpoint — not for release.

## Current implementation

- **Active phase/module:** Phase 09 — Leave, holiday and absence management; employee Personal Leave page.
- Latest feature commit: `35231292540afc076bb2dd88c9435bb6073db709` (`feat: add Figma-aligned personal leave page`). The page follows Figma node `3:39880`; it uses the existing employee-only dashboard RPC for balances and history, supports calendar-year filtering and CSV download, and keeps the existing request flow.
- The prior locally preserved feature is tenant-scoped manager shift assignment (`efeac20686516a8a9e880efabb1a10f10ea2e600`). The last Drive source checkpoint is represented locally by receipt commit `a855c54119d42eba79bfd61e2fd9ccf108ba96e6`.
- Relative to the 14:20 Drive baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, the current source diff is **19 paths, +5,520/−55** across frontend, SQL/migrations, tests and Playwright config. Since the 17:35 Drive checkpoint, the latest feature changed **2 source/test paths, +160/−1**; three screenshot paths are included in its commit. The code checkout was clean at feature commit `3523129` before these updated tracking records.

### Source/test paths changed since the 14:20 baseline

`playwright.config.ts`; `src/live/LiveApp.tsx`; `src/live/LiveHrisWorkspace.tsx`; `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql`; `supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql`; `supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql`; `supabase/staging/approval-resolution/20261012_04_hris_leave_approval_tenant_guard.sql`; `supabase/staging/approval-resolution/20261012_05_hris_attendance_approval_tenant_and_partial_fields.sql`; browser tests `attendance-information.spec.ts`, `employee-leave.spec.ts`, `managerial-dashboard.spec.ts`, `shift-roster.spec.ts`, `system-workspace.spec.ts`; contract tests `approval-resolution-migrations.test.mjs`, `live-workspace.test.mjs`, `phase1.test.mjs`, `shift-roster.test.mjs`; and isolated Auth/RLS `fixture.sql`, `run-local.mjs`.

## Verification

- After the Personal Leave implementation: `npm run check` — TypeScript **1/1 PASS**, contracts **29/29 PASS**, Vite build **1/1 PASS**. Existing large bundle warning (>500 kB) remains.
- Targeted employee Personal Leave journey — **1/1 PASS**.
- Full Chromium suite after that page — **38/38 PASS**, including responsive leave flow, year filter and CSV download.
- Isolated local Supabase Auth/RLS — **55/55 PASS**, last run before the UI-only Personal Leave slice. That slice changed no SQL, migration or Auth code.
- The five previously failing tenant-security cases passed in the 55/55 run: cross-tenant attendance reads in each direction; Tenant B calls against Tenant A dashboard/attendance/leave RPCs; Tenant B approval attempts against Tenant A leave and attendance.
- Screenshots: `docs/evidence/personal-leave-desktop-20261012.png`, `docs/evidence/personal-leave-mobile-20261012.png`.

## Canonical story source and actual acceptance

- The owner reports the recovered catalogue contains **1,047 stories / 153 modules**, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The local Project `sources/` mount is empty. A filename search under the available Project and attachment trees and an exact-name connected Drive search found only the in-repository empty tracking skeleton, whose SHA-256 is `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`.
- Current catalogue traceability: **0/1,047 mapped and accepted against canonical IDs; 1,047 pending verified source access and story-level evidence mapping.** This does not mean no product functionality has been implemented: the executable acceptance results above stand independently. No IDs or requirement text have been reconstructed.
- Current UI acceptance evidence for the Personal Leave slice is its 1/1 targeted browser journey, inclusion in 38/38 full Chromium, and the desktop/mobile captures. No story-level acceptance is claimed until the recovered matrix hash is verified and individual criteria are mapped.

## Active blocker and next executable action

- **Blocker:** Project story-source mount discrepancy. User reports the recovered matrix is in Project sources, but this checkout exposes no files there and connected Drive exact-name search returned no matrix.
- **Root cause:** the recovered source is not accessible through the currently mounted Project filesystem/Drive search; this is a traceability/access gap, not a failed implementation test.
- **Next action:** keep implementing from verified code/schema and Figma sources while attempting to resolve the mount; next functional candidate is the employee web clock-in/out journey called out by the master directive. The legacy dashboard control is local React state only, so any replacement must bind to a tenant-checked persisted contract and existing business rules before it is exposed.

## Preservation boundary

- This checkpoint is local and recoverable through its commit/evidence. A new versioned checkpoint record is being added to the connected account-owned `HRMIS Preservation 2026-10-11` folder and will be read back before its receipt is committed.
- This is not the final source archive. No paid Supabase service, production data/permissions, GitHub push or deployment was used. Final order remains complete and verify product → back up and read back Drive archive → final GitHub push → deployment.
