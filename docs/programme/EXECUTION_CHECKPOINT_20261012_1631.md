# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 16:31 Asia/Dhaka  
**State:** RECOVERABLE LOCAL CHECKPOINT — NOT FOR RELEASE.

## Current execution

- **Active phase/module:** Phase 17 — Dashboards, analytics and reporting; Managerial Dashboard. This implementation slice also carries Phase 04 tenant-membership authorization and the Phase 08/09 attendance and leave workflows that feed its metrics and pending-work links.
- Main branch: `codex/recovery-checkpoint-20261012`; feature commit: `5e935f50b3cc36b13d8bb057377b7017fd004b6b` (`feat: implement Figma-aligned managerial dashboard`). Worktree was clean at this source commit.
- The page now has eight tenant-scoped live summary metrics, a 7/30-day attendance chart, metric search, CSV download, and pending-work shortcuts. Counts follow the tenant's local date and use explicit stored status/mode values and approved leave. Desktop and 375px captures and browser checks are committed.

## Changes since the 14:20 Drive source snapshot

Compared tracked files with the original Drive checksum manifest (`SOURCE_FILES_SHA256SUMS.txt`, Drive file `1V97tsvIgpbElDrOjz3NNTwTXc1kMTst_`; the snapshot listed 91 Main and 58 Candidate files):

- Main HRIS: 9 existing files have changed hashes; 25 tracked files are new; none disappeared.
- Candidate Portal: 0 existing files have changed hashes; 1 tracked file is new (`.env.example`); none disappeared.
- Current Main implementation commit `5e935f5` adds 11 files/paths: 396 insertions and 75 deletions, including two dashboard evidence images. Relative to the prior local source checkpoint `86ce4e6`, the entire intervening branch diff is 14 paths, 474 insertions and 75 deletions; that count also includes the earlier checkpoint/phase-ledger records. No GitHub push or deployment occurred.

The changed existing Main files are `docs/phase-2/APPROVAL_RESOLUTION_ISOLATED_TEST_PLAN.md`, `src/live/LiveApp.tsx`, `src/live/LiveHrisWorkspace.tsx`, both `supabase/staging/approval-resolution/20261012_04_*` and `20261012_05_*` SQL files, `tests/browser/system-workspace.spec.ts`, and the three approval/live-workspace/phase1 contract files. New tracked Main files are `.env.example`; the employee-leave mobile and managerial-dashboard desktop/mobile evidence images; `docs/programme/APPROVED_BUSINESS_RULES.md`, `CANONICAL_USER_STORY_MATRIX.json`, `CURRENT_SOURCE_MANIFEST.md`, `DEFECT_AND_ROOT_CAUSE_LEDGER.md`, `EXECUTION_CHECKPOINT_20261012_1610.{md,json}`, its checksum file, `FINAL_RELEASE_ACCEPTANCE.md`, `FRONTEND_BACKEND_INTEGRATION_MATRIX.md`, `FROZEN_COMPONENT_REGISTER.md`, `LOCAL_CHECKPOINT.md`, `MASTER_PHASE_LEDGER.md`, `REGRESSION_LEDGER.md`, `SECURITY_AND_RLS_MATRIX.md`, `SQL_CONTRACT_REGISTRY.md`, `SUPABASE_SECURITY_ADVISOR_20261012.md`; the tenant-membership migration; the employee-leave and managerial-dashboard browser specs; and the isolated Auth fixture and runner. The one new tracked Candidate file is `HRIS-Candidate-v2/.env.example`.

## Verification since the Drive snapshot

Latest verified runs:

- `npm run check`: TypeScript PASS; contracts **26/26 PASS**; Vite build PASS (existing large-chunk warning, 676.75 kB JS output).
- Free isolated local Supabase Auth/RLS suite: **43/43 PASS, 0 failed**, using synthetic Auth identities in two tenants. No production data or permissions were changed.
- Full Chromium browser suite: **36/36 PASS, 0 failed**. After the final tenant-timezone dashboard adjustment, the focused dashboard suite was rerun: **2/2 PASS, 0 failed**.
- `git diff --check`: PASS.
- The earlier 16:10 checkpoint recorded 42/42 isolated checks, 24/24 contracts and a 1/1 mocked mobile leave smoke. During subsequent fixes, an initial SQL attempt was 41/43 (test fixture/date setup, corrected), and one browser run was 35/36 (stale generic workspace expectation, corrected). The final counts above supersede those attempts. A transient TypeScript assertion and stale contract expectation were also corrected before the final passing check.

## Five prior tenant-security failures

The 14:20 checkpoint did not preserve their original test IDs. The corresponding current isolation checks all pass in the 43/43 run:

1. Tenant B manager cannot read Tenant A attendance.
2. Tenant A manager cannot read Tenant B attendance.
3. Tenant B manager cannot call Tenant A dashboard, attendance or leave RPCs.
4. Tenant B manager cannot approve Tenant A leave.
5. Tenant B manager cannot approve Tenant A attendance.

Authorization now resolves the permission role through the active tenant membership; global role assignment by itself grants no tenant access.

## Story and release status

- Canonical 1,047-story catalogue: **0/1,047 fully implemented and tested against canonical acceptance; 1,047 pending/unreconciled**. The available `CANONICAL_USER_STORY_MATRIX.json` is an empty tracking skeleton (`stories: []`, mapped: 0, accepted end-to-end: 0), not the authoritative catalogue. This does not mean no implementation work has been completed.
- Active release blocker: the canonical story rows/criteria remain inaccessible. The expected GitHub recovery returned 403 for the suspended account and prior Drive/local searches did not find the canonical file. Do not invent IDs or mark stories accepted.
- No blocker prevents continuing functional page work. The next executable action is to continue the next Figma-aligned HRIS role/module using verified existing contracts while recovering the canonical catalogue. Remaining schema/function security review, Candidate public-surface acceptance, full Figma and accessibility acceptance, and release certification are open.
- Supabase hosted branch cost lookup was unavailable; testing used the free local scratch stack. No paid service, production mutation, final source archive, GitHub push, or deployment was performed.

## Drive preservation

The existing target is `HRMIS Preservation 2026-10-11` (`1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`). Prior local recovery records document that the connected account owns it and a temporary upload/readback verified write access. Preserve prior files; add new versioned checkpoint records only. The final full source archive must still be uploaded and read back with integrity verification before the final GitHub push.
