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

An existing Supabase Auth account with an **active tenant_memberships** row is required. If no such membership exists, the application reports lack of access without inventing a tenant.

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
