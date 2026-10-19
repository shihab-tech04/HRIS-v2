# Phase 03 — Active-Auth identity guard (19 October 2026)

> **Later 19 October update:** the user-approved minimal `hr_admin` role/bootstrap migration is [now live and postflight verified](PHASE03_MINIMAL_ROLE_LIVE_MODULES_STAGED_2026-10-19.md). Earlier role-gap findings below refer to the pre-deployment state. The wider tenant and module UI remains gated.

**Status: source-staged and synthetic PostgreSQL-tested. Phase 03 NOT accepted, NOT published.**

## Scoped correction

The staged Phase 2A/2B tenant administration previously treated an Auth user as
eligible after `email_confirmed_at IS NOT NULL`, without checking the existing
`auth.users.deleted_at` and `auth.users.banned_until` fields. A stale session or
confirmed-but-disabled account could therefore be selected for first-admin
provisioning or appointment. The platform Super Admin check also depended on
the legacy admin record and live-session helper but did not explicitly check
whether the Auth identity had since been disabled.

The staged SQL now requires a confirmed, non-deleted and non-currently-banned
Auth account in all of these paths:

1. `platform_hris_is_super_admin()` — privilege-bearing actor guard.
2. `hris_can_bootstrap_tenant_membership()` — legacy first-admin compatibility guard.
3. `platform_hris_provision_tenant()` — initial administrator by UUID.
4. `platform_hris_set_tenant_admin()` — new/reactivated administrator by UUID.
5. `_platform_hris_confirmed_user_id_by_email()` — exact-email wrapper, covering
   both Phase 2B by-email APIs.

The functions continue to require the active server-side Super Admin record,
current session, registered `hr_admin` role and minimal `organization.manage`
grant. Nothing seeds roles, changes membership grants or activates tenants.
New tenants remain inactive. The two Auth columns and their PostgreSQL types
were read back from the intended HRIS hosted schema before changing the stage.

## Verification

- Disposable PGlite PostgreSQL executed **219 SQL statements across eight
  files**: two staging implementations, one additive RLS guard, the Phase 2B
  email wrappers, synthetic Auth fixture and four authorization/provisioning
  journeys. All passed. Its `auth.uid()`/session context is a synthetic test
  double; it is not real GoTrue or production/browser certification.
- Negative tests now cover missing role-registry entry, inactive HR admin role,
  missing `organization.manage` permission, banned/deleted prospective tenant
  administrators (UUID and email), banned bootstrap actor, deleted platform
  Super Admin actor, unauthorized email lookup and recruiter-role preservation.
- Phase 2A static contract tests: **9/9 PASS**; Main TypeScript lint,
  full **81/81** contract suite and isolated Vite bundle build: **PASS**.
- No hosted DDL, data, identities, grants, GitHub branches or frontend
  deployment were touched by this change.

## Remaining Phase 03 release gates

1. Hosted roles are not compatible with staged `hr_admin`: current membership
   allow-list permits the string, but the role registry has no active
   `hr_admin` or `hr_recruiter`, no grants for either and zero memberships.
   Choose and rehearse an explicit, least-privilege migration without
   implicitly elevating any of the two legacy administrators.
2. Reconcile 112 hosted migration entries with the 99 current versioned
   source files by object, not by blind timestamp replay; the dependent
   Phase 04 hosted API/RLS parity gate is still **0/25**.
   The hosted `membership_bootstrap_first_admin` is a permissive
   domain-email/empty-tenant INSERT policy **but a separate restrictive
   `hris_first_admin_platform_guard` is already installed**, requiring a live
   legacy Super Admin. The hosted helper does not yet check registered
   `hr_admin`/`organization.manage` authority or banned/deleted Auth state.
   The updated preflight detects this *source drift* separately from a missing
   restrictive policy. No unauthorized bootstrap was demonstrated.
3. Run new source head through real disposable Supabase Auth/Postgres/Storage
   and browser two-tenant, role, session, revoke, race and audit acceptance.
   The installed workspace has no `supabase`, `docker` or `psql` executable.
4. Resolve SA12 optional-module behavior against the canonical stories:
   no tenant-scoped feature-toggle storage/RPC or server-enforced module
   disable has been found. A UI-only switch would not qualify. Define the
   supported optional module catalogue and the expected historical-data
   access semantics before adding feature gating to existing data operations.
5. Map SA01-01–04 and SA12-01–03 to observed exact-ID acceptance; currently
   all seven are unclassified. Phase 03 and its security-dependent Phase 04
   must be released together when all cross-tenant gates pass.

**Publication decision:** with the security dependency and SA12 functionality
open, the older live Main and Candidate sites remain the correctly protected
baseline. Do not enable `VITE_ENABLE_PLATFORM_TENANTS=true` yet.
