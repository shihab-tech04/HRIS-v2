# Phase 03 — Controlled tenant-role live transition; optional modules staged

**Checkpoint:** 19 October 2026 UTC. **Phase 03: IN PROGRESS, NOT ACCEPTED.**

## Live, narrowly accepted security change

The user approved a minimum tenant `hr_admin` role with only `organization.manage`, assigned initially only to the one already-verified platform Super Admin; the other legacy administrator's role and grants remain untouched.

- Hosted project: `oslgwxaqfbteqtwqvdzs` (HRIS). A migration named `phase03_minimal_tenant_admin_bootstrap_20261019` **succeeded** after a fresh read-only preflight.
- Transactional source: `supabase/staging/hosted-membership-transition/20261019_minimal_hr_admin_bootstrap.staging.sql`.
- Atomic conditions: precisely one active Synesis tenant; precisely one active, confirmed, non-banned, non-deleted platform Super Admin; no existing memberships or `hr_admin`; `organization.manage` permission and restrictive bootstrap policy present.
- The `hr_admin` role is active, editable (`is_system=false`), and has **one** grant: `organization.manage`. No attempt was made to copy `hris_system_admin` permissions or reassign the other legacy admin.
- One active Synesis tenant membership now points to that existing Super Admin Auth user. No Auth account was created, revoked or edited, and no new tenant was activated.
- The legacy restrictive membership policy remains. Its helper now also checks Auth account eligibility and existence of the configured minimal tenant role.
- A migration-actor-neutral admin audit record was appended (`PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED`). No personal email was included in the report.

**Hosted postflight:** `configurable_admin_roles=1`, `admin_permissions=["organization.manage"]`, `legacy_system_admin_grants=45`, `unchanged_other_admins=1`, `total_memberships=1`, `eligible_member_count=1`, `migration_audit_records=1`, `hardened_bootstrap=true`. The read-only query is `supabase/staging/hosted-membership-transition/postflight-read-only.sql`.

### Safety rehearsal

The migration passed a hosted-shaped, disposable PostgreSQL rehearsal plus nine fail-closed variants: duplicate Super Admin, unconfirmed/banned/deleted account, missing permission, conflicting role, pre-existing membership, unexpected tenant, missing restrictive policy. All rejected cases rolled back with no partial role, permission or audit writes. Synthetic source: `tests/sql/phase03/hosted_bootstrap_fixture.sql` and `verify_bootstrap.sql`.

Rollback, if ever required, must be a separate approved transaction gated to the exact migration audit and single membership; **do not** use a broad revert, delete unrelated legacy roles or remove the hardened bootstrap guard. Keep audit history intact with a compensating record.

## SA12 implementation staged but not published

The approved behavior is **deny all module writes while disabled, preserve all previously authorized reads**, without deleting records. New work is staging-only:

- `supabase/staging/phase03/tenant_optional_modules.staging.sql`: protected tenant-scoped module configuration table and platform-only read/write RPCs. Sparse configuration defaults to enabled for backward compatibility; every real change writes an admin audit record.
- Supported modules in this bounded stage: **Travel**, **Expenses**, **Learning**. `BEFORE INSERT/UPDATE/DELETE` tenant-row guards protect 13 module tables (14 module/table pairings because the shared expense/travel link is guarded by both). Updates check the old and new tenant IDs.
- Restrictive Storage policies protect Expense receipt and Learning completion-evidence uploads, edits and deletions. They leave existing Storage `SELECT` policies unchanged, and leave unrelated buckets unchanged.
- `src/live/platformTenantApi.ts`, `PlatformTenantWorkspace.tsx`: server-backed tenant module list and confirmed enable/disable actions, inside the existing feature-gated platform admin screen; the approved UI shell remains intact.
- Synthetic two-tenant SQL journeys cover independent enablement, cross-tenant update rejection, direct table writes, retained history, file access, unrelated storage bucket isolation, no-op audit, invalid module, non-Super Admin rejection, and no partial install on missing module table.
- Static contract tests: `tests/contracts/phase03-optional-modules.test.mjs`; isolated PostgreSQL 17 CI workflow: `.github/workflows/phase03-postgres.yml`.

**Hosted module backend was NOT applied.** As of this checkpoint, the live project lacks the necessary Travel/Expense/Learning RPCs even though their staged/versioned definitions exist locally. Some expected tables (`travel_request_notifications`, `learning_completion_events`, `learning_completion_notifications`) are also absent. The module-install transaction deliberately fails closed without all required tables. The frontend toggle remains behind `VITE_ENABLE_PLATFORM_TENANTS`; no website deployment was made.

## Checks and remaining release work

- Live-role transition: ten standalone PostgreSQL scenarios PASS; hosted postflight PASS.
- Module backend: disposable PostgreSQL two-tenant data + RLS + Storage journeys PASS; missing-table rollback PASS.
- Main TypeScript lint and isolated Vite bundle: PASS; static module contracts: PASS. Full programme and real browser acceptance still required.
- Original SA01-01..04 and SA12-01..03 story IDs remain **unaccepted**, pending exact-ID journeys with real Supabase Auth, hosted tenant isolation and audit observation.
- Phase 04 hosted Gate B remains blocked, previously **0/25 required checks**; source-vs-hosted migration identity is divergent. Do not blindly replay 99 local migrations over 112+ unrelated hosted records.
- Required next sequence: reconcile Phase 04 missing RPCs/tables/functions and obsolete overloads safely in disposable Supabase; run Phase 03/04 signed-in tenant-isolation, direct-table, RPC and cross-tenant negative tests; verify module Storage/bucket policies with GoTrue; certify accepted UI/screens; only then enable feature flags and publish a fully verified frontend.

**Release state:** no new Main/Candidate web build was published. The completed additive role security change is live; optional modules and the new platform-admin UI are not live. Neither Phase 03 nor Phase 04 is declared complete.
