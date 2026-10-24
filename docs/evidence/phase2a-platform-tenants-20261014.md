# Phase 2A Platform Tenant Workflow — Local Acceptance — 2026-10-14

**Result: PASS for the staged workflow in the disposable local environment.** The staged SQL was applied only to local project `synesis-hris-phase2a-20261014` (Supabase CLI 2.120.0, PostgreSQL 17, loopback API/database ports 58321/58322). No production endpoint, database, account, or permission was changed. Synthetic Auth users were created through local GoTrue and the runner verified that Auth was empty again after cleanup.

## Acceptance evidence

- `tests/sql/phase2a/run-local.mjs`: **44 passed, 0 failed** across real Auth sessions, server-side Super Admin checks, RLS, staged provisioning/metadata/admin RPCs, authorization denials, validation, atomic rollback, audit records, last-admin protection, and revoked-session rejection.
- The same run exercised the actual Vite app with Playwright: Super Admin login with and without active tenants, cancellation and creation, rejected UUID input, inactive-tenant persistence, metadata error recovery and update, administrator assignment/revocation and confirmation cancellation, ordinary-account UI denial, and mobile tenant creation.
- Desktop viewport: 1440 × 1000. Mobile viewport: 390 × 844. No horizontal overflow or browser runtime errors were observed.
- `npx playwright test tests/browser/project-workspace.spec.ts --project=chromium`: **7 passed, 0 failed**, preserving project creation, Project Manager membership, task lifecycle, and peer review journeys.
- `npm run check`: TypeScript passed; **143 contract tests passed, 0 failed**; production build passed with a large-chunk advisory.

## Scope and limitations

- The UI is visible only when `VITE_ENABLE_PLATFORM_TENANTS=true` and the signed-in user is an active platform Super Admin. The screen independently calls the server-side Super Admin RPC, and every write uses the existing staged RPC contract.
- Newly provisioned tenants remain inactive. This workflow has no activation control.
- The staging SQL has not been applied to production and this evidence does not certify the wider tenant RBAC/security program or release readiness.
- Administrator assignment accepts an existing confirmed Auth UUID. The approved contract does not provide account search, invitations, or account creation, so identity lookup remains an operational dependency.
