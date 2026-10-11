# HRIS-v2 Phase 2A — verified baseline and staged contract

**Baseline** main 80f2a98876081850124b5252bd96a83ebcaf4468, 2026-10-11.
**Database** hrmis-saas / oslgwxaqfbteqtwqvdzs, read-only inspection; 89 public tables all with RLS.
**Status** STAGING CONTRACT PREPARED, NOT APPLIED OR SECURITY CERTIFIED.

## Existing behavior and defects

- src/live/LiveApp.tsx: authenticated, read-only Supabase integration.
- src/views/admin/TenantSettings.tsx and OrgStructureAndRoles.tsx: fixtures/simulation; **not** live SQL saves.
- At inspection: 1 tenant, 0 memberships, 2 admins (1 active platform super-admin), 5 employees, 4 roles, 1 user-role binding.
- tenants has unique code and slug, plus timezone; no locale column.
- user_roles PRIMARY KEY(user_id) only permits one *global* role per user; tenant_memberships only allows hr_admin/hr_recruiter.
- has_permission(text) uses globally stored role grants. Phase 1 hris_admin_can_read_tenant confines legacy admin reads to Synesis; it cannot certify multi-tenant RBAC.
- tenant_memberships has a first-admin bootstrap policy for a Synesis email domain. Its safety needs separate review.

## Staged engineering

- supabase/staging/phase2a/tenant_provisioning.staging.sql is deliberately **outside** production migrations.
- Checks existing, active platform super-admin AND live session on server. No public self-registration or browser-supplied super-admin grants.
- Atomic create of inactive tenant, existing activated administrator membership, and server-authored audit row.
- Protected tenant-list, metadata update and admin assignment/revocation RPCs; explicit authenticated EXECUTE, revoked from PUBLIC and anon.
- New tenants stay INACTIVE until the system-wide RLS and privileged RPC reviews are complete.
- src/live/platformTenantApi.ts is an unmounted adapter; it requires deliberate staging VITE_ENABLE_PLATFORM_TENANTS=true. No production route or preview behavior changed.

## Stage tests — NOT EXECUTED

1. Use a disposable isolated PostgreSQL/Supabase project with real synthetic Auth identities. Existing hrmis-saas is production and must not be the test environment.
2. Apply the staging SQL; verify function definitions, execute grants, security advisors, no altered pre-existing records.
3. Platform session: create tenant → inactive record → admin membership → audit → reload → metadata update → database read-back.
4. Negative cases: unauthorized employee, another tenant administrator, anonymous caller, direct RPC attack, revoked/expired sessions, duplicate code/slug and invalid timezone. Confirm atomic rollback and no leaked records.
5. Assign/revoke admin, block last-admin removal, verify actor/target in audit and concurrency.
6. Run old Phase 1 tests at all nine widths, EN/BN and accessibility, then add real authenticated staging browser journeys.

## Open/blocked items

- Tenant activation/deactivation remains **BLOCKED** until comprehensive tenant-scoped authorization/RLS is ready (2C); hiding a menu is not a backend denial.
- UI controls for platform tenants are not enabled until staging RPC passes; no fake Save success.
- Invitations and account creation (2B), generalized multi-role RBAC (2C), module engine (2D), masters (2E), workflow engine (2F), audit certification (2G) are not claimed.
- Production database schema/data and previously solved Phase 1 UX remain untouched.
- Rollback staging functions only after reviewing dependencies; preserve locale data unless separately approved.
