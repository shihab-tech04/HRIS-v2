# Local Implementation Checkpoint

**Date:** 2026-10-12. **State:** active, incomplete; Main has uncommitted implementation changes on its local recovery branch. **Release:** NOT FOR RELEASE.

## Verified source and code

- Main remote `main` base: `4ded5f13f1ef2bf17237f347bfac9811283c52dc`; recovery work is committed on local-only branch `codex/recovery-checkpoint-20261012`.
- Candidate remote `main` base: `1c04786a72c3920c7ebb4a607ad5ac56d7b55f63`; recovery work is committed on local-only branch `codex/recovery-checkpoint-20261012`.
- Main: live permission-gated HRIS workspace, tenant-scoped manager RPCs, employee self-service and leave request form. The new tenant-membership migration remains a local release candidate and has not been applied to production.
- Candidate: submitted vacancy search and stale-response fixes; production build is public-only.
- Main `npm run check` passed after the current implementation (TypeScript, 24 contract tests, Vite build). Candidate lint, four contract tests, and public-only build passed at the previous checkpoint; Candidate is unchanged. Main retains the existing large-chunk warning; Candidate has a Vite config-loader warning.
- The isolated local Supabase Auth/RLS suite passed 42/42 checks using eight synthetic Auth users across two tenants, including two separate tenant-A managers for concurrent decisions. It exercised effective RPC ACLs, membership role IDs, tenant read/write denials, global-role-only denial, own employee summary, termination and session revocation, private evidence storage, leave submission/approval, attendance correction variants, audit, balance rollback and concurrency. The tracked prior anonymous-revoke migration, consolidated candidate migration and both exact staged approval SQL files were applied only to the scratch stack. Test runner: `tests/sql/isolated-auth/run-local.mjs`.
- Ordinary linked employees now use `hris_get_my_dashboard_data(uuid)` and may submit requests through `hris_employee_submit_leave_request(uuid,jsonb)`. The legacy employee RPCs remain unchanged and are not used by the new personal workspace.
- A follow-up read-only production inspection confirmed own-row RLS for `employees`, `leave_requests`, and `leave_types`, while attendance and leave-balance policies still use the active-admin resolver. The `holidays_read` policy has no tenant predicate; current UI reads stay on tenant-scoped RPCs. No database settings or data were changed.
- Supabase security advisors reported 20 tenant-keyed tables with authenticated reads not scoped by tenant, 207 authenticated-executable SECURITY DEFINER functions, one anon Candidate jobs source, 24 RLS-enabled tables without policies (no anon/authenticated SELECT grants), and leaked-password protection disabled. Details and exact table list are in `docs/programme/SUPABASE_SECURITY_ADVISOR_20261012.md`.
- `release/2026-10-12/CHECKPOINT_STATUS.md` and `CHECKPOINT_MANIFEST.json` contain full checkpoint evidence; archive is `HRIS360_RECOVERY_CHECKPOINT_20261012_NOT_FOR_RELEASE.zip`.

## Unresolved inputs / environment

- The user-supplied master implementation directive is available and remains authoritative. The original 1,047-row story ledger is not available. The expected GitHub read returned HTTP 403 for a suspended account; Drive/local recovery searches found no canonical story file.
- Supabase `get_cost` was attempted for the user-selected organization `qdcgrdntvspjsdszuzmy` and returned `UNAVAILABLE` because the connected MCP server did not expose that method. No paid branch/service was created; the free isolated local scratch stack was used instead. The separate older `colima-t` Auth runtime was left untouched.
- Supabase currently lists no development branches for `hrmis-saas`, so there is no existing isolated branch to reuse.
- An earlier automatic review rejected replacing the existing Drive archive; that file was not changed. The connected account owns `HRMIS Preservation 2026-10-11`, and a temporary file uploaded to and read back from that folder with matching content before being deleted. Destination write access is verified; the final versioned archive and its integrity check remain pending full acceptance.
- A focused Chromium mobile leave-flow smoke passed at 375×812 with all Auth/database/storage calls mocked, external requests blocked, and modal scrolling checked above the sticky footer. No real authenticated browser account, password-recovery email journey, or React-to-Figma role-specific comparison has been executed.

## Exact next actions

1. Recover original story IDs/criteria from an authorized source. Do not fabricate them; the known GitHub account is suspended and prior Drive/local searches found no canonical ledger.
2. Continue phase-by-phase implementation from current verified contracts, updating the phase ledger and integration matrices with evidence and explicit limits.
3. Complete authenticated browser, Figma visual, EN/BN, accessibility, responsive, password-recovery and remaining module acceptance.
4. Reconcile the production migration history and the remaining exposed tenant-keyed tables, SECURITY DEFINER functions, Candidate public columns, and Auth settings.
5. Verify destination ownership and upload permission, then create and round-trip-check a versioned final Drive archive only after acceptance is complete. Push/deploy only after the final source, archive, commits and built assets match and all release gates pass.
