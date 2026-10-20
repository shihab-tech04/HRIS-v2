# HR01-04 — tenant-configured employment status visibility

**Canonical requirement:** HR01-04, “As HR, I want to see active, inactive, probation, notice, exited, and other configured statuses.” The immutable source places it at `Pasted text(1).txt`, line 871, in the HR01 Employee Master module.

**Classification:** verified in a disposable Auth/Postgres/browser journey. This evidence does not certify a hosted story or production deployment.

## Tested behavior

At application commit [`d22de6793784bf55b67f34fe00253289dc624772`](https://github.com/shihab-tech04/HRIS-v2/commit/d22de6793784bf55b67f34fe00253289dc624772), the full disposable workflow [39377300851](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39377300851) passed. Its exact checkout passed TypeScript, all 342 contract tests, and the production Vite build; the local Auth/RLS suite passed **375/375** assertions, and the Phase 04 SQL/API parity check passed **26/26** on the Auth-tested disposable schema. The disposable security advisor reported no issues.

The HR01-04 API/browser assertions used synthetic users and two disposable tenants. The authorized Tenant A employee directory exposed its configured values `active`, `inactive`, `probation`, `notice`, `exited`, and `custom_configured`; selecting each status returned only its corresponding synthetic employee. Tenant B's unique `tenant_b_only` value was available only to Tenant B and did not appear in Tenant A's options. The journey also exercised no-permission, global-only, cross-tenant, inactive-membership, and anonymous denials. Chromium checked the directory and status filter in English and Bengali at 375px and 1280px, including filter recovery. Browser marker: `HR01-04_EMPLOYMENT_STATUS_VISIBILITY_BROWSER_PASS`.

The implementation uses the existing authenticated directory RPC and its tenant-specific `available_statuses` projection. The browser sends the selected tenant and status to that RPC; the client does not manufacture a global status catalogue. No UI, API, SQL migration, permission, or Figma asset was changed in this acceptance commit.

## Production SQL observation and remaining gate

A separate read-only catalog query against the deployed Supabase project (`oslgwxaqfbteqtwqvdzs`) confirmed the production function signature `hris_get_tenant_employee_directory_v2(uuid, text, uuid, uuid, text, integer, integer)`, `SECURITY DEFINER` with an empty search path, tenant-constrained status options and result filtering, and execute access for `authenticated` but not `anon`. This inspected the deployed function definition and grants only; it did **not** send a signed-in PostgREST request or test two production tenants.

The production migration workstream separately reports head `20261020044145`, hosted schema parity 26/26, security checks 20/20, and database-role rejection 9/9. This application stream did not reapply migrations. Signed-in production API and tenant-isolation acceptance remains pending an authorized QA session in the published HRIS app. No production rows, roles, grants, schema, or deployment were changed.
