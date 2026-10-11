# HRIS-v2 — Supabase connection and GitHub Pages handoff

Date: 2026-10-11
Scope: Safe, non-destructive connection and deployment foundation.

## Verified source facts

GitHub main baseline f7540c1b39a2e873393fd04e00807f392ae2cbe2. Supabase hrmis-saas (oslgwxaqfbteqtwqvdzs) ACTIVE_HEALTHY.

Verified public schema tables: tenants, tenant_memberships, employees, departments, leave_requests, leave_types, user_roles, role_permissions. Existing authenticated RLS policies restrict reads by user membership, permission, or employee linkage. Function has_permission(p_permission_id text) exists and is executable by authenticated.

Original repository initialized context from hardcoded tenants/personas/roles/employees/projects. Its simulatedPostgresRlsCheck is not an executed PostgreSQL test, and embedded DDL was not applied to the live schema.

## Work in this branch

- Real Supabase authentication.
- Tenant list limited to active memberships for the authenticated user.
- Permission-gated Employee/Admin live read-only SQL views.
- Browser queries use only public publishable key with PostgreSQL RLS.
- Legacy UI retained as clearly labeled, non-persistent sample-data design preview.
- Historical report claims changed to simulation/unverified language.
- GitHub Actions CI build and Pages deployment configuration.
- No production Supabase DDL or data mutation.

## Important unfinished certification gates

- Workflow build and deployment need actual run evidence.
- One-time Pages setting may require repository owner action.
- Authorized Supabase account sign-in and tenant membership are not tested in browser.
- RLS/tenant isolation requires dedicated isolated test identities.
- SQL-backed writes across HRIS modules are not implemented in this batch.
- Full system, Figma, accessibility, and 1,047-story verification not completed.

**Do not claim the app is 100% synchronized, fully functional, or production-security certified.**
