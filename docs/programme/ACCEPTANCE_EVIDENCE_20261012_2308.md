# Acceptance Evidence — 2026-10-12 23:08 Asia/Dhaka

**Scope:** Local Phase 19 tenant-read authorization repair.  
**Local Main commit:** `2d8216e3f70574c9a3e8241192b1f52f10517483`.  
**Decision:** PASS for the isolated local scope; NOT ACCEPTED for production/release.

## Implemented behavior

`supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql` adds membership-scoped permissive SELECT policies for the 17 previously uncovered HRIS tables and restrictive membership-role guards for all 20 tables in the earlier security snapshot. Existing permission checks are evaluated against the active membership's `roles.id` and `role_permissions`; employee-owned rows and active tenant notices/holidays preserve their scoped read paths. The migration is a local release candidate only.

The policy set covers `attendance_corrections`, `attendance_records`, `confirmation_reviews`, `designations`, `employee_leave_balances`, `employee_referrals`, `grades`, `holidays`, `hr_policies`, `manpower_requisitions`, `notices`, `org_locations`, `pay_periods`, `payslips`, `performance_cycles`, `performance_goals`, `project_performance_reviews`, `service_requests`, `shifts`, and `teams`.

## Runtime and regression results

| Check | Result | Evidence limits |
|---|---:|---|
| Local Auth/RLS: `node tests/sql/isolated-auth/run-local.mjs` | **69/69 PASS, 0 FAIL** | Disposable local Supabase only; synthetic Auth identities/data. Both tenants read their own authorized rows across all 20 tables. Cross-tenant reads, global-role-only reads and anon reads are denied. |
| Prior tenant-security failures | **5/5 PASS** | Includes both directions of attendance row isolation, tenant A dashboard/attendance/leave RPC denial to tenant B, and denial of tenant A leave and attendance decisions. |
| Code/contract/build: `npm run check` | TypeScript PASS; **43/43 contracts PASS**; Vite build PASS | Build retains the previously known 728.46 kB bundle advisory. |
| Chromium: `HRIS_TEST_PORT=4248 npm run test:e2e` | **38/38 PASS** | Synthetic Auth/RPC/storage, external requests blocked. |

The first two SQL iterations each had 68/69 checks pass while tenant B lacked same-tenant table reads. Adding membership-scoped permissive policies fixed the product behavior; the final runs passed 69/69. The first browser attempt did not start because the sandbox denied a loopback bind; the authorized local rerun passed all 38 tests. No production data, policies, Auth settings, or other local Auth runtime were changed.

## Production release blocker

Read-only production metadata currently lists role IDs `1`, `12345`, `hris_system_admin`, and `nadiaaa`; it lists no `hr_admin` or `hr_recruiter` roles and zero tenant membership rows. The allowed membership role values therefore do not currently resolve to any production role. Do not apply this migration until the user's HR role mapping and membership assignments are reconciled and verified. The migration has not been applied to production.

The connected Supabase branch-cost lookup returned `UNAVAILABLE`; no branch or paid feature was created. The remaining security review, Candidate confidentiality tests, product acceptance, recovered story source, and release gates remain open.

## Canonical story traceability

The expected 1,047-story / 153-module matrix SHA-256 is `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The task's mounted Project `sources/` folder remains empty. The local tracking skeleton remains untouched at SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. **0/1,047 stories mapped and accepted; 1,047 pending authoritative source access and story-level evidence mapping.** No criteria or IDs were reconstructed.

## Release order

This is a recoverable development checkpoint only. No GitHub push or deployment occurred. Finish and verify the complete product, create and read back the full source archive in the account-owned Drive folder, then perform the final GitHub push and deployment.
