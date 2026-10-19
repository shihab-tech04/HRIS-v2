# Gate B — hosted SQL/API parity (18 October 2026)

Status: **BLOCKED**. This is the first read-only inventory against the hosted `hrmis-saas` Supabase project (`oslgwxaqfbteqtwqvdzs`), not a migration approval, a production change, or a completed employee acceptance test.

## Reproducible check

Run [`tests/sql/hosted-parity/check-read-only.sql`](../../tests/sql/hosted-parity/check-read-only.sql) through the **intended HRIS** Supabase project's SQL Editor or read-only `execute_sql` connection. It reads PostgreSQL catalogs only: no user rows, mutation, credential extraction, grant change, or DDL.

Observed result on 18 October: **0 passed / 25 failed**. This means the **17 October source API contract is not deployed**; it does **not** mean all existing hosted HRIS behavior is broken.

| Gate check | Passed | Failed | Finding |
| --- | ---: | ---: | --- |
| Required callable function signatures and role grants | 0 | 14 | Source versions of dashboard, documents, identity, requests, attendance, directory, roster and profile RPCs are absent |
| Private roster trigger function and access | 0 | 1 | Not present on hosted |
| Prerequisite helpers and tables | 0 | 4 | `has_tenant_permission(uuid,text)`, `hris_is_active_tenant_member(uuid)`, `roster_change_notifications`, `employee_shift_assignment_changes` absent |
| Retired tenant-implicit profile RPC overloads | 0 | 4 | All four old signatures remain callable by `authenticated`; replacement RPCs are absent |
| Tenant policy shape | 0 | 2 | Restrictive notices membership/audience guard absent; profile-change policy exists but uses the old Synesis-pinned predicate |
| **Total** | **0** | **25** | **Release gate blocked** |

## Migration-history drift is broader than the last 12 files

- Main development source has **98** SQL migration files from 11–17 October, including **12 dated 17 October**.
- Hosted `list_migrations` reports **111** versions spanning 3–16 October; latest recorded version is `20261016155538` (`employee_family_members_self_read_policy`).
- **No local source version ID exactly equals a hosted migration version ID**. Earlier hosted entries often use different timestamps/names for corresponding features, so **98 mismatches must not be treated as 98 absent schema changes**. Object-level comparison and provenance reconciliation are mandatory before marking an earlier file pending or replaying it.
- The source `20261012091930` permission helper and `20261012230100` membership helper are both absent as actual hosted functions. The 17 October notices and roster changes depend on them. `roster_change_notifications` is created by source `20261016230201`; the 17 October roster history migration alters it, so applying the 17 October files in isolation would not be safe.

## Code/API impact already established

- `src/live/EmployeeDocumentVault.tsx` calls `hris_get_my_employee_documents`.
- `src/live/EmployeeIdentityCard.tsx` calls `hris_get_my_employee_identity_card`.
- `src/live/EmployeeDashboardPendingRequests.tsx` calls `hris_get_my_pending_requests`.
- `src/live/OrganizationEmployeeDirectory.tsx` calls the seven-argument `hris_get_tenant_employee_directory_v2`.
- `src/live/ProfileChangeRequests.tsx` and `src/live/LiveSystemWorkspace.tsx` call the new tenant-explicit profile-change API; hosted only has old overloads.
- `src/live/LiveHrisWorkspace.tsx` calls `hris_get_my_dashboard_data` and `hris_change_tenant_employee_shift`.
- The hosted `notices` policy allows `authenticated` reads when `active = true`, without a visible tenant predicate in that policy. This is a **review finding**, not proof of a cross-tenant exploit; role grants, effective policies and authenticated isolation testing must be assessed together.

## Controlled reconciliation sequence

1. **Inventory / provenance:** map each of the 98 local files to hosted equivalents or genuine deltas by catalog object/signature and documented historical deployment, not timestamp equality alone. Preserve the hosted migration history.
2. **Prerequisite chain:** establish the tenant membership/permission contract, authorization policies and roster notification structures on a disposable or separately authorized development database. Validate column types, FK dependencies, function permissions, trigger behavior and tenant isolation in order.
3. **17 October API compatibility:** run the twelve migrations in order on that controlled database, then rerun the 25-check SQL gate. Verify the four tenant-implicit profile RPCs are retired without retaining an unintended overloaded public endpoint.
4. **Journey acceptance:** test authenticated employee self-service and an authorized manager across two tenants (including negative/anon/inactive membership cases), browser→RPC→row-level data, desktop/mobile and EN/BN. Do not reclassify any canonical story until its exact ID/evidence is verified.
5. **Production promotion:** only with clean migration provenance, hosted security/RLS review, green isolated Auth/Postgres/browser regression, UI parity and explicit release decision. No production SQL or website deployment was performed in this checkpoint.

The [canonical acceptance overlay](USER_STORY_ACCEPTANCE_OVERLAY.json) remains the source for count-qualified evidence: this SQL preflight check alone establishes **zero additional VERIFIED stories**.

## Read-only hosted recheck — 19 October 2026, 10:06 Asia/Dhaka

The same catalog-only Gate B query was rerun against HRIS Supabase `oslgwxaqfbteqtwqvdzs` after the minimal Phase 03 role transition. It still returns **0/25 PASS**. The live history now contains **113** migration records, latest `20261019024848`; this count is descriptive only and is not a proposal to replay or rewrite that history.

The read-only Phase 03 postflight independently confirms one active configurable `hr_admin` with exactly `organization.manage`, one eligible active membership, all 45 legacy `hris_system_admin` grants retained, the other active administrator retained, one migration audit record, and the active-Auth bootstrap helper. These role-transition facts do not satisfy the missing Phase 04 API contract.

Current catalog gaps remain the two membership helpers, roster notification/history prerequisites, required employee and profile-change RPCs, the private roster trigger, and removal of four tenant-implicit profile overloads. The live notice restrictive policy is `hris_notices_legacy_security_guard`; it limits the existing single-tenant topology and leaves the old permissive policy in place behind that guard. It is not the required future multi-tenant `hris_notices_membership_guard`. The profile-change read policy remains pinned to `synesis_tenant_id()`. Phase 03 module installation also fails closed because `travel_request_notifications`, `learning_completion_events`, and `learning_completion_notifications` are absent.

No SQL or user rows were changed during this recheck. The local Main worktree has the current Phase 03/04 source checkpoint, but the tracked remote development branch has not yet received those uncommitted files. No story is newly marked accepted.

## Read-only hosted and migration compatibility recheck — 19 October 2026

The latest catalog-only probe still returns **0/25**. The hosted migration ledger has **113 records through `20261019024848`**. This remains a descriptive history; no pending migration list is authorization to replay it.

- The verified `hr_admin` role still has only `organization.manage`, with the sole verified platform Super Admin membership. The other active administrator has 45 retained global `hris_system_admin` grants and no tenant membership. Mapping that account to a tenant role would make those grants effective for tenant-scoped APIs, so it remains a business authorization decision.
- Read-only table inventory reports 10/13 required guarded module tables present. Production is missing `travel_request_notifications`, `learning_completion_events`, and `learning_completion_notifications`; the source migrations `20261015022305` and `20261014160000` do not appear in the recorded hosted migration list. No missing migration was replayed.
- The live notices restrictive policy remains `hris_notices_legacy_security_guard`; `hris_notices_membership_guard` is absent. Main now stages a narrowly scoped retire script that validates the replacement policy and the exact legacy policy definition before dropping that one policy. Its rehearsal runs only in a rolled-back disposable PostgreSQL transaction. Production has not run it.
- Main exact-head disposable run 39203699636 passed 362/362 Auth/RLS checks, the rolled-back notices-policy retirement rehearsal, and the revised source Gate B at 25/25; the disposable security advisor found no issues. This does not certify the hosted production API, Auth, RLS, Storage or browser behavior, where Gate B remains 0/25.

No production DDL, data, Auth users, policy grants or website versions changed. Phase 03 remains **IN PROGRESS / NOT ACCEPTED** until Gate B, the required module tables, the administrator's tenant-role decision, and live postflight acceptance are resolved.
