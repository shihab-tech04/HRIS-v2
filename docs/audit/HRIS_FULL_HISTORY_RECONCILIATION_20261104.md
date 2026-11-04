# HRIS full-history branch consolidation — exact-Main reconciliation

**Audit:** 4 November 2026. **Authoritative pre-audit Main:** `939d3e1b2869b3ae0edbbca1ecbbbe1bbcce4067` (protected). **Owner policy:** preserve newer approved UI/SQL, one Super Admin, do not restore old synthetic/password accounts or bypass protected releases.

## Verified source and recovery

- Independently restored complete Git-history archive of `939d3e1b`; `git fsck --full --no-reflogs` PASS.
- Archived remote refs and live GitHub listing match by name and commit SHA: **228 total refs = Main + 227 other refs**, FNV-1a32 canonical inventory digest `7d8b9cae`.
- Archived ZIP SHA-256: `80f48fa7042e36a8898e256e17f7c5a8525e3a37fd60e0a8c61c17bae2d94575`. Off-GitHub recovery: https://drive.google.com/file/d/1ySe40h1dYRrFPkX7SCBv2h4E06KpibpG/view.
- `HRIS_227_BRANCH_TIP_RESOLUTION_20261104.csv` records every non-Main branch's exact SHA and source disposition. Previously reviewed 65 unchanged historical exact-SHA entries remain in `HRIS_65_HISTORICAL_BRANCH_DISPOSITIONS_20261104.csv`.

## Mutually exclusive disposition groups

| Decision | Historical refs | Action |
|---|---:|---|
| Git ancestry already contained in Main | **71** | Do not merge again |
| Diverged; no unmatched current app/SQL source among branch-introduced `src/`, `supabase/` paths | **89** | Retain recovery history; older one-off workflows/tests may differ |
| Previously reviewed 65 source divergences | **65** | Preserve source decisions; complete hosted gates separately |
| Two newer-Main source replacements | **2** | Do not restore obsolete changes |
| **Total** | **227** | All branch refs have an explicit disposition |

The **65**: 24 historical Employee Profile/certificate source variants (current PR #159 source, hosted migrations missing); 18 old Auth/SQL/shell variants (superseded, hosted role/RLS acceptance pending); 11 old Figma/locale variants (current UI retained; visual acceptance pending); 7 HR03/job variants (current tenant-safe versions retained; hosted acceptance pending); 2 E02-09 employment code recovery variants (PR #170 forward-ported); 3 deliberately excluded synthetic/password provisioning variants.

### Two independently reconciled additional source diffs

1. `integration/ws05-hr03-current-main-20261031`: the only branch-introduced app/SQL file differing from current Main is `src/live/LiveHrisWorkspace.tsx`. Main PR #171 removed the synthetic-user component import, PageId, navigation item and rendered screen. Restoring the old branch would reintroduce prohibited behavior.
2. `integration/ws05-release2-employee-profile-20261031`: the only branch-introduced app/SQL file differing from current Main is `src/live/EmployeeProfileFigma.tsx`. Main PR #170 adds the approved designation/department/grade code display with tenant-scoped employment data. Restoring the old source would erase the fix.

These statements are limited to branch-introduced **application/SQL source** path content at the audited SHAs. They are not claims that all historical docs, tests, scripts, one-time CI workflows or every scenario are semantically identical. The full-history diff also contains obsolete one-time build/recovery workflows, retired SQL migrations, and disallowed synthetic/password UI and tests. They must not be force-merged merely to increase ancestry.

## Required final product gates — outside this source-only reconciliation

1. Protected HRIS 360 Profile SQL release: two versions `20261027040642` and `20261030114500` absent hosted (0/2), Profile bank table and read RPC absent on 4 Nov. Use `ws05-employee-profile-sql-release.yml` with authorized manual approval and verified backup; do not bypass.
2. Hosted signed-in Profile CRUD, cross-tenant/RLS denial, private file access and approved Figma acceptance.
3. Exact post-release Main Pages dispatch through protected `deploy-pages.yml`, then verify actual served assets and role journeys.
4. Full 1,047-story evidence: no inference of 100% functional completion from PR closure or branch history.

## Merge policy

**Do not auto-merge all 156 divergent historical heads.** Divergence includes superseded and explicitly excluded work. Safest source consolidation is to retain the latest protected implementation, audit exact active-source diffs, forward-port approved missing behavior through an exact-head tested PR, and preserve independent off-GitHub recovery.

The report and CSV are a source-only historical reconciliation checkpoint, **not** a production release or comprehensive hosted acceptance certificate.
