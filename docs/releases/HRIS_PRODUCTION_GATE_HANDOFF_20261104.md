# HRIS production release handoff — protected SQL first, Pages second

**Prepared 2026-11-04.** Scope: `shihab-tech04/HRIS-v2` only, excluding Nadia repositories and any unrelated project.

## Verified baseline (read-only checks)

- Protected Main before this release-hardening PR: `52350754aedf7af1a291af7a256f32516a036901`; Main CI `41787559790` PASS, no open PRs.
- All 227 pre-existing historical branch refs dispositioned. Do not blanket merge superseded branches.
- Production Supabase `xfuxnljfrgvusbrpvxpa` is healthy. Latest inspected migration baseline: **131**, maximum version `20261027033218`, exactly **0/2** required Employee Profile migrations installed.
- Current hosted state: 1 Auth user, 1 active Super Admin, 1 tenant, 0 employee rows; Profile RPC and employee bank table absent.
- Source SQL pins in `.github/workflows/ws05-employee-profile-sql-release.yml` are verified. Current Main and exact reviewed PR #159 build/isolated checks are green.
- Successful encrypted source-DB export workflow run `41708292692`; isolated restore `41709822374`; exact SQL rehearsal `41710218974`; final tested PR head acceptance `41665519568` and `41665519199`.
- Independently copied **encrypted** PostgreSQL archive `hris-db-encrypted-41708292692` outside GitHub to Drive:
  https://drive.google.com/file/d/1YiDasQK6B49VbViY-DusAjBnpcKAb6u7/view
  GitHub artifact ZIP SHA256 `af898ec2b3eedf3aea8c7a58dbc22c23f5879a459d60ba1481c7b674f0597735`; Drive download re-hashed, exact byte-for-byte match. Nested encrypted `.gpg` SHA256 `31203441d2bce52edc6f6dceaa8f20797692756c5bda6fc92fb4bd54cad0c1f6`.
- The passphrase is **not** placed in Drive or repository. The GitHub isolated restore proof tested authenticated decryption and full local PG17 restore. No production restore has been attempted.
- Independently restored off-GitHub full Git history of previous Main (prior to this PR):
  https://drive.google.com/file/d/1GNnIvA43Gd0_qlnEdWIKIB-mESnaspic/view
  It will need refreshing if this hardening PR merges.
- GitHub backup artifact `13267985736` expires at `2026-11-04T20:01:25Z`. **Drive custody does not extend that artifact's TTL.** The protected SQL workflow still demands the exact unexpired artifact and fails safely when it expires.

## Chat-side fix in this PR

The `deploy-pages.yml` protected build step **must now verify** the hosted Profile migration versions, tenant/Profile RPCs, bank table with RLS and no broad grants, and all four restrictive certificate storage policies before building Pages. The check uses the existing DB secret and a separately supplied validated pooler host; neither value is printed.

The app build, Figma UI, Candidate source SHA, branch-served asset parity, browser tests, GitHub Pages environment approval, exact live JS/CSS comparison and deployed login smoke remain unchanged.

## Remaining protected actions (owner/Work-mode, in order)

1. **Confirm sealed, independently restorable DB backup remains current.** If backup artifact `13267985736` is expired by release time, run `hris-step1-encrypted-db-export.yml` on protected Main and an authorized PG17 isolated restore rehearsal; archive the fresh encrypted backup off GitHub and review/update the pinned SQL-workflow proof by a tested PR. Never skip the artifact gate or use a historical artifact silently.
2. **Run Employee Profile SQL release** using GitHub Actions workflow `ws05-employee-profile-sql-release.yml`, protected Main, `release_approved=true`, and the exact current session-pooler host obtained from Supabase Connect. The repo secret `HRIS_DB_PASSWORD` must already be configured; do not paste passwords into chat. Only two pinned migrations permitted.
3. **Read-only hosted postmigration verification:** migration versions=2, Profile RPCs present, bank RLS + no `anon/authenticated` broad SELECT grants, four restrictive Storage policies, and unchanged Auth/employee/tenant/audit row counts; test signed-in tenant owner access, cross-tenant denials and private document access.
4. **Review security advisors, without granting broader privileges to clear warnings.** On Nov 4 the advisor reported 1 anonymously callable Security Definer RPC (`candidate_public_jobs_source()`), 313 authenticated-callable Security Definer entries, 33 tables with RLS but no policy, and a leaked-password protection warning. Many may be intentional; each sensitive exposed operation needs a call-path and authorization review before full security signoff. Avoid breaking the public Candidate jobs flow. Reference: https://supabase.com/docs/guides/observability/advisors?lint=0029_authenticated_security_definer_function_executable.
5. **Run Pages production workflow** `deploy-pages.yml` on protected Main with `release_approved=true` and the same `session_pooler_host`. The new fail-closed SQL step must PASS; branch asset parity, browsers and deployment environment must PASS; live JS/CSS must be byte-identical to the exact Main artifacts.
6. **Verify actual published site** https://shihab-tech04.github.io/HRIS-v2/ and role/tenant journeys. Record deployed SHA, artifact hashes, SQL migration inventory, browser results and rollback checkpoint. Do not claim all 1,047 canonical HRIS stories complete without feature-by-feature acceptance evidence.

## Protected operator execution (added after Main b7cfcd38)

An authorized GitHub operator can run the new **dry-run by default** helper from an exact checked-out Main, with GitHub CLI `gh` authenticated:

```bash
bash scripts/release/hris-approved-release.sh --host aws-0-ap-northeast-2.pooler.supabase.com
bash scripts/release/hris-approved-release.sh --host aws-0-ap-northeast-2.pooler.supabase.com --execute
```

The host shown matches the previously successful encrypted HRIS backup workflow; **check Supabase Connect for the current host before executing**. The runner does not take a password or bypass a release gate. It checks exact Main CI and open PRs, invokes the two existing **manually approved** GitHub Actions workflows in SQL-then-Pages order, waits for each PASS and checks both runs used the same protected Main SHA. A failed or unavailable backup, missing secret, failed hosted SQL, unsuccessful browser smoke, or absent Pages environment approval causes the existing protected workflows to stop. It never writes hosted SQL itself.

The ChatGPT GitHub connector cannot use `workflow_dispatch`; the helper must be invoked through an approved operator terminal or supported browser/Work environment. Do not mistake a successful dry-run for a release.

## Focused Supabase advisor triage (read-only, 2026-11-04)

- All **33** tables with RLS enabled but no table policy had **no direct SELECT grant** to either `anon` or `authenticated` roles. They are presently deny-by-default; do not add broad grants to remove a dashboard info notice.
- The only anonymously executable `SECURITY DEFINER` RPC was `public.candidate_public_jobs_source()`: observed function body restricts to `synesis-it` published, active jobs, enforces application deadlines and redacts undisclosed salary. This is public Candidate portal functionality; changing its EXECUTE grant requires a Candidate regression test and specific approval.
- Of **313** authenticated-callable security-definer functions, a heuristic source review found **296** containing direct identity/session/permission-helper references and **17** wrappers or indirect checks. The reviewed sensitive examples delegate to `public.platform_hris_is_super_admin()`, `public.hris_can_manage_project_tasks(...)`, `public.hris_can_read_learning_catalog(...)` and/or `public.hris_own_employee_for_tenant(...)`, with live-session or tenant-specific checks. This is triage, **not** an exhaustive privilege audit and not an excuse to waive hosted testing.
- Password leak protection remains a project/Auth setting warning; do not change authentication configuration through an unrelated SQL migration.

## Rollback and no-bypass policy

Never apply production DDL directly merely to work around GitHub workflow dispatch. Preserve sole Super Admin and approved UI. Source rollback uses the verified off-GitHub Git archive; database recovery requires the encrypted archive **and** separately protected passphrase, then a reviewed restore plan. No SQL was changed by this preflight PR. No Pages release was started by this PR.

**PASS is not LIVE.** Release completion requires protected SQL execution, hosted acceptance, production Pages dispatch and exact live-version verification.
