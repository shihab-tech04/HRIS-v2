# HRIS release blocker and dependency ledger — WS05 live refresh

**Verified:** 2026-10-20, live ref and hosted checks  
**Decision: HOLD.** Main PR #38 and Candidate PR #5 remain open drafts. No merge, production database write, migration replay, permission change, or deployment occurred in this refresh.

## Current repository refs and release candidates

| Repository | Production main / hosted source | Current development | Frozen release |
|---|---|---|---|
| HRIS-v2 | cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7 | 3f6ea22eb0b7f0e4b4424552694e92652116c196 | PR #38, 686eec7016ec831e9b679500f28f553b8f93b14f, draft |
| HRIS-Candidate-v2 | 38174c7b607999f951c7eea47aefaa443735080e | e3cb9c178cbfb66eb611c640f885a13581b50f51 | PR #5, e3cb9c178cbfb66eb611c640f885a13581b50f51, draft |

Main PR heads: #39 0309e4022dc9db4182900899d99c87d107634411; #40 ecd799a7937af3445e7ebc59eed9f9f5accdd1cf; #41 this ledger refresh; #42 340fb923bffadb1fff4ae2bf243f8843fee2ccb0; #43 779c8130e09281e60af94713de250edeca3703ea; #44 d07c2ebedade943f39482cc6bc603c417d797c0c. PRs #38–#44 remain drafts. PR #42–#44 still target old development base 1714a08e24f47999618b0127fc818a3d19eb187a, behind current development 3f6ea22. Candidate PR #6 is 9c61a3c1a83ea0b2b2b13063c1adef7fcecd25d4, based on current Candidate development e3cb9c1; it is a draft.

## Exact-head CI and build evidence

| Ref | Exact-head result | Release interpretation |
|---|---|---|
| Main development 3f6ea22 | Runner probe 39418704923 PASS; Phase 2A Auth/RLS 39418705013 PASS; disposable Auth/Postgres/browser 39418704906 FAIL (382/384; two HR01-01 cases failed: the denial matrix logs 42501 for each case, and verified-candidate activation returns HTTP 400) | No completed full build/browser result on the current development head. |
| Main PR #38 686eec7 | Auth/RLS 39378140222 PASS; Phase 2A 39378140175 PASS; probe 39378140171 PASS; employee-family privacy 39379214697 PASS | No full build/browser run is recorded on this frozen release head; it lacks later Main development changes. |
| Main PR #39 0309e40 | Build/browser 39417825181 PASS | Docs/evidence workflow only; the production API/security report remains PARTIAL / NOT ACCEPTED. Its source audit references Main b262cade, now behind current development 3f6ea22. |
| Main PR #40 ecd799a | Build/browser 39396642999 PASS | CSV/inventory evidence is not independent certification and is unreconciled with the latest acceptance overlay. |
| Main PR #41 | Build/browser 39419557222 PASS on exact ledger head 11c1bfa0eb408f034b58086543b62ab347b2d177 | Docs-only; this check does not exercise runtime Auth/RLS or close production gates. |
| Main PR #42 340fb92 | Disposable Auth/Postgres/browser 39418189411 PASS; build/browser 39418189536 FAIL at “Verify the branch-served Pages entry matches the production build” | Generated assets app-C4oUgMGJ.js and app-GpVcVTBs.css do not match tracked app-2l-hdvDU.js and app-BWuIahKW.css. Rebase and resolve provenance before rerunning. |
| Main PR #43 779c813 | No exact-head workflow | Stale base; local/source checks do not replace exact-head CI. |
| Main PR #44 b093806 | No exact-head workflow | Stale base; no isolated Auth/Postgres result is claimed. |
| Candidate PR #5 e3cb9c1 | Disposable acceptance 39025809497 PASS on this Candidate SHA | Historical isolated pass; it does not prove acceptance against current Main development or hosted production. |
| Candidate PR #6 9c61a3c | Disposable full-journey run 39419429848 IN PROGRESS. The preceding head 709760c failed CA11-04 because the browser PDF did not contain selected CV profile data; that run used Main fixture source b262cade. Current Main development is 3f6ea22. Record the exact Main dependency used by this run, then fix any remaining issue and rerun at a new exact head. |

## Hosted version and signed-in observations

- Main Pages run 38927896559 succeeded from cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7; the live Main default branch still points to that SHA. Candidate Pages run 38893422405 succeeded from 38174c7b607999f951c7eea47aefaa443735080e; Candidate production main still points to it.
- Read-only signed-in Main inspection shows the available session is hr_admin. Admin View displays two departments. Employee View shows “Database read failed” and “No linked employee profile is available.” Candidate pipeline is denied with “Recruitment view permission is required.” These are live observations; Employee View is a live defect and no independent employee-linked session was available.
- Candidate production remains a public vacancy preview with 0 active positions; candidate registration and applications are unavailable. No Candidate action was submitted.
- Production catalog counts: one active tenant and one active membership with role hr_admin. There is no second production tenant or separate hosted HR/Admin or employee-linked session to certify cross-tenant/role behavior.

## SQL, API, migration, and tenant-security blockers

Production project hrmis-saas has 116 migration rows through 20261020044145. Read-only checks confirmed:

- Migrations 20261020043721 and 20261020044145 are already applied. Do not replay them. HR contact migration 20261014171952 and family tenant-scope migration 20261016171104 are absent.
- Both HR01 contact RPCs are absent: hris_get_tenant_employee_contact_details and hris_update_tenant_employee_contact_details. Production has 0/7 Candidate/interview release RPCs: hris_get_recruitment_pipeline, hris_issue_candidate_offer, hris_schedule_candidate_interview, hris_get_candidate_interview_responses, hris_update_candidate_application_stage, hris_save_candidate_interview_panel_notes, and hris_complete_candidate_interview.
- Three hosted employee self-write functions exist as SECURITY DEFINER: employee_update_my_profile(p_payload jsonb), employee_save_my_addresses_v2(p_rows jsonb), and employee_save_my_family_members_v2(p_rows jsonb). Authenticated EXECUTE is true and anon EXECUTE is false. Their source provenance and focused two-tenant field/ownership tests are unresolved; the latest source scan in PR #39 covered Main b262cade, not current 3f6ea22. employee_update_my_emergency_contacts is absent.
- RLS is enabled on employee_addresses, employee_family_members, leave_requests, leave_types, and candidate_job_alerts. Read-only ACL checks show anon has SELECT, INSERT, UPDATE, and DELETE table privileges on leave_requests, leave_types, and candidate_job_alerts. Authenticated also has TRUNCATE on candidate_job_alerts, employee_addresses, employee_family_members, leave_requests, and leave_types. This is an excess-privilege blocker. Catalog ACLs alone do not prove anonymous row access; no anonymous HTTP acceptance test was run.
- employee_family_admin_read still uses global has_permission checks without a row-tenant predicate. Current SELECT policies include legacy global-permission checks alongside tenant-aware policies. The authenticated role has direct SELECT but no direct INSERT/UPDATE/DELETE on employee_family_members in the catalog check.
- No production DDL, DML, Auth, membership, role, tenant, setting, grant, or migration-history write was made. Do not create production test tenants/users or replay migrations. Resolve on Main-based source and disposable two-tenant Auth/Postgres tests first.

## 1,047 story IDs and Figma parity

- Canonical source remains 1,047 unique story IDs across 153 modules. The current Main development acceptance overlay at 3f6ea22 has blob 818405ca6dbd88863eb8150c058d078216930e04 (same overlay as the previous checkpoint): 39 unique IDs with disposable journey evidence, 8 partial, 14 explicit contract blockers, and 986 unclassified. The groups do not overlap. Zero are independently hosted-certified. The historical 82 verified aggregate has no preserved ID membership and cannot be added to the 39.
- PR #40 CSV at ecd799a has blob 1b7801e3fb1299688188a207b583d98014ecde09: 1,047 unique IDs, 50 IMPLEMENTED_NOT_CERTIFIED, 8 PARTIAL, 989 BLOCKED; every row says hosted acceptance NOT_VERIFIED. This classification does not reconcile with the current overlay.
- CSV Figma values: 966 have no exact story-to-node mapping; 23 have only unapproved/insufficient correspondence; the remaining 58 possible profile/candidate/screen references are unverified or lack visual parity. No independent WS04 1,047-ID reconciliation or Main+Candidate full certification was located in the refreshed PR set. PR #43 records NO_APPROVED_FIGMA_MAPPING and has no implementation desktop/mobile screenshots; PR #44 records no SA06 master-data frame. PR #44’s manager parity audit is explicitly partial; selected browser checks are blocked before launch by missing Chromium. Accessibility acceptance is open. No 100% parity claim is supported.

## Off-GitHub recovery and protected review

- Drive r3 source-bundle hashes remain Main 5caa6734b41714ada8622a4238e099621626d6ea250517c3009a0efa0b4c0c01 and Candidate fe95ce709e79b2ca70eb2f093264059051fdb668688363c39b93bfd1adc0a826. Both October 17 bundles were restored into isolated bare mirrors and passed git fsck; their refs match the production-main SHAs above. These are source backups, not a current development backup or database snapshot.
- Fresh Drive searches returned backup runbooks/manifests but no encrypted production database dump, ciphertext checksum/read-back, or isolated restore proof. The production database backup/restore gate remains BLOCKED.
- GitHub reports no active rulesets for either repo. Branch API reports main and development unprotected in both repos (protected=false; required status checks off). Review submissions on frozen Main PR #38 and Candidate PR #5 are empty. Protected review is BLOCKED.
- No separate four-day Mac checkout/transcript was found; Mac-only changes cannot be confirmed beyond the recoverable Git refs.

## Owner dependency ledger

| Owner | Required next evidence |
|---|---|
| WS01 Main | Fix the live Employee View read-error/no-linked-profile state; investigate Main development run 39418704906 (382/384; two HR01-01 failures including verified-candidate activation HTTP 400); reconcile HR01 contact RPC source/signatures/grants and migration 20261014171952 against current Main 3f6ea22; keep contact actions fail-closed; rerun exact-head build/browser and HR01 tests. |
| WS02 API/security | Reconcile hosted APIs/ACLs with current Main 3f6ea22; prove source parity and own/foreign/unlinked writes in disposable two-tenant Auth/Postgres; review excess anon DML grants and family/leave/alert policies; cover Candidate offer allow/deny; run safe anonymous HTTP and signed-in role acceptance without production writes. |
| WS03 Candidate | Finish current PR #6 run 39419429848 on head 9c61a3c; fix any remaining CA11-04 PDF issue, record the exact Main fixture SHA (the preceding run used b262cade; current Main is 3f6ea22), and rerun full privacy/application/employee-transition acceptance at exact head. Keep production public-only and all unhosted HR actions gated. |
| WS04 story/Figma certification | Reconcile the 1,047-row PR #40 CSV to the 3f6ea22 overlay without double-counting; recover the 82 legacy IDs or leave their overlap UNKNOWN; publish independent story-level Main+Candidate frame/route/role/state and desktop/mobile evidence plus accessibility results. |
| WS06 Employee | Rebase PR #42 onto 3f6ea22; resolve generated/tracked Pages asset provenance with WS01; rerun exact-head build/browser and isolated Auth/RLS. Do not invent employee-write schema. |
| WS07 HR Operations | Rebase PR #43 and run exact-head CI; keep HR03-01 blocked until legal-entity cardinality, fields, authorization, lifecycle, and history are approved; record missing Figma mapping explicitly. |
| WS08 Management | Rebase PR #44 and run exact-head CI; keep SA06 blocked until catalog scope, server writer/API, navigation, tenant/role, retention, and duplicate contracts are approved; publish accurate frame/route evidence. |
| WS05 release control | Keep PR #38 and #5 draft. Require all tenant-security/API/SQL, exact-head CI/build, hosted source parity, real signed-in role journeys, verified off-GitHub database backup/restore, independent WS04/Figma/accessibility acceptance, protected reviews, and URL/source-SHA checks before using the protected merge/deploy workflow. |

## Release decision

HOLD. Do not merge, enable Candidate registration/applications, mutate production records/permissions/schema, or replay applied migrations. Only WS05 may merge/deploy, after every listed gate passes and the hosted URLs confirm the intended deployed commit.
