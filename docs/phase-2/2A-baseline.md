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

## Existing production security-advisor baseline (read-only, 2026-10-11)

- **24 INFO** findings: RLS enabled but no policies. These tables normally deny direct application access by default; this is a feature-access gap, not evidence of exposed data.
- **1 WARN**: `candidate_public_jobs_source()` is an anonymous-executable SECURITY DEFINER function. It may be intentional for public job discovery; verify its payload and filtering before changing it.
- **206 WARN**: authenticated-executable SECURITY DEFINER functions. This is a *review inventory*, not 206 proven vulnerabilities. Audit each privileged RPC's live-session, actor, tenant and permission checks before opening arbitrary SaaS tenants.

Relevant Supabase guidance: https://supabase.com/docs/guides/database/functions and https://supabase.com/docs/guides/database/database-linter.

## Independent corrective audit — 2026-10-11

- **Unchanged:** Phase 2A staging RPCs are not applied to production; production app does not mount its platform-tenant adapter.
- **Defect found and corrected in staged SQL:** administrator assignment used to replace `hr_recruiter` with `hr_admin` because the membership key is `(tenant_id,user_id)`. A conflicting non-admin membership now fails transactionally rather than silently erasing the previous role. Supporting multiple concurrent roles is a 2C schema/authorization requirement.
- **Defect found and corrected in live client:** Refresh re-read records without rechecking permissions/memberships. Refresh and session token rotation now revalidate access, clear previously loaded data, and preserve the selected tenant/view when the same user remains authorized. Switching accounts clears the old selected context.
- **Network recovery:** sign-in now handles promise rejection and always releases the busy state. Browser test mocks unsuccessful Supabase authentication; it does not use actual identities.
- **Security blocker:** existing production `membership_bootstrap_first_admin` RLS INSERT policy permits first-admin self-enrolment by a Synesis-domain identity when a tenant has no membership. Production currently has zero active memberships, making it especially important to review and replace that policy before arbitrary tenant provisioning. Do not quietly remove it until authenticated enrollment dependencies are tested.
- **Verification boundaries:** Static SQL contract tests do not execute PostgreSQL RLS. Browser tests without real accounts do not certify authenticated SQL reads. No SQL DDL or production user mutation was performed for this corrective release.
- **Applicant Portal:** intentionally excluded; it will be a separate user-created project at the recruitment phase.
