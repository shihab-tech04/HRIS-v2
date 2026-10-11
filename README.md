# Synesis HRIS-v2

Current GitHub source: https://github.com/shihab-tech04/HRIS-v2

## Status

**Live database integration foundation, read-only.** Not 100% SQL-synchronized, not production-certified.

The app now starts with real Supabase Auth. After sign-in it verifies the logged-in user's own active tenant membership and reads only data authorized by existing PostgreSQL RLS:
- public.tenant_memberships, public.tenants
- public.has_permission(p_permission_id text)
- public.leave_requests, public.leave_types
- public.employees, public.departments when the user has admin capabilities

The old sample-data UI remains accessible behind sign-in in **Design preview (sample)**, with a conspicuous warning. Its persona switching, demo CRUD and SQL simulation do NOT affect the live database. No production schema/data changes are made.

The application uses only the public Supabase publishable key. No service-role, secret or admin tokens are shipped in browser code. API security must remain enforced in Supabase RLS.

An authenticated account needs **an active tenant membership, a linked active employee record, or a verified active legacy Synesis administrator record with applicable permissions**. Global admin rights apply to the legacy Synesis tenant only, never to other tenants. No fake user or tenant is generated.

## Local development

Node.js 22 or newer:

    npm install
    npm run lint
    npm run build
    npm run dev

Optional Vite env overrides for a different non-production project:

    VITE_SUPABASE_URL=https://project-ref.supabase.co
    VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

Never put service-role keys into VITE_ variables.

## GitHub Pages

This repository has two GitHub Actions workflows: PR build check and main-branch Pages deployment.

One-time setup may be needed:
1. Open **Repository → Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Merging the integration PR to main triggers the live build and deployment.
4. After a successful Pages workflow, use https://shihab-tech04.github.io/HRIS-v2/

We cannot verify Pages activation through the repository-source connector; see the workflow's deploy job and site response for confirmation. Vite uses the /HRIS-v2/ base path in Pages builds.

## Outstanding work

- Browser sign-in testing with an actual authorized account.
- RLS negative/positive tests with separate isolated tenant users.
- Verified SQL-backed business writes, complete journeys, and 1,047-story traceability.
- Figma pixel-fidelity, component regression, and broader test suites.

See docs/phase-1/LIVE_CONNECTION_REPORT.md.


## Phase 1 security/connection repair (2026-10-11)

PR #2 restores real authorized access for the existing Synesis user model while keeping sample-data UX strictly a development preview. GitHub CI runs TypeScript, a production build, static SQL contract checks and real Chromium unauthenticated sign-in checks at 9 viewport widths (10 tests).

Supabase applied two additive migrations in the repository's supabase/migrations folder. They add restrictive SELECT guards to employees, departments, leave_requests, and leave_types, plus linked-employee self-read policies. They also revoke anonymous EXECUTE on the new SECURITY DEFINER functions.

This is NOT full multi-tenant RBAC, Figma fidelity, HRIS CRUD sync, or system certification. Authentication using an existing real account and multi-tenant negative tests remain pending.

One-time Pages configuration may still require Settings → Pages → Build and deployment → GitHub Actions, otherwise automatic Jekyll publishing may conflict with the Vite build.
