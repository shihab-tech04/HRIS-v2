# Local Implementation Checkpoint

**Date:** 2026-10-14 08:36 Asia/Dhaka. **State:** active, incomplete; Main and Candidate changes are locally committed on their recovery branches. **Release:** NOT FOR RELEASE.

## Current checkpoint — Candidate live job alerts and matching notifications

- Candidate latest commit: `92b4481d3500ef6a0e69af6096d1bb3db7531854`. Main runtime code remains unchanged; this checkpoint updates Main programme records only.
- Candidate alerts persist verified filter fields, apply owner-scoped RLS, match the existing production `Instant` trigger and produce in-app notices with persisted read state and vacancy navigation. Save/load failures recover through retry. The prior saved-jobs and application journeys passed in the integrated run.
- Acceptance: Candidate disposable Auth/Postgres/browser **171/171 PASS**; route tests **20/20 PASS**; TypeScript/build/syntax/diff checks pass. Four Bun-based static test files were not executable because Bun is unavailable; supported Candidate integration and route suites passed.
- Phase 10/11 Main project-task-peer-review work remains preserved from the prior **208/208** checkpoint; the next functional batch returns to the user's approved peer-review eligibility workflow. No production changes, paid services, GitHub push, or deployment.
- Canonical story count: **0/1,047 mapped and accepted; 1,047 pending** exact source bytes and story-level evidence.
- Details: `EXECUTION_CHECKPOINT_20261014_0836.md`; evidence: `ACCEPTANCE_EVIDENCE_20261014_0836.md`; current ledger: `MASTER_PHASE_LEDGER.md`.
- A new versioned Drive archive and preservation receipt are pending after the Main records commit; older archives will remain intact.

## Current checkpoint — persisted Candidate application history

- Main feature commit: `74516ea07781deb1569f7ee957e573fdca0e6282`. Candidate feature commit: `0262a5bc6c327064fcc048dddcbf515eaf10a8a2`.
- Candidate application tracking now renders backend-persisted stage history. The initial candidate application writes a first history event transactionally; existing interview and offer events appear after refresh. Recruiter notes and actor identities remain excluded from the candidate payload. No fixed screening milestone is fabricated.
- Acceptance: Candidate disposable local Auth/Postgres/Storage/browser journey **137/137 PASS**; Candidate route/contracts **20/20 PASS**; Candidate TypeScript/build PASS; Main TypeScript, **122/122 contracts**, and build PASS. Phase 10/11 Auth/Postgres/RLS/browser **206/206 PASS** remains from the previous unchanged checkpoint.
- No production SQL, data, Auth entries, permissions, paid services, GitHub push, or deployment changed. The feature migration has only run against the disposable local Candidate stack.
- The recovered 1,047-story catalogue was not mapped in this slice; no story IDs or acceptance counts were inferred.
- Versioned records: `EXECUTION_CHECKPOINT_20261014_0709.md`, `ACCEPTANCE_EVIDENCE_20261014_0709.md`, and the current `MASTER_PHASE_LEDGER.md`. The new Drive checkpoint will be uploaded and read-back verified before this batch is considered preserved remotely.
- Continue the next independently executable business journey. Keep authority-gated payroll/appraisal/expense/service-resolution/employee-conversion decisions blocked until verified rules are available. Do not push or deploy before full acceptance and verified Drive backup.

## Previous checkpoint — Phase 10 Teams directory and filtered CSV export

## Historical checkpoint details — Phase 10 Teams directory and filtered CSV export

- Latest feature commit: `a2834b6550d2f42c56c94c1ace066d99f6b4e6a1`; Phase 10's tenant-filtered Teams directory now exports only visible filtered rows through the shared spreadsheet-safe CSV utility.
- Verification: TypeScript/build PASS, **45/45 contracts PASS**, focused browser **2/2 PASS**, full Chromium **41/41 PASS**, latest unchanged-SQL local Auth/RLS **77/77 PASS**, prior tenant-security cases **5/5 PASS**, and `git diff --check` PASS. Current source diff from baseline `4ded5f13f1ef2bf17237f347bfac9811283c52dc`: **32 unique paths, +8,550/-51**. Browser-generated screenshots were restored.
- Canonical story acceptance remains **0/1,047 mapped and accepted; 1,047 pending**. The current Project `sources/` mount is empty; exact-name Project/Drive lookup did not return canonical bytes. Only the local `stories:[]` skeleton is visible (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`; expected canonical SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`). No story text or IDs were inferred.
- Current live schema has `teams` and `departments` with RLS and authenticated SELECT only; no projects/project-assignments table or write grant. The timesheet reviewer remains default-deny pending verified tenant-scoped project-lead mapping and permission. No hosted writes, paid services, GitHub push or deployment occurred.
- Drive preservation records were appended to the owner-verified folder; all five versioned checkpoint records and the receipt read back exactly. Receipt file ID: `1fHYfbGHPFvo8aDVNjY_OkCqwfTmLEBiX`.
- The 06:51 implementation checkpoint and evidence were appended to the same owner-verified folder; five versioned records and their receipt read back exactly. Receipt file ID: `10I-8V-yeVL0ZnF0qijuYYmtyNo5Hk0aQ`.
- See `EXECUTION_CHECKPOINT_20261013_0651.md`, `ACCEPTANCE_EVIDENCE_20261013_0651.md`, and `MASTER_PHASE_LEDGER_20261013_0651.md`. Complete acceptance, verify the full-source Drive archive, then push and deploy last.

## Previous checkpoint notes

## Previous checkpoint — Phase 09 manager leave queue

- Latest implementation commit: `560562a6242c1971da3453942c06a8525fe8c890` adds live leave-queue search across employee/type/date/status, a status filter based on returned tenant statuses, and an accessible filtered-empty state. It preserves the existing permission-gated `admin_resolve_leave_request` flow and tenant-scoped read RPC. The page uses tenant/request sequence guards so stale loads or decisions cannot replace the active tenant's rows.
- Current verification: `npm run check` passes TypeScript, **43/43 contracts**, and Vite build. The full synthetic Chromium suite passes **39/39**; the new focused manager-leave journey passes **1/1**. Latest isolated local Auth/RLS result remains **69/69 PASS** from the preceding backend-only checkpoint; all five prior tenant-security cases pass, and no SQL changed in this leave UI slice. The two initial browser assertion failures were test expectations that tried to find approved/rejected rows while the Pending filter was still active; expectations now clear the filter before checking resolved rows.
- Since the 14:20 baseline, Main `src`, `tests`, and `supabase` contain **28 files changed, +7,133/-51**. New since the 23:08 checkpoint: `src/live/LiveHrisWorkspace.tsx`, `tests/contracts/live-workspace.test.mjs`, and `tests/browser/manager-leave.spec.ts`. The source/test change is committed locally; generated browser screenshots were restored.
- The owner reports that the recovered catalogue is in Shihab UX Project sources, but the current mounted `sources/` directory contains zero files. The exact-name Google Drive metadata search also returned no matrix. The repository file remains the empty tracking skeleton (SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`), not the expected `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. **0/1,047 stories are mapped and accepted against authoritative text; 1,047 remain pending source visibility and story-level acceptance.** No requirement text or IDs were inferred.
- Read-only production metadata also found no `roles` IDs matching allowed membership values `hr_admin`/`hr_recruiter`, and zero tenant membership rows. Branch pricing lookup remains unavailable. These are release-readiness blockers; no production data, permissions, Auth settings, or paid services changed.
- New versioned records from the 23:08 checkpoint were uploaded into `HRMIS Preservation 2026-10-11`; Drive readback SHA-256 matched all five local records. The upload receipt was also uploaded. Older archives remain untouched; the 18:56 source archive is not final.
- No GitHub push or deployment. Continue the Phase 09 and Phase 08 functional journeys, then move into the next module defined by recovered source/contracts. Keep story mapping pending until the expected-hash source is accessible. Complete and verify the product before the final Drive archive, GitHub push, and deployment.

## Historical detail from the 17:50 checkpoint

## Verified source and code

- Main remote `main` base: `4ded5f13f1ef2bf17237f347bfac9811283c52dc`; recovery work is committed on local-only branch `codex/recovery-checkpoint-20261012`.
- Candidate remote `main` base: `1c04786a72c3920c7ebb4a607ad5ac56d7b55f63`; recovery work is committed on local-only branch `codex/recovery-checkpoint-20261012`.
- Main: live permission-gated HRIS workspace, tenant-scoped manager RPCs, employee self-service, private leave request flow, Figma-aligned Personal Leave balance/history/year-filter/export page, attendance correction request/history/manager decisions and a tenant-scoped Shift roster with manager-only assignment creation. The tracked tenant-membership, roster read and assignment migrations remain local release candidates and have not been applied to production.
- Candidate: submitted vacancy search and stale-response fixes; production build is public-only.
- Main `npm run check` passed (TypeScript, 29/29 contract tests, Vite build). Candidate lint, four contract tests, and public-only build passed at the previous checkpoint; Candidate is unchanged. Main retains the >500 kB chunk warning; Candidate has a Vite config-loader warning.
- Full Main Chromium suite passed 38/38 after the Personal Leave page; its targeted employee-leave journey passed 1/1 and covers year filter, CSV filename, navigation and mobile overflow. The Shift roster journey passed 1/1 and covers tenant RPC payloads, filters, CSV, navigation, manager assignment success/duplicate recovery, mobile table scroll and no page overflow. All browser service calls are mocked and external requests are blocked.
- The isolated local Supabase Auth/RLS suite passed 55/55 checks using eight synthetic Auth users across two tenants, including two separate tenant-A managers for concurrent decisions. It exercised effective RPC ACLs, membership role IDs, tenant denial, global-role-only denial, employee own summary/correction submission/history, roster reads and manager assignment create/duplicate/tenant denials, termination and session revocation, private evidence storage, leave submission/approval, attendance correction variants, audit, balance rollback and concurrency. The tracked candidate migrations and both exact staged approval SQL files were applied only to the scratch stack. Test runner: `tests/sql/isolated-auth/run-local.mjs`.
- Ordinary linked employees use `hris_get_my_dashboard_data(uuid)` and may submit leave through `hris_employee_submit_leave_request(uuid,jsonb)` and attendance corrections through `hris_employee_submit_attendance_correction(uuid,jsonb)`. The legacy employee RPCs remain unchanged and are not used by the new personal workspace.
- A follow-up read-only production inspection confirmed own-row RLS for `employees`, `leave_requests`, and `leave_types`, while attendance and leave-balance policies still use the active-admin resolver. The `holidays_read` policy has no tenant predicate; current UI reads stay on tenant-scoped RPCs. No database settings or data were changed.
- Supabase security advisors reported 20 tenant-keyed tables with authenticated reads not scoped by tenant, 207 authenticated-executable SECURITY DEFINER functions, one anon Candidate jobs source, 24 RLS-enabled tables without policies (no anon/authenticated SELECT grants), and leaked-password protection disabled. Details and exact table list are in `docs/programme/SUPABASE_SECURITY_ADVISOR_20261012.md`.
- `release/2026-10-12/CHECKPOINT_STATUS.md` and `CHECKPOINT_MANIFEST.json` contain full checkpoint evidence; archive is `HRIS360_RECOVERY_CHECKPOINT_20261012_NOT_FOR_RELEASE.zip`.

## Unresolved inputs / environment

- The user reports that the recovered Project catalogue has 1,047 stories, 153 modules and expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The current mounted Project `sources/` directory contains zero files; filename search across local Project/attachment paths and connected Drive returned only the empty tracking skeleton, not the recovered source. Catalogue-level mapping remains 0/1,047; 1,047 pending verified source access and story-by-story acceptance. No IDs or criteria have been inferred. The expected GitHub read returned HTTP 403 for a suspended account.
- Supabase `get_cost` was attempted for the user-selected organization `qdcgrdntvspjsdszuzmy` and returned `UNAVAILABLE` because the connected MCP server did not expose that method. No paid branch/service was created; the free isolated local scratch stack was used instead. The separate older `colima-t` Auth runtime was left untouched.
- Supabase currently lists no development branches for `hrmis-saas`, so there is no existing isolated branch to reuse.
- An earlier automatic review rejected replacing the existing Drive archive; that file was not changed. The connected account owns `HRMIS Preservation 2026-10-11`, and a temporary file uploaded to and read back from that folder with matching content before being deleted. Destination write access is verified; the final versioned archive and its integrity check remain pending full acceptance.
- A focused Chromium mobile leave-flow smoke passed at 375×812 with all Auth/database/storage calls mocked, external requests blocked, and modal scrolling checked above the sticky footer. No real authenticated browser account, password-recovery email journey, or React-to-Figma role-specific comparison has been executed.

## Exact next actions

1. Continue Phase 09 from the committed Personal Leave page; pursue the reported source through refreshed Project sources and verify its exact SHA before mapping story IDs. The current mounted source is empty, so no IDs are inferred.
2. Continue the next functional flow only where current schema/business rules and available Figma references define the journey; the roster-specific Figma frame is still unavailable.
3. Complete authenticated browser, Figma visual, EN/BN, accessibility, responsive, password-recovery and remaining module acceptance.
4. Reconcile the production migration history and remaining exposed tenant-keyed tables, SECURITY DEFINER functions, Candidate public columns, and Auth settings.
5. Verify destination ownership and upload permission, then create and round-trip-check a versioned final Drive archive only after acceptance is complete. Push/deploy only after the final source, archive, commits and built assets match and all release gates pass.
