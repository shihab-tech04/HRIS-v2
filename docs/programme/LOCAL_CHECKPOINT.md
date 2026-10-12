# Local Implementation Checkpoint

**Date:** 2026-10-12 18:32 Asia/Dhaka. **State:** active, incomplete; Main implementation is checkpointed locally on its recovery branch. **Release:** NOT FOR RELEASE.

## Current checkpoint — Phase 08 attendance report Team Name

- Latest feature commit: `a458865709c6dbee79091c193a6527c4d9789001` (tenant-safe Figma Attendance Report Team Name). Prior clock-in/out commit: `66d0a12b92f7dca38331848da82ab0d4da9acbf3`. Current verification: 35/35 contracts, TypeScript/build pass, focused Chromium 1/1, and 65/65 local Auth/RLS. The previous full Chromium suite was 38/38. Vite reports a 721.19 kB minified JavaScript chunk advisory.
- All five prior tenant-security failures still pass. No production data, SQL, permissions or Auth settings changed; no paid service, GitHub push or deployment was used.
- Since the 14:20 baseline, implementation/source/test changes total **23 paths, +6,051/−55**, excluding documentation and image evidence. The 18:20→18:32 code slice is 7 paths, +187/−18. See `EXECUTION_CHECKPOINT_20261012_1832.md` and `ACCEPTANCE_EVIDENCE_20261012_1832.md`.
- The user reports the recovered catalogue has 1,047 stories/153 modules and expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The current task's `sources/` mount is empty and Drive exact-name searches did not return catalogue bytes. Its SHA cannot be verified here; **0/1,047 are mapped and accepted, 1,047 pending**. The local JSON remains only an empty tracking skeleton.
- New versioned 18:32 Drive archive `Synesis_HRIS360_Attendance_TeamName_20261012_1832.zip` (file ID `113U00tgit2R1bJzLRh2u_kdxk5yFBUr1`) is **2,064,077 bytes**, SHA-256 `ca41903c194323698eec0d0adc2d25ccf8087146ac3907e0a81fbbbd423ed2f4`; Drive readback matched byte-for-byte and ZIP integrity passed. The connected `shihabshajib01@gmail.com` account owns the destination folder. Older Drive files remain in place. See `DRIVE_PRESERVATION_RECEIPT_20261012_1832.md`.
- Next: continue functional HRIS page work and local tenant/Auth regression coverage; map against canonical story IDs when the recovered Project source is visible to this task. Do not publish or deploy early.

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
