# Phase 03 execution checkpoint — 2026-10-19

## Verified source and decision

- Canonical repository: `shihab-tech04/HRIS-v2`.
- Accepted development source: `development/hris-checkpoints` at `eef995cb6300f97f0e819d698fde6bdc3fc733b5`.
- Approved access decision: Shihab remains the sole platform Super Admin. The second administrator remains unassigned to any tenant; the existing 45 `hris_system_admin` grants remain unchanged.
- Hosted transition source: `supabase/staging/phase03/20261019_phase03_phase04_hosted_compatibility.staging.sql`, blob `5f62ab8e3bd8311306bb6cff0bbd89a918f6cd63`.
- Main release PR: #36, head `54d02e19be38abb5835a3984a1e7d1e244e3c5d8`, still open/draft. Public `main` and Pages deployment have not changed.

## Completed acceptance evidence

| Gate | Evidence |
|---|---|
| Main release bundle and browser | Run 39232250573, 37 Chromium checks passed on the release branch head |
| Phase 03 PostgreSQL module controls | Run 39233719988, success |
| Phase 2A/2B tenant provisioning | Run 39233720132, 89/89 Auth/RLS/browser assertions passed |
| Development build/contracts/browser/Auth/RLS | Run 39233720052, success on `eef995c`; TypeScript/contracts/build and browser steps passed; Auth/RLS 367/367 passed |
| Access-policy acceptance | Same run: tenant Super Admin notice access requires active membership; unassigned 45-permission global administrator is denied |
| Phase 04 parity | Same run: SQL/API parity 26/26 passed |
| Rollback and preservation | Same run: hosted compatibility rollback rehearsal passed with Auth, audit, grants, and schema fingerprints unchanged |
| Security advisor | Same run: “No issues found” |

## Production state

- Read-only preflight confirmed 2 Auth users and 2 active administrator records.
- Shihab is the only active Super Admin and has the active `hr_admin` membership in `synesis-it`.
- The second administrator has the `hris_system_admin` role with 45 permissions and no active tenant membership.
- `admin_audit_logs` remains at 60 rows; `expense_travel_links` remains at 0 rows.
- Source-parity migration `hris_restore_expense_travel_links_source_parity` applied successfully as a no-op verification at version `20261019100443`; hosted migration history now has 114 entries.
- The Phase 03/04 hosted transition was **not** applied. Post-error read-only checks confirmed no partial change: tenant authorization helpers, module settings, and the new notice membership guard remain absent; the legacy notice guard remains installed; both accounts and all 60 audit rows are intact.

## Current blocker and exact next operation

The Supabase `apply_migration` connector returned `Invalid or expired requestState` twice when submitting the accepted 227,243-character atomic transition: once after the default execution window and again after a 120-second window. Read-only database checks after each attempt confirmed no active query, no advisory lock, no partial DDL, and no migration record. The smaller source-parity migration succeeded through the same connector.

The next operation is to apply the exact hosted transition from the accepted source commit using the connected Supabase SQL Editor fallback, preserving the explicit `BEGIN`/`COMMIT` transaction. The browser-control policy requires user approval before falling back to browser control after repeated failure of the Supabase connector. After application, verify migration history, access/RLS behavior, dependency catalog, audit and account fingerprints, live API, then continue the PR #36 merge/deploy gates. Do not mark Phase 03 complete or publish the release until these checks pass.
