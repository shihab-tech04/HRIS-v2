# WS02 — replacement HRIS hosted parity checkpoint (23 October 2026)

## Scope and safeguards

Replacement Supabase: `xfuxnljfrgvusbrpvxpa` (read-only catalog queries only).
Source: `shihab-tech04/HRIS-v2`, WS02 PR #50 (`work/ws02-production-view-security-20261021`) and WS05 review branch `integration/ws05-main-final-review-20261022` at comparison base `6378089778c470da4115a56c7cb075b4de4dc711`.
The previous `docs/evidence/ws02-production-view-security-20261021.md` concerns **the older HRIS project** `oslgwxaqfbteqtwqvdzs` and must not be mistaken for current hosted evidence.

**Status: HOLD.** No migration, production data, Auth, tenant, storage, user, or role writes were issued. No merge, deployment, or original-database changes were made.

## Fresh replacement-hosted facts

- ACTIVE_HEALTHY; PostgreSQL **17.11**; Auth users **1** (confirmed, signed in); tenants **1**; memberships **0**; employees **5**. These are aggregate-only queries; no personal rows were selected.
- `supabase_migrations.schema_migrations`: **110** replacement clone migrations, latest `20261022142012` (`hris_jobs_candidate_related_read_secure_private_helper`). Relevant earlier target versions `20261022141555` and `20261022142012` hold jobs access work.
- Supabase development branches: **none** returned. A separately authorized isolated QA environment was not discovered on this connected project; never seed test identities into hosted main.
- All six enumerated hosted buckets are private: `attendance-evidence`, `candidate-documents`, `employee-avatars`, `employee-documents`, `expense-receipts`, `leave-evidence`.
- Source file identities: address `20261021060748` blob `bd6d7a17db3bbf0ba9b03648b4e9e8dabe4b6568`; leave ACL `20261021084635` blob `fd39520646e0b409d24c0cbfd779c626fe68ab4d`; jobs `20261022153000` blob `972d0db00b69789d17d7e2376d540db21318deb8`. **Each is byte-identical in WS02 and WS05 integration. Do not introduce duplicates.**
- Additional approval/learning grants exist only under the reviewed WS05 integration names `20261022170700_hris_tenant_approval_rpc_execute.sql` (`c2ddc5cc82036fb47b01311b8025dc6986f5b736`) and `20261022173200_hris_employee_learning_guarded_rpc_execute.sql` (`d49a81664199ff436396902c3686d6b20ea07b31`). Do not guess their RPC signatures.

## Source vs deployed DDL/ACL matrix

| Object | Source requirement | Hosted evidence | Classification |
|---|---|---|---|
| `employee_addresses` | Auth SELECT only; tenant-scoped `employee_addresses_tenant_admin_read` and **restrictive** `employee_addresses_tenant_guard` | Auth SELECT only already; legacy `employee_addresses_admin_read` checks parent employee tenant against `synesis_tenant_id()`, but the restrictive source guard and admin policy name are absent | **Non-equivalent policy DDL**; require isolated behavior proof before any replacement |
| `employee_family_members` | `20261016171104`: own/admin bool helpers and restrictive `employee_family_tenant_guard`; auth SELECT only | Auth SELECT only; legacy admin policy includes parent employee tenant check; `hris_employee_family_own_row(uuid)`, `hris_employee_family_admin_can_read(uuid)` and restrictive source guard absent | **Non-equivalent DDL**; original source migration not recorded in clone history |
| `leave_types` | `20261021084635`: revoke PUBLIC, anon and authenticated; regrant authenticated SELECT | Authenticated SELECT only but `has_table_privilege('anon', ..., 'SELECT')=true`. Four tenant-scoped authenticated read policies, including one restrictive | **ACL mismatch**; anon SELECT grant must be reviewed for removal; RLS may still deny rows but excess grant breaches contract |
| `jobs` | `20261022153000`: authenticated SELECT, guarded `jobs_staff_tenant_read`, `jobs_candidate_related_read`, private candidate helper | Matching core auth SELECT, policies and guarded private function found; no anon direct jobs SELECT; no authenticated direct DML | **Key semantics in place under clone-specific history**; byte-for-byte DDL not certified, do not replay migration |
| Leave and attendance decision RPCs | `admin_resolve_leave_request(uuid,text,text)`, `admin_resolve_attendance_correction(uuid,text,text)`, live-session and tenant checks | Exact signatures and authenticated EXECUTE present, anon denied; function definitions contain live-session and tenant guard text | **Catalog-level match only**, not user JWT authorization proof |
| Learning RPCs | `hris_resolve_learning_completion(uuid,uuid,text,text)` and reviewed `hris_save_learning_program(...)` | Exact signatures and authenticated EXECUTE present, anon denied; guard text present | **Catalog-level match only** |
| Candidate journey | Candidate private account, interview and offer functions; public published jobs only | `candidate_apply_to_job`, `candidate_respond_interview`, `candidate_respond_offer_record`, `admin_schedule_interview`, `admin_update_interview`, `admin_issue_offer` present; anon denied for these RPCs | **Present, runtime tenant checks unproven** |
| Published jobs view | Public safe projection | `candidate_published_jobs` has `security_invoker=true` and `security_barrier=true`; `candidate_public_jobs_source()` is anon-executable SECURITY DEFINER and restricts to published/active/nonexpired `synesis-it` tenant jobs | Review intended public contract, source grants and exposed columns; do not revoke blindly |

**Migration-history gap is not proof of missing live DDL.** Target's clone migrations use different identifiers. Specifically, the three WS02 original versions and WS05 approval/learning original version identifiers are not recorded in the target, yet jobs, approvals and learning key objects exist. Address/family structural guards and one leave_types ACL remain non-equivalent.

## Private storage cross-tenant issue — blocking

`storage.objects` has RLS. Its SELECT rules for `candidate-documents`, `employee-documents`, and `attendance-evidence` are **permissive** and allow `has_permission('recruitment.view/manage')`, `has_permission('employees.view/manage')`, or `has_permission('attendance.view/manage')` without matching the object owner or related data to the **object's tenant**. `has_permission()` is scoped to the *caller's* `synesis_tenant_id()`, not the stored object's tenant. No corresponding restrictive SELECT guard for these buckets was found. This is a structural potential cross-tenant read; perform a real local Auth + Storage two-tenant download test and implement only a source-approved owner/path tenant predicate. Do not infer path layout or patch blindly.

In contrast, `leave-evidence` has a restrictive SELECT tenant guard using `hris_can_access_leave_evidence`; `expense-receipts` joins the tenant-linked expense claim; `learning-completion-evidence` joins tenant-linked enrollment. These still need JWT and storage download acceptance.

## Current exact-head CI evidence

WS02 branch head inspected: `7f3fd0a64d74fcd85268eceb0d45291de719a4eb` before this documentation update. Four synthetic Postgres 17 tests passed:
- Address: run `39809427418`
- Family: run `39809427447`
- Leave-type ACL: run `39809427497`
- Jobs tenant RLS: run `39809419734`

**Full local Auth, browser and PostgreSQL workflow run `39809420012` FAILED at the same head:** 361/388 passed, 27 failed. Error in leave evidence browser: `Tenant-wide weekday holiday was not excluded from the leave preview: 1.` Further failed checks include leave approvals, leave calendar, evidence, notifications and leave ledger reconciliation; not all are certified as one root cause. The suite uses a disposable Supabase CLI GoTrue stack and synthetic two-tenant fixtures. It exercises real local Auth in some paths and SQL under JWT-impersonated role in others; do not represent this as target-hosted PostgREST/RPC verification. Do not relax expectations or silence failures.

## Security advisors

- 28 RLS-enabled/no-policy objects (potentially intended RPC-only tables; inspect before adding policies). https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- 1 anon-executable SECURITY DEFINER `candidate_public_jobs_source()` (appears to be intended published-job API; review). https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- 246 authenticated-executable SECURITY DEFINER functions: catalog warning; review each authorized RPC/guard rather than removing business APIs wholesale. https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Compromised-password protection disabled. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## WS05 safe rollout prerequisites and sequence

1. **Before touching target:** obtain protected WS05 approval; backup full replacement DB schema+data, Auth identities and permissions, storage metadata/objects, current migration ledger, all policy/function/grant definitions; verify encrypted off-GitHub restoration and hashes. Keep original HRIS untouched. Confirm immutable Git refs, authorized reviewed branch and a rollback owner.
2. **Isolated no-cost QA:** reconstruct actual clone parity under PostgreSQL 17 + local GoTrue/PostgREST/Storage, create only synthetic A/B tenants and approved disposable user sessions; prove role/super-admin exclusivity, expirations, denied direct DML, positive writes/audits, storage/download isolation, expected SQLSTATE, persistence and rollback. Repair the 27 failing full-suite cases without changing expectations arbitrarily. No paid infrastructure without authorization.
3. **Source/host delta staging:** rehearse `20261016171104_employee_family_tenant_scoped_read.sql` followed by `20261021060748_employee_addresses_tenant_read_guard.sql` and `20261021084635_leave_types_authenticated_read_only_acl.sql`, **only for differences still present after an exact DDL/ACL snapshot comparison**. Their clone-specific target analogs and migration dependency contracts must be checked first. Apply any storage repair only after approving and testing a verified existing object-owner relationship. The `20261022153000` jobs and WS05 approval/learning RPC migration bodies must not be replayed solely because their historical IDs are missing.
4. **Review and protected release:** WS05 alone decides if/when a transactionally guarded replacement migration is applicable. Verify post-apply catalog diff, real Auth JWT and PostgREST positive/negative results, 2 tenants, audit ledger, unaffected Candidate public endpoints, private storage downloads, and application compatibility. Preserve original migration identifiers and provenance; never fake migration history.
5. **Rollback:** revert an uncommitted migration transaction on first assertion failure; after commit use a rehearsed point-in-time/snapshot restoration plan including grants, policies, Auth/storage state and audit consistency. Do not pretend a SQL `ROLLBACK` can undo already committed DDL. WS05 owns any production rollback.

**Release conclusion:** NOT CERTIFIED. No production SQL run, no hosted write, no destructive action, no migration package authorized for target, no credentials disclosed. This document records currently verified differences and gates for WS05.
