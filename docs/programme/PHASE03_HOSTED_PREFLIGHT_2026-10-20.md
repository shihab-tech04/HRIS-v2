# Phase 03/04 hosted preflight — 20 October 2026

**Project:** `oslgwxaqfbteqtwqvdzs` (`hrmis-saas`), organization `qdcgrdntvspjsdszuzmy`  
**Source checkpoint:** Main `development/hris-checkpoints` at `eef995cb6300f97f0e819d698fde6bdc3fc733b5`  
**Phase state:** Phase 03 remains in progress and not accepted. No production schema or data mutation was made during this preflight.

## Hosted read-only verification

- Project identity matched the authorized HRIS project; status `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.002`, region `ap-northeast-1`.
- Migration history contains **114** records through `20261019100443 hris_restore_expense_travel_links_source_parity`. The target Phase 03/04 compatibility transition is absent.
- The read-only catalog query returned column/relation fingerprint `b4aa7bcff919b603051626b7688c92fa`. All six target tables are absent: `tenant_module_settings`, `learning_completion_events`, `learning_completion_notifications`, `travel_request_notifications`, `roster_change_notifications`, and `employee_shift_assignment_changes`.
- Administrator topology: **2** active administrator records, exactly **1** active platform Super Admin, **0** active tenant memberships for the other active administrator, and **45** existing global permission grants for that administrator. Audit history remains at **60** rows; latest recorded audit timestamp is `2026-10-19T02:48:48.215247Z`.
- Decision recorded: keep the second administrator unassigned. Do not add tenant membership or automatically activate those 45 permissions within the tenant. Preserve Shihab as sole platform Super Admin.

## Latest hosted acceptance test

The exact version-controlled checker `tests/sql/hosted-parity/check-read-only.sql` (blob `5ef2ab35f6299c5e578eedfcb30d757fd2381db1`) ran read-only against the authorized production project. **Gate B is 0/26.** The failures are the expected pre-transition Phase 04 dependencies: required RPC signatures, internal shift trigger, prerequisite helper functions/tables, retired tenant-implicit overloads, and the two required tenant-scoped RLS policies. This is a preflight failure for release readiness, not evidence that the target migration partially ran.

## Migration and deployment-path integrity

- Exact staged SQL: `supabase/staging/phase03/20261019_phase03_phase04_hosted_compatibility.staging.sql`, blob `5f62ab8e3bd8311306bb6cff0bbd89a918f6cd63`, **227,243 characters**. It has a single explicit transaction, fail-closed identity/topology checks, preserved-record fingerprints, and a 26-check postflight.
- Existing disposable CI rehearses the migration and checks full rollback restoration of Auth, administrator/audit rows, memberships, grants, catalog objects, policies, functions, triggers and indexes. The previously recorded full isolated acceptance run `39204728878` passed at `98e97a8627106ae2b0e56b7b9199b5e523a8a564`; it is not hosted acceptance.
- Supabase CLI, `psql`, Docker and `gh` are unavailable in this workspace. GitHub's current Supabase CLI workflow initializes a disposable local project and does not deploy production migrations. The repository has 100 local migration files whose version identifiers do not reconcile with the 114 hosted history records. A plain `supabase db push` would be unsafe pending explicit history reconciliation, so it was not run.
- The prior authorized Supabase migration submission returned `Invalid or expired requestState`. It was not repeated. No alternate authenticated production migration path is currently available through the connected tools. The public application and production database remain unchanged.

## Exact next operation

Resolve the Supabase connector's migration-submission request-state failure or expose a supported, authenticated, history-reconciling deployment path for **this one exact staged migration**. Re-verify the project, fingerprint, history and administrator topology immediately before any write. After migration tracking is confirmed, run hosted Auth/RLS/API and application acceptance; deploy the Phase 03 frontend only if every release gate passes. Continue the source-backed Phase 05 work in parallel; do not infer acceptance from code presence or disposable evidence.
