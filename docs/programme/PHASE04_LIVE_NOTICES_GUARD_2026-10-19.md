# Phase 04 — Live legacy notice-read guard, 19 October 2026

**Scope: one successful production security hotfix, not acceptance of Phases 03–04 or release of newer frontend bundles.**

## Release evidence

| Item | Result |
| --- | --- |
| Supabase project | HRIS `oslgwxaqfbteqtwqvdzs` |
| Applied migration name | `hris_notices_legacy_security_guard_20261019` |
| Hosted migration version | `20261019013043` |
| Schema change | One additive `AS RESTRICTIVE FOR SELECT TO authenticated` policy on `public.notices` |
| Existing permissive `notices_read` | Preserved, with the new restrictive policy AND-ed by PostgreSQL |
| Existing data, admins, memberships and role grants | Not modified |
| Preflight: active tenant / member rows | 1 active `synesis-it` tenant / 0 memberships |
| Preflight: confirmed active admins / projected authorized admins | 2 / 2 |
| Preflight: active notices outside Synesis | 0 |
| In-transaction DDL dry run | Passed; confirmed no guard persisted after `ROLLBACK` |
| Hosted migration application | Succeeded |
| Postflight policy catalog | Installed `hris_notices_legacy_security_guard`, restrictive SELECT; old `notices_read` still present |
| Negative test | Fabricated authenticated JWT/session context could read 0 rows; no real session token was extracted |
| Local static hotfix tests | 4/4 passed |
| Positive real-user browser/Auth test | **Not yet run**; the two-admin result is a schema/data access projection |

The hotfix source, rollback and aggregate verification query are in `supabase/staging/hosted-legacy-notices/`. The policy uses only functions already installed on the hosted schema: `synesis_tenant_id`, `is_active_admin`, `has_permission`, and `hris_own_employee_for_tenant`. It does **not** depend on the missing newer helpers `has_tenant_permission(uuid,text)` and `hris_is_active_tenant_member(uuid)`.

This emergency guard limits legacy notice reads to the active Synesis tenant, requiring current legacy admin access with notice permission **or** an eligible employee's own announcement audience. It addresses the known overly broad legacy policy under the observed one-tenant topology. It must never be mistaken for multi-tenant release certification.

## Recovery and next gates

1. **Rollback if a legitimate production notice journey fails:** first inspect the installed policy definition for unexpected changes. If it still matches this hotfix, execute the exact `rollback-restrictive-read-guard.staging.sql` (one policy drop); re-check both the policy catalog and relevant legitimate-user access. This rollback reopens the previously documented broad-read risk, so treat it as a monitored emergency recovery only.
2. **No blind migration replay:** hosted history differed from local version names and failed 25/25 parity checks as of 19 October. Reconcile object dependencies and stage an identity transition before applying the newer membership-backed policies.
3. **Membership backfill and role-registry repair are required:** the currently active administrators use `admin_users` and `user_roles` while `tenant_memberships` is empty. Hosted `tenant_memberships_role_check` permits only `hr_admin` or `hr_recruiter`, but neither exists in the hosted `roles` registry or has a `role_permissions` grant. Source migration `20261016170000_hris_candidate_employee_activation_policy.sql` eventually replaces that old check with a role-registry foreign key, while staged Phase 2A provisioning still inserts literal `hr_admin`. A direct backfill or constraint swap would fail or silently remove permissions. Use `supabase/staging/hosted-membership-transition/preflight-read-only.sql` and resolve approved role semantics in an isolated stack before changing any identities.
4. **Retire this compatibility policy during the fully tested tenant transition:** the Synesis pin in this guard intentionally blocks reads from any newly activated tenant. The later Phase 03/04 migration must remove it atomically with the validated multi-tenant audience guard; do not silently activate tenant creation beforehand.
5. **Keep frontend publication gated** on hosted 25/25 contracts, negative and positive real Auth/RLS tests, main/Candidate browser journeys, and the final data-backup/release sign-off. No newer Main or Candidate bundle was published with this hotfix.

## Audit limitations

The synthetic-context SQL test proves the guard rejected a made-up authenticated actor without a live session; it is not a two-real-tenant penetration test or a positive signed-in browser test. The live system had one active tenant and no tenant-membership rows, so these future-state cases must be validated in a disposable stack before broad policy deployment.
