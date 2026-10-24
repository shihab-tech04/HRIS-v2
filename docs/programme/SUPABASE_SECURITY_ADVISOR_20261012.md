# Supabase Production Security Snapshot

**Observed:** 2026-10-12 08:36:59 UTC. **Method:** Supabase security advisors and read-only catalog queries against `hrmis-saas` (`oslgwxaqfbteqtwqvdzs`). No production data, policy, function, or Auth setting was changed.

## Findings

### Tenant-scoped reads

Twenty tenant-keyed tables have authenticated `SELECT` grants and a permissive `SELECT` policy with a `has_permission(...)` branch that has no tenant predicate or restrictive tenant guard:

`attendance_corrections`, `attendance_records`, `confirmation_reviews`, `designations`, `employee_leave_balances`, `employee_referrals`, `grades`, `holidays`, `hr_policies`, `manpower_requisitions`, `notices`, `org_locations`, `pay_periods`, `payslips`, `performance_cycles`, `performance_goals`, `project_performance_reviews`, `service_requests`, `shifts`, and `teams`.

The inspected helper checks a live session and active legacy admin, then looks up global `user_roles` and `role_permissions` without tenant membership. `holidays` and `notices` also permit active rows through their current policies. This configuration can allow a signed-in legacy admin to read matching rows from another tenant. A two-tenant Auth test is still required to prove the runtime result and assess row availability.

Four additional tables with `has_permission(...)` policies already include `tenant_id = synesis_tenant_id()` in their policy expressions; those were excluded from the unscoped count. `job_applications` has a global permission expression but no authenticated `SELECT` table grant, so it is not part of the 20-table group. The current Main workspace does not query the 20 listed tables directly; related screens use tenant-scoped RPCs or remain unavailable. This keeps the present UI path narrow but does not certify the database API for multi-tenant release.

### RLS enabled with no policy

The advisor reported 24 public tables with RLS enabled and no policies. Catalog checks found no `SELECT` grant for either `anon` or `authenticated` on those tables, so they are default-deny through the Data API. They remain an integration/availability review item; do not add broad policies merely to clear the advisor notice.

### SECURITY DEFINER functions

The advisor reported 207 `SECURITY DEFINER` functions executable by `authenticated`. The notice is not proof that each function is unsafe: permission-checked RPCs are an existing application pattern. Each exposed function still needs a source and authorization review for `auth.uid()`, role/permission checks, tenant predicates, fixed `search_path`, and least-privilege grants before its module can be accepted. No broad revocation was attempted because it could disable existing workflows.

The advisor also reported `candidate_public_jobs_source()` executable by `anon`. Read-only inspection confirmed that the public `candidate_published_jobs` view has `security_invoker=true` and an `anon SELECT` grant, and it calls this function. The function is the current public vacancy source: it filters to active, published, unexpired jobs for `synesis-it`, masks salary fields when salary publication is false, and returns the published application details used by the Candidate page. The view returns the tenant UUID as well. This public route is used by Candidate; review its complete column contract during public-data acceptance rather than revoking the dependency without a replacement.

### Auth setting

The advisor reported leaked-password protection disabled. This is an Auth configuration item and was not changed. Confirm the intended setting and test password creation/reset behavior before applying it.

## Remediation references

- [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Anonymous access to SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated access to SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## Acceptance state

**NOT ACCEPTED.** Production schema remains unchanged. No disposable Supabase branch exists, and the branch cost lookup awaits organization selection. Before multi-tenant release, add and test tenant-specific RLS or permission contracts for every exposed table/function, verify the public Candidate view, review Auth protection settings, and run positive and negative two-tenant tests. Do not substitute a blanket policy without checking the accepted tenant/role model and preserving own-row access.
