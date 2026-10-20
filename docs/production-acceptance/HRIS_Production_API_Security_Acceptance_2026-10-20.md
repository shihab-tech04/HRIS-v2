# HRIS Production API and Security Acceptance — 2026-10-20

**Acceptance result: NOT ACCEPTED.** Production catalog checks pass, but actual signed-in acceptance is blocked; the current tenant-role mapping also fails the HR/Admin access preflight.

## Scope and safety

Target: Supabase project `hrmis-saas` (`oslgwxaqfbteqtwqvdzs`) and the production application at [GitHub Pages](https://shihab-tech04.github.io/HRIS-v2/).

Production checks were read-only. No migration was reapplied; no production schema or record was changed. SQL checks were SELECTs against project metadata, PostgreSQL catalogs, authorization metadata, and aggregate role counts. No account emails, passwords, access tokens, employee identifiers, or record contents were retrieved.

## Signed-in production acceptance matrix

| Check | Result | Evidence |
|---|---|---|
| Production project health and migration head | **PASS** | Supabase project reports `ACTIVE_HEALTHY`; the hosted migration list and `supabase_migrations.schema_migrations` both end at `20261020044145` (`phase03_learning_context_authenticated_acl_20261020`). |
| Production source points to the target API | **PASS** | Main branch `src/lib/supabase.ts` and `.env.example` point to `oslgwxaqfbteqtwqvdzs.supabase.co` and use a public publishable key; Auth persists sessions. No service-role key is present in browser configuration. |
| Main-branch request names exist in hosted schema | **PASS — catalog only** | Compared the current main live-source request surface with production catalogs: all 11 referenced tables exist and have RLS enabled; all 26 referenced RPC names exist, have EXECUTE for `authenticated`, and do not have EXECUTE for `anon`. This verifies names, grants, and RLS flags—not runtime response payloads or every parameter signature. |
| Published Pages response and deployed bundle version | **BLOCKED** | The connected Chrome had no HRIS tab/session. A direct navigation attempt did not return a page snapshot or HTTP status, so the hosted bundle/version and current login state were not verified. The repository workflow is not a substitute for a fresh live response. |
| Sole Super Admin account inventory | **PASS — database inventory only** | Read-only aggregate checks found one active Super Admin record and a confirmed Auth account. This does not prove that the account can sign in or that its production UI/API actions succeed. |
| Super Admin signed-in API authorization | **BLOCKED** | No authorized session was available to prove the production Auth session, Super Admin RPC response, or role-gated tenant read. |
| Production platform Super Admin tenant-management UI | **FAIL** | The current `platformTenantApi.ts` is explicitly stage-only and “not mounted in production UI”; its calls are rejected unless `VITE_ENABLE_PLATFORM_TENANTS === 'true'`. The Pages workflow sets `GITHUB_PAGES`, but does not set this feature flag. The tenant-management Super Admin journey is therefore not exposed by the production UI source. |
| HR/Admin tenant access | **FAIL — entitlement mapping** | Production has one active tenant membership, role `hr_admin`, with only `organization.manage`; that membership belongs to the Super Admin account. The separate active System Administrator account has a 45-permission `user_roles` assignment but no active tenant membership. Hosted `has_permission()` delegates to `has_tenant_permission()`, which requires an active membership and tenant-scoped role-permission row. The System Administrator's legacy `user_roles` grants therefore cannot satisfy the app's `has_permission()` checks. The only active tenant role also lacks `employees.view` and `employees.manage`, which the employee-directory RLS guard requires. Runtime confirmation still needs the account sessions. |
| Employee self-access | **BLOCKED** | One confirmed employee-linked Auth account exists, but no signed-in session was available to verify its own-profile read and denial of admin-only reads. The hosted own-employee policy/function is present. |
| Positive and negative cross-tenant API access | **BLOCKED** | Production contains one active tenant and no second tenant. RLS policies use tenant-scoped membership/permission and employee-owner predicates, but a real foreign-tenant row cannot be tested without a second tenant. A made-up tenant UUID would not prove isolation. No production tenant or record was created. |
| Effective anonymous REST denial on tables | **BLOCKED** | Hosted catalogs show RLS enabled and policies for `leave_requests` and `leave_types` target `authenticated`, but `anon` still has table-level SELECT grants on those two tables. No anonymous PostgREST request was observed, so effective denial was not claimed. Consider revoking unnecessary anon grants in a reviewed migration. |
| Existing browser test evidence | **BLOCKED for signed-in acceptance** | Main `tests/browser/authorized-workspace.spec.ts` runs with `?preview=true`. `tests/browser/login.spec.ts` checks unauthenticated UI and mocks the Auth error path. Neither signs in with a real account. The README and `docs/phase-1/LIVE_CONNECTION_REPORT.md` also list real-account sign-in and isolated tenant tests as outstanding. |
| Development branch compatibility with production SQL | **FAIL — pre-release blocker only** | `development/hris-checkpoints` (head `c8a6b23`) calls seven `hris_*` candidate/interview/offer RPCs absent from the hosted production schema: `hris_complete_candidate_interview`, `hris_get_candidate_interview_responses`, `hris_get_recruitment_pipeline`, `hris_issue_candidate_offer`, `hris_save_candidate_interview_panel_notes`, `hris_schedule_candidate_interview`, and `hris_update_candidate_application_stage`. The current production main branch does not call these names. Do not promote the development branch until the frontend/API contract is aligned. |

## Root-cause evidence

1. Main branch source uses `admin_users.active` together with `has_permission()` to determine its legacy admin scope. Production `has_permission(p_permission_id)` calls `has_tenant_permission(synesis_tenant_id(), p_permission_id)`.
2. Production `has_tenant_permission` requires an authenticated live session, an active tenant, an active `tenant_memberships` row for `auth.uid()`, an active tenant role, and a matching `role_permissions` row. A legacy `user_roles` assignment alone is not consulted.
3. The current data has one active tenant membership with role `hr_admin` and one permission (`organization.manage`). The active System Administrator is not that member. Consequently the frontend's legacy admin fallback and the API's tenant membership model do not describe the same entitlement.
4. The same lack of tenant membership also blocks the System Administrator on the current development branch, which now derives available tenant scopes from active memberships and linked employee records.
5. The development branch's seven missing RPC names are not a production defect in the currently published main app; they are a release compatibility gap for that branch.

## Recommendations to Workstation 1

1. Keep production unchanged during acceptance. In an isolated staging project/branch, assign the intended HR/Admin test identity a tenant membership with the approved least-privilege tenant role, then verify the actual app permission checks and employee-directory RLS together. Do not restore broad global access as a workaround.
2. Decide whether platform Super Admin tenant management is intended to be production-visible. If yes, mount the UI and set its release flag only after role/session checks are covered; otherwise mark the capability as intentionally staging-only.
3. Before promoting `development/hris-checkpoints`, reconcile the seven missing candidate RPC calls with the deployed API contract. Either route to compatible deployed functions or deliver a reviewed, tested API/schema release through the normal controller. This workstation made no migration or application changes.
4. Add signed-in browser acceptance using protected test credentials for distinct Super Admin, HR/Admin, and employee identities. Production checks must stay read-only. For a real cross-tenant positive/negative pair, use an isolated environment with two tenants and test identities; production currently has only one tenant.
5. Repeat direct PostgREST checks after authenticated sessions are available: confirm own-tenant reads succeed, unauthorized role reads return zero/42501 as designed, anon calls are denied, and cross-tenant reads return no foreign rows. Capture request URL, status/error code, table/RPC, and session role without storing tokens or personal record content.

## Source references

- [Main source commit `cfd5fc5`](https://github.com/shihab-tech04/HRIS-v2/commit/cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7) — current repository default branch at inspection time.
- [Supabase client configuration](https://github.com/shihab-tech04/HRIS-v2/blob/main/src/lib/supabase.ts)
- [Main live authorization and API reads](https://github.com/shihab-tech04/HRIS-v2/blob/main/src/live/LiveApp.tsx)
- [Stage-only platform tenant API module](https://github.com/shihab-tech04/HRIS-v2/blob/main/src/live/platformTenantApi.ts)
- [Sign-in UI tests](https://github.com/shihab-tech04/HRIS-v2/blob/main/tests/browser/login.spec.ts)
- [Preview workspace tests](https://github.com/shihab-tech04/HRIS-v2/blob/main/tests/browser/authorized-workspace.spec.ts)
- [Pages deploy workflow](https://github.com/shihab-tech04/HRIS-v2/blob/main/.github/workflows/deploy-pages.yml)
- [Development branch](https://github.com/shihab-tech04/HRIS-v2/tree/development/hris-checkpoints)

## Completion boundary

Signed-in production API acceptance is **not yet evidenced**. It can resume when the connected Chrome has signed-in Super Admin, System Administrator, and employee sessions available. The cross-tenant test still requires a second tenant in isolated staging; production contains one tenant and must remain unchanged during this assignment.
