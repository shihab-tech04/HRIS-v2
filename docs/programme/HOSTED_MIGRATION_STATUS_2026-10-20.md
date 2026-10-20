# HRIS hosted migration and application acceptance status — 20 October 2026

## Production migration prerequisite

- Supabase project: `oslgwxaqfbteqtwqvdzs` (`hrmis-saas`), organization `qdcgrdntvspjsdszuzmy`.
- The connected HRIS Supabase integration confirms a healthy project and **116** recorded migrations, ending at `20261020044145` (`phase03_learning_context_authenticated_acl_20261020`).
- The migration workstream reports hosted schema parity **26/26**, hosted security checks **20/20**, and database-role rejection **9/9**. The application stream reran the existing read-only 26-check catalog probe and observed **26/26 passed**.
- This application stream did not submit or replay any migration.

## Application acceptance still pending

The production HRIS application at [the published workspace](https://shihab-tech04.github.io/HRIS-v2/) opens on its sign-in form in the connected browser. There is no authenticated QA session available in that browser, so the required real Auth-to-PostgREST and tenant-isolation checks have not run. No production account, application data, permissions, or schema were created or changed to manufacture test access. Keep the Phase 03 application release and Phase 04 hosted API acceptance pending until a user with an authorized QA account signs in and the acceptance suite completes.

The latest independent application checkpoint remains `a920281911b3d61ea116dc951bca900aeb3b4958` on `development/hris-checkpoints`. Its disposable full Auth/Postgres/Storage/browser workflow passed as [run 39375324961](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39375324961); Phase 2A tenant/Auth/RLS/browser acceptance passed as [run 39375324947](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39375324947). These are disposable results and do not substitute for hosted signed-in acceptance.

## Story checkpoint

HR01-06 is recorded as **partial**: the passing disposable workflow verifies redacted audit details for `official_email` and `emergency_contact_phone` only. The complete sensitive-field inventory and hosted signed-in behavior are unverified. Phase 05 remains **17/57 disposable-evidenced, 5/57 partial, 3/57 blocked on missing contracts, and 32/57 not classified**. The overall register remains **38 individually evidenced canonical stories**, with historical 82-story membership unreconciled and no hosted story certification claimed.

## Separate Supabase advisor findings

The read-only Supabase advisors returned additional findings beyond the migration workstream's 20/20 checks. Security: 27 INFO `rls_enabled_no_policy`, 1 WARN anonymous-executable security-definer function, 246 WARN authenticated-executable security-definer functions, and 1 WARN leaked-password protection. Performance: 67 INFO unindexed foreign keys, 78 INFO unused indexes, 23 WARN RLS init-plan items, and 37 WARN multiple permissive policies. These results have not been treated as proof of an exploit or folded into the 20/20 migration acceptance. They remain separate items for review against the final release gate; no fixes or permission changes were made here.

## Release decision

No application deployment occurred from this checkpoint. Deployment remains blocked until signed-in production API and tenant-isolation acceptance passes, the auxiliary advisor findings are classified against the release gate, and all other Phase 21 release checks pass.
