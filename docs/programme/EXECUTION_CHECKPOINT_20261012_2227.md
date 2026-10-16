# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-12 22:27 Asia/Dhaka  
**State:** active implementation checkpoint; not a release candidate.  
**Current phase:** Phase 08 — Attendance, shift, roster and time management.  
**Current module slice:** Shift Roster filter validation and Figma Attendance Team Name sort control.

## Implementation

- Latest Main feature commit: `84d71177d54da1bb42f3e3dc0c39e2fdce62adf8` (`fix: use Figma attendance sort icon`), on local-only branch `codex/recovery-checkpoint-20261012`. Previous implementation commit: `7060c371adc8f3e0794fde473a251c85aa70bbda`; the follow-up roster validation browser acceptance commit is `93e4c532378eadb8029a7d20187fba2e50476ebe`.
- Shift Roster From/To and employee/shift search now commit together through `Apply filters`. Invalid or reversed date drafts display validation and do not call the service; a later valid range recovers the roster. The tenant-scoped RPC, permission checks, assignment flow and duplicate protection are unchanged.
- Attendance Team Name sort now uses the exact Figma vector at file `XEXLe9J1oATlITS9I5u1P9`, node `17:28334`, imported locally at `src/assets/attendance-team-sort.svg` (2,433 bytes; SHA-256 `6bd9b4caf7c374fa9c7e4c7d7b40a8170d92151f8e7d7a5887c95f0a73a7f55e`). The control remains keyboard accessible and keeps the same accessible name and `aria-sort` states. The asset has no expiring Figma URL in source. Rendered report capture: `docs/evidence/attendance-report-desktop-20261012.png`.
- Since the 14:20 Main source baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`, implementation/source/test changes total **24 paths, +6,243/−55**, excluding documentation and evidence images. The exact path list is in this checkpoint's source diff: the prior 23 paths from `EXECUTION_CHECKPOINT_20261012_2216.md`, plus `src/assets/attendance-team-sort.svg`.
- Candidate remains clean at `a23bd58f35d8194551f46751e7c9b1938ab2b20e`. Main feature code is committed; this checkpoint's documentation will be committed separately.

## Verification

- `npm run check`: TypeScript PASS, **39/39 contract tests PASS**, Vite build PASS. Existing minified JavaScript chunk advisory: 726.66 kB.
- `HRIS_TEST_PORT=4248 npm run test:e2e`: full Chromium suite **38/38 PASS**; focused Attendance Report journey **1/1 PASS**. The roster journey covers no RPC for invalid drafts, valid apply recovery, filter payload, assignment and duplicate handling. The attendance journey checks the local Figma SVG and its rendered dimensions, accessible sorting, filtered/sorted CSV and mobile behavior. All browser service calls are synthetic; external requests are blocked.
- `node tests/sql/isolated-auth/run-local.mjs`: latest isolated local Auth/RLS result **65/65 PASS, 0 failed**. It ran at 22:15 after the roster feature commit; no SQL, Auth, RLS or permission code has changed since that run. No production mutation occurred.
- All five previous tenant-security blockers pass: both cross-tenant attendance read directions; tenant B denial for tenant A dashboard/attendance/leave RPCs; and denial of tenant A leave and attendance decisions.
- `git diff --check`: PASS. Transient verification failures were harness/threshold issues and are superseded by the final passing runs: an early contract attempt was 38/39 due a missing test-file reference, and the new SVG check initially used too-strict browser subpixel assertions. Both were corrected before the results above.

## Canonical stories and release

- The owner reports the recovered catalogue has **1,047 stories / 153 modules**, source-linked text, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.
- The current task's read-only Project `sources/` mount still contains zero files. Project/attachment filename searches found only `docs/programme/CANONICAL_USER_STORY_MATRIX.json`, the empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`). Exact-name/hash Drive searches returned checkpoint/preservation records, not the canonical source bytes. This conflicts with the reported recovery in Project sources; its hash and source-linked requirements remain unverifiable from this task.
- **0/1,047 stories are mapped and accepted against canonical criteria; 1,047 remain pending source visibility and story-level acceptance.** This does not count implemented product features. No story IDs/requirements were reconstructed and the matrix was not overwritten.
- No paid service, production mutation, GitHub push or deployment occurred. Release order remains full product acceptance → owner-owned Drive source archive with integrity readback → final GitHub push → deployment.

## Next action

Continue Phase 08 functional attendance/time journeys and Figma-aligned page work while preserving the passing tenant/Auth/RLS results. Reconcile story IDs and acceptance evidence when the recovered canonical bytes become visible in the task source mount.
