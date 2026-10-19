# Phase 03 source acceptance evidence — 19 October 2026

**Status: source/disposable evidence passed; Phase 03 is not released or accepted.**

This evidence covers the seven exact canonical Phase 03 stories in modules SA01 (Tenant / Company Setup) and SA12 (Feature Configuration). The canonical source matrix remains unchanged at 1,047 stories across 153 modules. Results below come from a disposable Supabase stack with synthetic tenants and users; they do not certify hosted parity or production behavior.

## Story-level evidence

| Canonical ID | Original requirement | Verified behavior |
| --- | --- | --- |
| SA01-01 | As super admin, I want to create/configure company tenants. | Creates a tenant in the inactive-by-default state, confirms the first administrator, and persists tenant identity/settings across refresh. |
| SA01-02 | As super admin, I want to manage company identity and system settings. | Edits company identity, timezone and default locale; verifies persistence and the matching configuration audit fields. |
| SA01-03 | As super admin, I want tenant data isolated. | Exercises tenant-scoped membership and module-setting access, including cross-tenant and unauthenticated denials. |
| SA01-04 | As super admin, I want tenant configuration changes auditable. | Asserts the configuration audit action, tenant target and changed fields for name, timezone and default locale. |
| SA12-01 | As super admin, I want to enable/disable optional modules where the product supports it. | Exercises Travel, Expenses and Learning controls with confirm/cancel flows in the platform UI, including responsive desktop/mobile and EN/BN checks. |
| SA12-02 | As super admin, I want feature configuration tenant-scoped. | Verifies optional-module configuration is tenant-bound and denied across tenant, direct database and unauthorized API paths. |
| SA12-03 | As super admin, I want disabling a feature not delete historical data. | Disables supported modules while preserving historical database rows and Storage files; reads remain available and unrelated Storage access still works. |

## Runtime evidence

- Main commit `214ccbcf8d33ca30cd09813107f89162a79003ed`: Phase 2A provisioning/Auth/RLS/browser workflow passed in [Actions run 39203699646](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39203699646).
- The full disposable Main workflow passed in [Actions run 39203699636](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39203699636): TypeScript/contracts/build, browser regression, **362/362** real local Auth/RLS checks, the rolled-back legacy notices-policy retirement rehearsal, **25/25** Phase 04 source parity checks, and disposable security checks (no issues found).
- Relevant test sources: `tests/sql/phase2a/run-local.mjs`, `tests/sql/phase2a/verify_provisioning.sql`, `tests/sql/phase2a/run-browser.mjs`, `tests/sql/phase03/run-auth-api.mjs`, `tests/sql/phase03/verify_modules.sql`, and `tests/sql/isolated-auth/run-local.mjs`.
- The configuration-audit assertion is in `tests/sql/phase2a/verify_provisioning.sql`; it checks `PLATFORM_TENANT_METADATA_CHANGED`, the tenants target, and the fields name/timezone/default_locale.
- Phase 03 optional-module PostgreSQL matrix passed in [Actions run 39201464439](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39201464439).

## Release boundary and remaining work

- The current read-only hosted Gate B result remains 0/25; hosted API/schema parity is not verified.
- Production has no `travel_request_notifications`, `learning_completion_events`, or `learning_completion_notifications`; the corresponding Main source migration versions are not present in the recorded hosted migration list.
- Production was not modified during these acceptance runs. No public site, Auth user, production database object, or permission grant was changed.
- The other active administrator still has no tenant membership; assigning the existing global role to the tenant would grant tenant-scoped access and requires an explicit role decision. No permission expansion is included in this evidence.

Accordingly, all seven stories are recorded as individually evidenced in a disposable journey, while `hosted_cross_system_acceptance` remains `NOT_VERIFIED`. Phase 03 remains **IN PROGRESS / NOT ACCEPTED** pending hosted parity, module-table deployment readiness, tenant-role resolution, and live postflight evidence.
