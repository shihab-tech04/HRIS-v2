# HRIS release blocker and dependency ledger — live refresh

**Verified:** 2026-10-20 17:50 Asia/Dhaka  
**Decision: HOLD.** Main PR #38 and Candidate PR #5 remain open drafts. No merge, production database write, migration replay, permission change, or deployment was performed in this refresh. This section supersedes the earlier point-in-time statuses in this file; Git history retains the prior snapshot.

## Current refs and release candidates

| Repository | Production main | Current development | Frozen release |
|---|---|---|---|
| HRIS-v2 | cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7 | b262cade4175fc98cac56af05f88c3d16e68dc53 | PR #38, release/hris-integrated-20261020, 686eec7016ec831e9b679500f28f553b8f93b14f, draft |
| HRIS-Candidate-v2 | 38174c7b607999f951c7eea47aefaa443735080e | e3cb9c178cbfb66eb611c640f885a13581b50f51 | PR #5, release/hris-integrated-20261020, e3cb9c178cbfb66eb611c640f885a13581b50f51, draft |

Main open PRs: #13 draft; #35 open/ready; #36–#44 open drafts. Candidate open PRs: #3, #5, and #6, all drafts. PR #37 is on a divergent checkpoint base. No unrelated PR is approved for integration. Main development and Candidate development have not moved the frozen release heads.

## Exact-head workflow results

| Ref | Current head | Exact-head evidence | Release interpretation |
|---|---|---|---|
| Main development | b262cade4175fc98cac56af05f88c3d16e68dc53 | Disposable Auth/RLS run 39397459369 PASS; Phase 2A run 39397459373 PASS; runner probe 39397459353 PASS | No full build/browser result on this head. These are isolated tests, not hosted acceptance. |
| Main PR #38 | 686eec7016ec831e9b679500f28f553b8f93b14f | Disposable Auth/RLS 39378140222 PASS; Phase 2A 39378140175 PASS; runner probe 39378140171 PASS; employee-family privacy 39379214697 PASS | No full build/browser run is recorded on the frozen release head. It also lacks later Main development changes. |
| Main PR #39 | 4282085312e1963e1fc90082677bbb89e43d35d1 | Docs/build/browser run 39398288647 PASS | Evidence document only; PR remains PARTIAL / NOT ACCEPTED. |
| Main PR #40 | ecd799a7937af3445e7ebc59eed9f9f5accdd1cf | Docs/build/browser run 39396642999 PASS | The audit files are stale against the current development overlay; not certification. |
| Main PR #41 | Controller ledger branch; this refresh commit | Prior docs/build/browser run 39396919133 PASS on the prior head | This change is docs-only. The new exact head and its check will be verified after the update. |
| Main PR #42 | 4a7656325b9e8cc3a99e47535d937dc7ff1feba9 | Disposable Auth/Postgres/browser 39397073988 PASS; build/browser 39397073999 FAIL at Pages asset parity | Base is stale at 1714a08. Failure compares generated app-C4oUgMGJ.js / app-GpVcVTBs.css with tracked app-2l-hdvDU.js / app-BWuIahKW.css. |
| Main PR #43 | 779c8130e09281e60af94713de250edeca3703ea | No exact-head workflow | Base is stale at 1714a08; local readiness results do not satisfy current-head CI. |
| Main PR #44 | f4c44bf52c4041232d591746651ee409ccf8c120 | No exact-head workflow | Base is stale at 1714a08; no isolated Auth/Postgres result is claimed. |
| Candidate PR #5 | e3cb9c178cbfb66eb611c640f885a13581b50f51 | Candidate disposable acceptance 39025809497 PASS on this Candidate SHA | It is an older run and does not prove acceptance against current Main b262cade or hosted production. |
| Candidate PR #6 | 3427678feb72e61e17420509e3eb4980cc68a672 | Candidate privacy/full-journey run 39397992774 FAIL | The run passed CA10–CA13 markers and then failed CA14: withdrawing an application removed it from history or hid another completed application. Fix and rerun at the new exact head; record the Main dependency SHA. |

## Current hosted and production evidence

- Main Pages run 38927896559 completed successfully from current production-main SHA cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7. Candidate Pages run 38893422405 completed successfully from current production-main SHA 38174c7b607999f951c7eea47aefaa443735080e. Both GitHub main refs still equal those source SHAs.
- Fresh read-only browser inspection of Main loaded the authenticated workspace and Admin View. The visible tenant role is hr_admin; the page shows a read-only integration foundation, two department records, and no visible employee records. Candidate pipeline access is correctly denied to this session. Employee View currently shows both “Database read failed” and “No linked employee profile is available”; no browser console errors appeared. Treat this as a live UI defect, not a passing employee journey.
- Candidate remains a public vacancy preview with 0 active positions; candidate registration and application submission are disabled.
- Read-only production counts show one active tenant and one active tenant membership, with role hr_admin. There is no separate hosted HR/Admin or employee-linked session and no second production tenant. Synthetic two-tenant CI cannot certify hosted tenant isolation.

## SQL, migration, and authorization blockers

The connected production project is hrmis-saas. Its migration ledger has 116 rows through 20261020044145. Read-only catalog checks show:

- PR #37 migrations 20261020043721 and 20261020044145 are already applied. Do not replay them. Migrations 20261014171952 (HR contact source) and 20261016171104 (family tenant-scoped read) are absent from production.
- The two HR01 contact routines hris_get_tenant_employee_contact_details and hris_update_tenant_employee_contact_details are absent. The three hosted employee self-write routines employee_update_my_profile(p_payload jsonb), employee_save_my_addresses_v2(p_rows jsonb), and employee_save_my_family_members_v2(p_rows jsonb) exist, but source provenance/parity and focused two-tenant field/ownership tests remain unresolved. employee_update_my_emergency_contacts is absent.
- Production has 0/7 Candidate/interview release RPCs: hris_get_recruitment_pipeline, hris_issue_candidate_offer, hris_schedule_candidate_interview, hris_get_candidate_interview_responses, hris_update_candidate_application_stage, hris_save_candidate_interview_panel_notes, and hris_complete_candidate_interview. The offer-issuance positive/negative case also remains uncovered in disposable acceptance.
- employee_family_admin_read uses global has_permission checks without a row-tenant predicate. employee_family_members has authenticated SELECT plus TRUNCATE, REFERENCES, and TRIGGER privileges; direct authenticated DML is false in the catalog query.
- leave_requests and leave_types have RLS enabled but also anonymous table-level SELECT and INSERT grants. candidate_job_alerts has anonymous SELECT and INSERT grants; its row policy targets authenticated owners. The live catalog is not an anonymous HTTP rejection test. The production HTTP check could not be executed through the read-only browser evaluation surface, so anonymous HTTP acceptance remains NOT RUN.
- Current deployed has_permission is tenant-scoped; the separate System Administrator’s legacy user_roles do not substitute for active tenant membership. Do not add a global fallback, new membership, role, tenant, or production test data.

No production migration or API mutation is approved. Source parity must be reviewed on a Main-based branch and tested in a disposable two-tenant stack before any production change.

## Story and Figma acceptance

The current Main development overlay at b262cade has blob 818405ca6dbd88863eb8150c058d078216930e04. It records 39 unique story IDs with disposable journey evidence, 8 partial IDs, 14 explicit contract blockers, and 986 unclassified IDs; the groups do not overlap. None is independently hosted-certified. The historical 82-story aggregate has no preserved ID membership and must not be added to the 39.

PR #40’s CSV at ecd799a has blob 1b7801e3fb1299688188a207b583d98014ecde09 and 1,047 unique rows: 50 IMPLEMENTED_NOT_CERTIFIED, 8 PARTIAL, and 989 BLOCKED. Its implementation count is unreconciled with the current overlay. All 1,047 CSV rows say hosted acceptance NOT_VERIFIED. The CSV records 966 rows with no exact Figma-node map, 23 with only unapproved/insufficient contract correspondence, and 58 possible screen references that remain unverified or lack visual parity.

WS04 has not published the refreshed 1,047-ID reconciliation or an independent Main+Candidate screen certification. WS07’s PR #43 contains one HR03 Figma candidate screenshot but records NO_APPROVED_FIGMA_MAPPING; it is not a parity PASS. WS08’s PR #44 reports no SA06/master-data frame. The Candidate development tree has no independent parity matrix. The required gate remains 100% approved Figma frame → route → role/state → desktop/mobile evidence, with every absent/failed mapping explicit. Accessibility acceptance is also open. No 100% parity claim is supported.

## Off-GitHub recovery and repository protection

- The Drive r3 manifest and local bundles agree byte-for-byte: Main SHA-256 5caa6734b41714ada8622a4238e099621626d6ea250517c3009a0efa0b4c0c01; Candidate SHA-256 fe95ce709e79b2ca70eb2f093264059051fdb668688363c39b93bfd1adc0a826. Both bundles restored into isolated bare mirrors and passed git fsck; their backup refs match production-main cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7 and 38174c7b607999f951c7eea47aefaa443735080e. These are October 17 source backups, not a backup of current development work.
- Drive searches found runbooks/manifests and code checkpoints, but no encrypted production database dump, checksum/read-back receipt, or isolated database restore proof. The production database backup/restore gate is BLOCKED.
- No independent four-day Mac checkout or transcript is available in this workspace; Mac-only changes cannot be confirmed beyond the recoverable Git refs.
- GitHub repository rulesets are empty. The branch-protection endpoints returned 403 to this integration, so classic protection cannot be verified. Review lists for frozen PR #38 and #5 are empty. Required protection and independent approval remain BLOCKED.

## Owner dependency ledger

| Owner | Required next evidence |
|---|---|
| WS01 Main | Fix the live Employee View’s generic read-failure state; preserve fail-closed contact editing; reconcile contact RPC source/signature/grants and migration 20261014171952 without replay; rerun current-head build/browser and exact HR01 cases. |
| WS02 API/security | Publish source-backed signature/grant/provenance for all hosted self-write routines; add disposable two-tenant own/foreign/unlinked tests; complete Candidate offer allow/deny tests; reconcile family/leave/alert ACL and policy behavior; run anonymous HTTP and authorized HR/Admin/employee role tests. No production writes. |
| WS03 Candidate | Fix the exact CA14 withdrawal/history failure on #6; rerun full acceptance and record current Main SHA b262cade; prove candidate-to-employee/privacy/tenant cases in isolated flows. Keep production public-only. |
| WS04 story/Figma certification | Reconcile PR #40 CSV against the b262cade overlay without double-counting; keep the 82 legacy IDs unknown unless recovered; then publish independent route/frame/role/state/mobile/desktop evidence for Main and Candidate and accessibility status. |
| WS06 Employee | Rebase #42 onto current Main development b262cade, resolve asset provenance with WS01, rerun build/browser and isolated Auth/RLS at exact head; do not invent self-write contracts. |
| WS07 HR Operations | Keep HR03-01 blocked pending approved legal-entity cardinality/fields/authorization/history linkage; rebase #43 and run exact-head CI; record absent Figma mapping explicitly. |
| WS08 Management | Keep SA06-01..04 blocked until catalog scope, server write/API, navigation, tenant/role, retention, and duplicate contracts are approved; run exact-head tests and record absent Figma mappings. |
| WS05 release control | Keep #38/#5 draft. Require passing exact-head CI/build, source-to-hosted API/SQL parity, real signed-in role journeys and tenant isolation, verified database backup/restore, independent Figma/accessibility acceptance, protected review, and public URL/source SHA verification before merge/deploy. |

## Release decision

HOLD remains. Do not merge, enable Candidate sign-up/applications, mutate production records/permissions/schema, or replay applied migrations. Only WS05 may use the protected release workflow after every gate above passes and the final live URL confirms the deployed commit.
