# HRIS hosted migration and application acceptance status — 20 October 2026

## Production migration prerequisite

- Supabase project: `oslgwxaqfbteqtwqvdzs` (`hrmis-saas`), organization `qdcgrdntvspjsdszuzmy`.
- The connected HRIS Supabase integration confirms a healthy project and **116** recorded migrations, ending at `20261020044145` (`phase03_learning_context_authenticated_acl_20261020`).
- The migration workstream reports hosted schema parity **26/26**, hosted security checks **20/20**, and database-role rejection **9/9**. The application stream reran the existing read-only 26-check catalog probe and observed **26/26 passed**.
- No migration was submitted or replayed against the hosted project. The contact migration compatibility replay and the new candidate activation migration were tested only in disposable local Supabase.

## Application acceptance still pending

The production HRIS application at [the published workspace](https://shihab-tech04.github.io/HRIS-v2/) opens on its sign-in form in the connected browser. There is no authenticated QA session available in that browser, so the required real Auth-to-PostgREST checks have not run. A separate read-only tenant inventory found exactly one active tenant and no inactive tenants; a positive production cross-tenant comparison is not possible against the current database contents. An authorized QA sign-in can still exercise the current tenant and an unknown-tenant denial, but the true two-tenant production isolation gate remains pending. No production account, application data, permissions, or schema were created or changed to manufacture test access.

The latest verified Main source/test checkpoint is `1f0bec2fc40f27e600685661a83c6815dd43cf08` on `development/hris-checkpoints`. Its full disposable workflow [39425355049](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39425355049) passed **350/350 contract tests, 56/56 browser regressions, 386/386 local Auth/RLS assertions, Phase 04 parity 26/26**, production build, and the disposable security advisor (**No issues found**). Phase 2A/2B passed in [run 39425354892](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39425354892); the standard runner probe passed in [run 39425355138](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39425355138). This isolated replay verifies contact RPC source-migration compatibility after later authorization migrations, HR01-01 candidate activation after the forward migration generates an employee ID, and partial X03-07/X03-08 employee activation/data reuse evidence. Neither migration was applied to production. HR01-04's six configured status options, per-status results, cross-tenant exclusion, and 375px/1280px browser checks remain evidenced at commit `d22de6793784bf55b67f34fe00253289dc624772` in full run [39377300851](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39377300851). These disposable results do not substitute for hosted signed-in acceptance.

A separate read-only production catalog query confirmed that `hris_get_tenant_employee_directory_v2` is `SECURITY DEFINER` with an empty search path, exposes only the requested tenant's configured employment-status options and filters, and grants execute to `authenticated` but not `anon`. It verified the deployed SQL definition and ACL only. No signed-in production PostgREST call has been completed.

## Story checkpoint

HR01-01 is **partial** only for verified accepted-offer candidate activation; general manual HR employee creation remains unverified. HR01-06 remains **partial**: its disposable evidence verifies redacted audit names for all nine supported contact fields and the related profile-request audit key; broader sensitive-data categories and hosted signed-in behavior remain unverified. X03-07 and X03-08 are partial only for the existing HR activation handoff. Phase 05 is **18/57 disposable-evidenced, 9/57 partial, 4/57 blocked on missing contracts, and 26/57 not classified**. The overall register remains **39 individually evidenced canonical stories**; HR01-01 and X03-07/X03-08 are open partials and are not added to that count. The historical 82-story membership remains unreconciled, and no hosted story certification is claimed.

## Separate Supabase advisor findings

The read-only Supabase advisors returned additional findings beyond the migration workstream's 20/20 checks. Security: 27 INFO `rls_enabled_no_policy`, 1 WARN anonymous-executable security-definer function, 246 WARN authenticated-executable security-definer functions, and 1 WARN leaked-password protection. Performance: 67 INFO unindexed foreign keys, 78 INFO unused indexes, 23 WARN RLS init-plan items, and 37 WARN multiple permissive policies. These results have not been treated as proof of an exploit or folded into the 20/20 migration acceptance. They remain separate items for review against the final release gate; no fixes or permission changes were made here.

## Release decision

No application deployment occurred from this checkpoint. Deployment remains blocked until signed-in production API and tenant-isolation acceptance passes, the auxiliary advisor findings are classified against the release gate, and all other Phase 21 release checks pass.
