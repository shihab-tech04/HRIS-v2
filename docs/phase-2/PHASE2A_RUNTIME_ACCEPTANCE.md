# Phase 2A — Executable PostgreSQL Acceptance, 2026-10-11

## Current source and scope

Main HRIS source at audit start: `5d175bc3528545885827654ca34cc766f6b53a69`.
Supabase project: `hrmis-saas`, ref `oslgwxaqfbteqtwqvdzs`.
Candidate Portal: separate `shihab-tech04/HRIS-Candidate-v2` repo; unchanged here.

## What was executed

GitHub Actions workflow `.github/workflows/phase2a-postgres.yml`
creates an ephemeral PostgreSQL 17 database and performs:

1. `tests/sql/phase2a/fixture.sql` — small, synthetic table/Auth fixture matching inspected tenant schema.
2. `supabase/staging/phase2a/tenant_provisioning.staging.sql` — actual staged DDL/RPCs.
3. `supabase/staging/phase2a/first_admin_guard.staging.sql` — actual staged restrictive INSERT policy.
4. `verify_authorization.sql` — RLS-positive/negative and anonymous privilege checks.
5. `verify_provisioning.sql` — tenant transaction, inactive status, validation, audit, metadata, rollback.
6. `verify_admin_roles.sql` — assignment/revocation, last-admin guard, recruiter membership conflict.

**Executed result:** 13 explicit PostgreSQL PASS assertions; complete job passed.
The separate existing TypeScript/build/browser regression job remains required before merge.

## Security / validity boundaries

Synthetic `auth.uid()`, `auth.jwt()` and `is_live_session()` fixture functions emulate input/session state. They do not certify Supabase-managed `auth.sessions`, authentic JWT verification, real Auth accounts, JWT revocation or PostgREST execution contexts.

The test database has no real employee records, confidential HR data or production roles. No production schema migration, user creation, data mutation or active-tenant activation took place.

The first-admin guard is **staging-only**, even after this test passes. Before production activation:
- Independently test with two actual synthetic Supabase Auth sessions and at least two isolated tenants.
- Inspect/review existing RLS and privileged RPC authorization on sensitive data tables.
- Explicitly approve the production security migration and rollback.
- Confirm legitimate initial-admin/recovery path for existing user credentials.
- Maintain inactive new tenants until general tenant-scoped RBAC and cross-tenant security are certified.

## Remaining Phase 2A release gates

- Signed-in platform superadmin portal for create/list/edit/admin assignment: NOT IN PRODUCTION.
- Live authorized main HRIS tenant creation and full read-back: BLOCKED, staged only.
- Real PostgreSQL staging transaction and targeted security conditions: PASS in synthetic fixture.
- Real Supabase Auth/session/tenant isolation: NOT TESTED.
- Existing Phase 1 regression: required to pass unchanged.
- Figma visual and EN/BN parity for new platform controls: NOT TESTED (feature disabled).

**Decision:** Phase 2A engineering verification improved but NOT CERTIFIED. Do not enable multi-tenant provisioning or assert 100% SQL sync.
