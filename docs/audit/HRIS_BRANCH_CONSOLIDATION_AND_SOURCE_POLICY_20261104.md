# HRIS — guarded historical branch consolidation and single-admin source policy

Date: 2026-11-04. Basis: protected Main `5b169e40c2081e4b93fb9cbbf3731a8369f8f745`.

## Inventory and non-destructive decisions

- GitHub: 226 refs (Main + 225 non-Main), 163 PRs total: 103 merged; 60 closed without merge; zero open before this corrective PR.
- Exactly 65 previously flagged historical branch heads are preserved, with all 65 names and SHAs matched to remote refs. Full per-branch dispositions: [HRIS_65_HISTORICAL_BRANCH_DISPOSITIONS_20261104.csv](./HRIS_65_HISTORICAL_BRANCH_DISPOSITIONS_20261104.csv).
- Historical family counts: 24 old Profile/certificate variants (current source recovered in merged PR #159); 19 old tenant/Auth/release variants (including E02-09 recovered through #170); 12 Figma/dashboard/locale variants (including tenant Bengali recovered through #169); 7 HR03/job variants now represented by later integration PRs; 3 old synthetic/password user creations intentionally excluded.
- A divergent Git branch does not necessarily describe missing approved behavior. Do not merge or fast-forward every historical head: newer source, protected release policy and current single-Super-Admin Auth baseline take precedence.
- Current Main already includes reviewed integrations #159–#170; these passed exact-head `check` and `isolated-hris`. Backup evidence for source `5b169e40` is the independent, restore-tested Drive archive at https://drive.google.com/file/d/1zNg4qRSV0lfJaMu8yKYUkmZW3sfta9Jd/view.
- The historical code and former browser-only synthetic user tests remain recoverable in Git; they must not be surfaced as real production user management.

## This corrective release candidate

- Unmount the `user-management-preview` route, navigation entry and `SyntheticUserManagement` import from the signed-in shared workspace. Retain the archived synthetic UI/adapter files and their read-only/no-Auth-write contract checks, but do not ship a public route to them.
- Replace the prior synthetic-preview browser acceptance with a desktop/mobile denial assertion, and strengthen the source contract to reject future navigation reintroduction.
- Rebuild exact tracked Pages JS/CSS/index using a temporary branch-only workflow pinned to the deployed Candidate commit. Remove the temporary workflow before protected PR review.
- **Source-only integration; no hosted SQL/Auth, production deployment or permission expansion.** Do not mistake historical disposition coverage for 1,047-story production acceptance.

## Mandatory remaining production gates (not waived by this PR)

1. Two version-pinned Employee Profile migrations are not installed on hosted HRIS 360 (`20261027040642`, `20261030114500`); verify grants, tenant RLS and file namespace restrictions after the protected SQL dispatch.
2. Real authenticated Employee Profile CRUD/negative cross-tenant tests and current-source Figma acceptance must pass. Current Main source contains the Profile UI and bank schema, but the hosted bank table and Profile RPCs are absent.
3. The exact post-merge source history must be backed up off GitHub and restored/tested before production publication. Existing protected `deploy-pages.yml` manual workflow controls release; verify the real deployed Pages assets and signed-in browser journeys.
4. Explicit story-level evidence is still needed for whole-system 1,047-story claims. No universal percentage of approved functional completion is certified in this branch review.

### Decision

Historical source variants have dispositions, not blanket merges. The only newly confirmed source-policy regression was the synthetic-user preview route. This branch addresses that regression while retaining rollbackable history. It is not an authorization to run older password provisioning or synthetic identity features.
