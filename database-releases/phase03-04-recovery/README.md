# Phase 03/04 migration recovery — 20 October 2026

**DATABASE DEPLOYED at 20261020043721. Hosted catalog parity 26/26; hosted security 17/17; negative database-role checks 7/7.** Signed-in production HTTP journeys remain NOT EXECUTED; overall Phase 03/04 acceptance is not declared. See deployment-receipt.json and release-status.md.

## Target and ownership
Project hrmis-saas: `oslgwxaqfbteqtwqvdzs`; organization `qdcgrdntvspjsdszuzmy`.
Use existing HRIS connector `link_6ac07a13790c81919fcc5f7af6dbcef9`.
This migration branch owns production submission; PR #36 owns independent application work.
No frontend or original staging SQL was modified. Do not submit concurrent production migrations.

## Inventory and order
Apply **one** forward compatibility package: [phase03_phase04_hosted_compatibility.sql](phase03_phase04_hosted_compatibility.sql).
SHA-256 `fa390e603bb08ad2417e11d627304cce2197ad003aa44c4f097cc7ea1dcf82ed`, 228160 UTF-8 bytes.
[inventory.json](inventory.json) lists 22 ordered source fragments, six missing tables and 55 distinct function names (46 absent; nine names with existing signatures).
Counts are names, not overload-equivalence claims.
Source commit `c62e05244d0662646289e75c4f699f1e1728014d`; original blob `5f62ab8e3bd8311306bb6cff0bbd89a918f6cd63`.
Do not replay historical migrations: their identities diverge from production.
Do not separately apply optional-module SQL: it is already included after dependencies.
The Phase 12 notification-feed rewrite remains deferred.

## Source correction
The old package calls `hris_can_read_learning_catalog(uuid)` but production and the package lack its definition.
The exact helper and ACL from `supabase/migrations/20261013153500_hris_learning_employee_self_service.sql` are now included before learning-completion dependencies.
It requires a live session, active tenant and established employee/tenant permission. Anonymous execution remains revoked.

## Live evidence
[catalog-read-only.sql](catalog-read-only.sql) reproduces [production-catalog-20261020.json](production-catalog-20261020.json):
114 migrations, head 20261019100443; 91 relations, 1075 columns, 256 functions, 133 policies, 491 constraints.
These are schema metadata; no user/employee rows or credentials were exported.
Confirmed postgres CREATE privileges and history SELECT/INSERT/UPDATE.
Confirmed one eligible active Super Admin, one active membership, no second-administrator active membership.
hr_admin retains organization.manage only; legacy system role retains 45 grants.
Hosted Gate B actually executed: **0/26**.

## Rehearsal
Use only the approved disposable Actions/local Supabase stack.
Original package had prior verified run [39233720052](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39233720052): 336 contracts, 56 browser tests, 367/367 local Auth/RLS, 26/26 local parity, rollback fingerprints, no security-advisor issues.
A fresh rerun and corrected-package workflow are being collected.
New `tests/sql/hosted-parity/run-recovery.mjs` removes the missing helper before applying the corrected transaction, checks its restored ACL and null-tenant rejection, rolls back, and compares Auth/data/schema/policy/grant fingerprints.
This is synthetic source-shaped rehearsal; the resolver is already installed, so the existing harness does not exercise every production-first-install topology branch.
Do not call this hosted acceptance.

## Submission diagnosis
Working postgres reads and privileges do not prove connector write scope.
Earlier `Invalid or expired requestState` remains an operation/state failure until fresh evidence says otherwise.
Do not infer a payload limit, invent credentials or make meaningless test migrations.
Existing CLI run [39292936014](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39292936014) had empty SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD, stopping before database connection.
No working authorized CLI fallback is established. Never transfer connector credentials.
The isolated CLI workflow also needs history reconciliation proven before use against the 114 existing records.

## Deployment
1. Reserve sole migration ownership; confirm no competing migration is active.
2. Verify package hash, corrected rehearsal, required protections and recovery readiness.
3. Revalidate exact target, history head, expected missing objects, notices-policy baseline and administrator topology.
4. Preserve restorable definitions/ACL/policies for replaced objects; a catalog digest is not a backup.
5. Submit exact reviewed SQL once through authenticated apply_migration; capture outcome and native history identity.
6. If requestState fails, stop submission and recheck history/object state before any further action.
7. Never use production execute_sql for DDL, manually add migration history, or split transaction commits.
8. Require exactly the intended new history row and schema. Execute all 26 hosted parity checks.
9. Execute signed-in API/RLS/tenant-isolation and Super Admin restrictions. Record actual counts and update PR #36.

## Recovery
The package retains one BEGIN/COMMIT, lock_timeout 5s, statement_timeout 120s, advisory transaction lock, fail-closed pre/postflight, and identity/grant/audit fingerprints.
Before commit, require native rollback on SQL error and verify history/object state.
A transport error is not proof of rollback.
After commit, use a reviewed forward corrective migration; preserve history and populated tables.
No broad destructive reverse migration is authorized. Verified restorable pre-change definitions/recovery mechanism and first-install rehearsal remain release gates.
Preserve the sole Super Admin, the unassigned second administrator, all audit history and tenant isolation.

## Verified release update
The single fresh apply_migration operation succeeded; no requestState error recurred. Native history now has 115 entries and the exact SQL size/MD5 matches the reviewed package. The server-generated migration is exported under supabase/migrations/20261020043721_phase03_phase04_hosted_compatibility_recovery_20261020.sql; its version was read from production, not invented.
First-install, failed-transaction rollback, protected-topology rejection and replay passed in run 39370270132. All 55 package function names and six new RLS-enabled tables now exist. Sole Super Admin, minimal role and unassigned second administrator remain preserved. Pre-change definitions are retained. No further migration is pending for this reviewed package. Do not replay either the old staged compatibility SQL or the exported applied migration.
