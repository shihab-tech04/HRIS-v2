# WS05 Figma-first release preflight — 2026-10-21

## Decision

**HOLD.** WS05 remains the sole release controller. No pull request was merged, no production deployment was started, and no Supabase schema, Auth, membership, role, or business data was changed.

This pass resumes PR #41. It fixes the Pages asset-parity failure and verifies the exact updated PR head in GitHub Actions. That clears the build-parity blocker only.

## Authoritative sources and deployed versions

| Source | Current ref | Exact SHA | Status |
|---|---|---|---|
| Main production branch | main | cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7 | Deployed; branch API reports protected=false |
| Main development | development/hris-checkpoints | 2a5fe5f4ad7ff2600d5b1d60c7749dbaee0e77cc | Source for current Main UI/release proposals |
| Main release PR #38 | release/hris-integrated-20261020 | 686eec7016ec831e9b679500f28f553b8f93b14f | Draft, broad 516-commit integration, no reviews |
| Candidate production branch | main | 38174c7b607999f951c7eea47aefaa443735080e | Deployed; branch API reports protected=false |
| Candidate release PR #5 | release/candidate-stable-20261017 | e3cb9c178cbfb66eb611c640f885a13581b50f51 | Draft, no reviews |

Main production is https://shihab-tech04.github.io/HRIS-v2/ from successful deployment run 38927896559 at cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7 (2026-10-16). Candidate production is https://shihab-tech04.github.io/HRIS-Candidate-v2/ from successful deployment run 38893422405 at 38174c7b607999f951c7eea47aefaa443735080e (2026-10-16). These remain the deployed versions. No release candidate is LIVE.

## PR #41 Pages parity resolution

The previous exact-head run 39549112107 failed the branch-served Pages asset parity check: checked-in HTML/assets did not match the build output. The root causes were an absent lockfile with ranged dependencies installed by npm install, and Tailwind scanning generated Pages bundles.

PR #41 now contains:
- A package lockfile; CI and deployment installs use npm ci.
- Tailwind exclusions for generated assets and dist, with a contract regression check.
- Regenerated checked-in Pages HTML, JavaScript, and CSS assets.

At PR #41 head 515125ab04b7246532b4608d1db849c4a70f9abf:
- Local clean install, TypeScript, 24/24 source contracts, production build, and repeated build hash comparison passed.
- Exact-head GitHub Actions run 39554019843 passed the Pages asset-parity step and the isolated responsive/sign-in browser smoke.
- Repeat-build SHA-256: index.html afb01a2cc367e6863fd2f25289c4a1b708d334422d642b319a3cec677090d7af; assets/app-DCRYtq80.js f9ff2f2582c7669a229f028717e53f4fa501d6109bb2e291d7d3872fc8e51ce9; assets/app-C0gsnaoV.css a0cbb9a842a7965485c201a8967e18945693f217d88c90f2ab7aaa60169f7d1c.

The recovery-request check accepts a synthetic nonexistent address. It does not establish real email delivery or callback behavior.

## Incoming UI and independent review

| Workstream | Current source | Exact-head CI | Current evidence and release status |
|---|---|---|---|
| WS01 Main PR #49 | 2e24564c837509e12b4cbc69f8b6295cda066c0b | Run 39553849299 passed | Figma attendance/leave source change and browser evidence; no SQL/API changes. Draft, no reviews. |
| WS03 Candidate PR #8 | 28260cdf73b0af312df4cf136b61942f5363b573 | Run 39554069318 passed | Public-only vacancy UI and 12 responsive/state captures with empty public data. Private registration/application stays gated; no approved Candidate Figma frame set. Draft, no reviews. |
| WS04 acceptance PR #45 | be185fef98bc2191b454e738731e57b40cb7d64d | Run 39554082145 passed | Latest audit reports 4 PASS / 0 FAIL / 57 BLOCKED. It passes only the aggregate attendance child-frame contract. Attendance root and leave requests remain blocked. Its comparison still references old WS01 head ed400c05397faca0ff4c568927871a6813071238, so current PR #49 head and artifact need independent review. Draft, no review submission. |
| WS06 PR #42 | fe1ccf111111f3a08522c619c15e28b5290a160e | Draft evidence packet | Ownership/gate audit; no incoming UI code. |
| WS07 PR #43 | 40af3e9f727a5ce64281ba39b0847853791dbf2a | Draft evidence packet | HR03 contract audit; no incoming UI code. |
| WS08 PR #44 | d6b00e513b15b67c0b4c473fb5e6d5c6b2f636db | Draft evidence packet | SA06 master-data contract audit; no incoming UI code. |

Main PR #48 remains a development-based proposal. Its exact run 39457927151 passed the isolated table-privilege test only; no review or full combined exact-head run is recorded. PR #46’s Pages source-scan fix is carried into PR #41. PR #47’s production-privilege proposal remains unmerged and is not production acceptance.

## Hosted security, tenant isolation, and incomplete work

The current hosted security evidence in Main PR #39 is **PARTIAL / NOT ACCEPTED**. The deployed Supabase migration head is 20261020044145.

- Only one active tenant membership is available. No independent HR/Admin or employee production session is available, so hosted cross-tenant acceptance cannot be performed.
- Employee address/family admin-read policies lack a parent-employee tenant predicate. Those child tables also have broad authenticated maintenance ACLs. Production leave_types has full table ACLs for anon and authenticated while its policies are SELECT-only.
- Three employee self-write RPCs are present, but current CI does not execute the required employee/two-tenant tests.
- Seven Candidate/interview RPCs are absent from hosted production. HR01 contact RPCs are also absent. Keep all affected private workflows disabled.
- Hosted advisor output warns of 246 authenticated-executable SECURITY DEFINER routines and one anon-executable SECURITY DEFINER routine. This requires explicit routine-by-routine restriction evidence; isolated tests are not a substitute for hosted acceptance.

The sign-in/recovery screen smoke passed in an isolated browser. It does not prove independent employee/HR sign-in or tenant isolation.

## Recovery and rollback gates

- Source/Git recovery: a mirrored bundle for both repositories was created outside GitHub, checksum-verified, restored into fresh mirrors, and ref/object manifests matched. The first Drive readback archive SHA-256 was e765ffe7b7577599c811f041d8da29383116c4e3dea699554992b575b7fe0482. A refreshed archive must include the new PR #41 commit before release.
- Database recovery: no recoverable production database dump plus isolated restore proof exists. Supabase dashboard access is at a sign-in wall in the connected browser; the current shell has no Supabase CLI or Docker. The existing runbook requires an encrypted source-side dump and isolated PostgreSQL 17 restore proof. This gate remains open.
- Protected integration: GitHub reports protected=false on both production main branches. The connected GitHub integration cannot configure branch protection, and a protected merge/deploy path is therefore not established.
- The missing database restore proof and tenant/security evidence also prevent a production rollback claim.

## Required closure before any merge/deployment

1. Refresh and read back the off-GitHub source archive with current PR #41 history and verified checksum/restore manifest.
2. Produce the encrypted database backup and isolated restore proof through the existing runbook.
3. Close hosted tenant-isolation, RLS, ACL, Auth-session, and RPC-specific acceptance with independent tenant sessions.
4. Have WS04 review current WS01 head 2e24564c837509e12b4cbc69f8b6295cda066c0b and latest evidence; resolve its 57 blocked rows or explicitly exclude them from release scope.
5. Establish an authorized protected integration/rollback path and obtain required reviews on the release and source PRs.

No merge or deployment is authorized by this preflight.

## New WS02 source since this preflight was prepared

Main PR #50, head 89dccad45c35eaee1f9a84f40ce3ec4acc124e80, proposes a tenant-scoped employee-address read policy and restrictive parent-employee guard. Its disposable PostgreSQL 17 check passed on code commit 15b2284312d99c6e524cd36df3d43839b250874b in workflow_dispatch run 39554393758. The evidence-only follow-up is on the latest PR head. PR #50 is still a draft, based on development, and has no review submissions or Main integration. This source check does not establish the policy in hosted production or cross-tenant session acceptance; those remain release blockers.
