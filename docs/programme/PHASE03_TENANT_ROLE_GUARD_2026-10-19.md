# Phase 03 — Tenant administrator role-registry guard

> **Superseded live state (later 19 October):** [The controlled minimal role and sole Super Admin membership were deployed and verified](PHASE03_MINIMAL_ROLE_LIVE_MODULES_STAGED_2026-10-19.md). The observations below describe the earlier pre-backfill checkpoint; optional modules and full Phase 03 acceptance remain staging-only.

**Status:** staged implementation and synthetic PostgreSQL regression PASS; hosted Phase 03 release **NOT ACCEPTED**.

## Exact scoped change

The existing platform-tenant staging implementation previously inserted `tenant_memberships.role='hr_admin'` based on the legacy allow-list without verifying that the role was active in `roles` or had a usable `role_permissions` mapping. Hosted HRIS has zero tenant memberships and allows the legacy values `hr_admin`/`hr_recruiter`, yet neither value currently exists in its role registry. Consequently, membership insertion alone does not produce valid tenant-scoped authority.

The staging SQL now checks for an active registered `hr_admin` role with the minimum `organization.manage` grant **before**:

1. Provisioning an inactive tenant and its first administrator.
2. Appointing or reactivating a tenant administrator.
3. Allowing the legacy Super Admin self-bootstrap path to insert its first membership.

All three fail closed if the role is missing, inactive, or missing the grant. They do **not** seed permissions, change a user's role, widen grants, or activate tenants. Revoking an existing tenant administrator remains possible even when role configuration is broken. The existing recruiter-to-admin conversion prohibition and last-admin revocation protection remain intact.

## Verification on 19 October 2026

- Two isolated synthetic SQL fixture variants now include explicit `roles` and `role_permissions` tables and the minimum authorized admin role.
- Added negative SQL journeys for missing role during first-admin bootstrap, inactive role during tenant creation, and revoked grant during admin appointment. Each verifies rollback and no retained partial data.
- Ran six SQL files in statement order using a disposable PGlite PostgreSQL runtime in `/tmp` (126 prior statements + 10 newly added = **136 statements**), all successful. This is real PostgreSQL expression/policy/PLpgSQL execution with synthetic identities, not a browser mock or a hosted Auth certification.
- `tests/contracts/phase2a.test.mjs`: **8/8 PASS**; entire Main contract suite **81/81 PASS**. TypeScript lint, Vite production-bundle build (in `/tmp`, without rewriting the Pages branch) and whitespace checks pass.
- Verified production tenant-role preflight remains **`BLOCKED_ROLE_CONSTRAINT_WITHOUT_REGISTRY_ENTRIES`**; no hosted roles, users, memberships, or permissions were changed by this stage.

## Release blockers

1. Identify the **approved tenant administrator role/permission mapping**. There is no approved equivalence from global `hris_system_admin` or existing numeric role IDs to tenant membership `hr_admin`/`hr_recruiter`. Do not replicate all permissions or backfill users by guesswork.
2. Reconcile the source role-registry foreign key transition with the existing production membership constraint and all current users' effective permissions. Rehearse this against a realistic disposable schema before a live migration.
3. Re-run real Supabase Auth/browser acceptance, direct-table and privileged-RPC negative tests, and the 25/25 hosted contract gate.
4. Complete SA01 tenant-isolation/audit journeys and SA12 optional-module configuration with retention and tenant-scope evidence before Phase 03 can be accepted or published. The new-tenants-inactive safety state stays in place until then.

**Publishing decision:** this is a solved and tested *guard*, not a solved Phase 03 release. The existing live Main/Candidate versions remain untouched.
