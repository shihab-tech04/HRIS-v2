# HRIS hosted migration and application acceptance status — 20 October 2026

## Production migration prerequisite

- Supabase project: `oslgwxaqfbteqtwqvdzs` (`hrmis-saas`), organization `qdcgrdntvspjsdszuzmy`.
- The connected HRIS Supabase integration confirms a healthy project and **116** recorded migrations, ending at `20261020044145` (`phase03_learning_context_authenticated_acl_20261020`).
- The migration workstream reports hosted schema parity **26/26**, hosted security checks **20/20**, and database-role rejection **9/9**. The application stream reran the existing read-only 26-check catalog probe and observed **26/26 passed**.
- This application stream did not submit or replay any migration.

## Application acceptance still pending

The production HRIS application at [the published workspace](https://shihab-tech04.github.io/HRIS-v2/) opens on its sign-in form in the connected browser. There is no authenticated QA session available in that browser, so the required real Auth-to-PostgREST checks have not run. A separate read-only tenant inventory found exactly one active tenant and no inactive tenants; a positive production cross-tenant comparison is not possible against the current database contents. An authorized QA sign-in can still exercise the current tenant and an unknown-tenant denial, but the true two-tenant production isolation gate remains pending. No production account, application data, permissions, or schema were created or changed to manufacture test access.

The latest verified application checkpoint is `686eec7016ec831e9b679500f28f553b8f93b14f` on `development/hris-checkpoints`. The full disposable workflow [39378140222](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140222) passed TypeScript/contracts/build, **342/342 contract tests**, **375/375** local Auth/RLS assertions, disposable Phase 04 parity **26/26**, and the disposable security advisor; Phase 2A Auth/RLS/browser acceptance passed as [run 39378140175](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140175). This head contains only test changes for HR01-06; it verifies redacted audit coverage for all nine supported contact fields. HR01-04's six configured status options, per-status results, cross-tenant exclusion, and 375px/1280px browser checks passed at its tested head `d22de6793784bf55b67f34fe00253289dc624772` in full run [39377300851](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39377300851). These disposable results do not substitute for hosted signed-in acceptance.

A separate read-only production catalog query confirmed that `hris_get_tenant_employee_directory_v2` is `SECURITY DEFINER` with an empty search path, exposes only the requested tenant's configured employment-status options and filters, and grants execute to `authenticated` but not `anon`. It verified the deployed SQL definition and ACL only. No signed-in production PostgREST call has been completed.

## Story checkpoint

HR01-06 remains **partial**: its current disposable evidence verifies redacted audit names for all nine supported contact fields and also the related profile-request audit key; broader sensitive-data categories and hosted signed-in behavior remain unverified. Phase 05 is **18/57 disposable-evidenced, 5/57 partial, 3/57 blocked on missing contracts, and 31/57 not classified**. The overall register is **39 individually evidenced canonical stories**, with historical 82-story membership unreconciled and no hosted story certification claimed.

## Separate Supabase advisor findings

The read-only Supabase advisors returned additional findings beyond the migration workstream's 20/20 checks. Security: 27 INFO `rls_enabled_no_policy`, 1 WARN anonymous-executable security-definer function, 246 WARN authenticated-executable security-definer functions, and 1 WARN leaked-password protection. Performance: 67 INFO unindexed foreign keys, 78 INFO unused indexes, 23 WARN RLS init-plan items, and 37 WARN multiple permissive policies. These results have not been treated as proof of an exploit or folded into the 20/20 migration acceptance. They remain separate items for review against the final release gate; no fixes or permission changes were made here.

## Release decision

No application deployment occurred from this checkpoint. Deployment remains blocked until signed-in production API and tenant-isolation acceptance passes, the auxiliary advisor findings are classified against the release gate, and all other Phase 21 release checks pass.
