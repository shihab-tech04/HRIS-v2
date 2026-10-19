# HRIS-v2 Phase 2A — verified baseline and staged contract

**Baseline** main 80f2a98876081850124b5252bd96a83ebcaf4468, 2026-10-11.
**Database** hrmis-saas / oslgwxaqfbteqtwqvdzs, read-only inspection; 89 public tables all with RLS.
**Status** STAGING CONTRACT PASSED LOCAL AUTH/RLS AND BROWSER ACCEPTANCE (2026-10-14); NOT APPLIED TO PRODUCTION OR CERTIFIED FOR RELEASE.

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
- src/live/platformTenantApi.ts is wired to the existing HRIS shell behind deliberate `VITE_ENABLE_PLATFORM_TENANTS=true`; navigation also requires active Super Admin state and the page rechecks authority through the server RPC. The flag remains off in production configuration.

## Local stage acceptance — 2026-10-14

- Applied the staged contract to the free disposable local Supabase project `synesis-hris-phase2a-20261014`, using real GoTrue-created identities. Production `hrmis-saas` was not contacted.
- `tests/sql/phase2a/run-local.mjs`: **44 passed, 0 failed**, including server-side Super Admin authorization, ordinary and anonymous denial, direct-table RLS filtering, atomic validation, inactive persistence, admin assignment/revocation, last-admin protection, audit attribution, and revoked-session rejection.
- The same runner drove the actual app with authenticated desktop and mobile browser sessions, verified tenant and metadata read-back, and checked error, cancellation, refresh, ordinary-user denial, and responsive overflow behavior.
- Regression evidence: project-workspace browser suite **7 passed, 0 failed**; `npm run check` completed with TypeScript pass, **143 contract tests passed, 0 failed**, and a successful build.
- Detailed evidence: `docs/evidence/phase2a-platform-tenants-20261014.md`.

## Open/blocked items

- **19 October additional fail-closed repair (staged only):** provisioning and tenant-admin appointment now reject a missing, inactive or unprivileged `hr_admin` registry role (required `organization.manage`) before inserting a membership. The isolated fixtures explicitly model the registry. This prevents a legacy allow-list membership from being mistaken for an effective tenant permission. It does **not** seed live roles, choose the full administrator permission bundle, authorize a production backfill, or certify Phase 03.

- Tenant activation/deactivation remains **BLOCKED** until comprehensive tenant-scoped authorization/RLS is ready (2C); hiding a menu is not a backend denial.
- Platform tenant UI remains behind the explicit staging feature flag; the local acceptance does not certify the production release.
- The current approved contract requires a known existing Auth UUID for administrator assignment. Account search, invitations, and account creation remain outside this phase; identity lookup is an operational dependency.
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
