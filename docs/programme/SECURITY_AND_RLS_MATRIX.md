# Security and RLS Matrix

**Checkpoint:** 2026-10-12. No production security configuration was changed.

| Surface | Current evidence | Remaining acceptance |
|---|---|---|
| Admin workspace modules | Client checks supported permissions before exposing the module. | Real authenticated role, stale permission and denied-action tests. |
| Dashboard data | Global candidate account count is omitted from tenant UI. | Verify positive/negative tenant roles in isolated and production-safe tests. |
| Attendance and leave reads | Existing permission-gated RPCs are used. | Authenticated, tenant-bound browser tests; empty/error/loading paths. |
| Employee own-row reads | Live policy inspection found tenant-scoped own-row policies for `employees`, `leave_requests`, and `leave_types`. `hris_own_employee_for_tenant(uuid)` checks `auth.uid()`, the row tenant, employment status, and a live Auth session; execution is limited to `authenticated` (plus database owner/service role). | Verify with ordinary employee and cross-tenant accounts in an isolated branch. The helper returns only one employee ID, so duplicate employee links need an explicit data-integrity decision. |
| Employee attendance and leave balances | `employee_get_my_attendance_v3`, `employee_get_leave_context`, and their `employee_for_auth_user()` resolver still require an active `admin_users` row and the fixed active `synesis-it` tenant. The attendance and leave-balance row policies use the same resolver rather than the own-row helper. The client keeps the richer summary gated to that observed contract; ordinary linked employees use the limited existing RLS-backed leave view. | Design a least-privilege ordinary employee contract, test positive/negative identity and tenant access in isolation, then wire the summary only to accepted contracts. |
| Holiday table | Live policy inspection found `holidays_read` permits active rows without a `tenant_id` predicate. Current UI reads use tenant-filtered HRIS RPCs. | Keep direct holiday table reads out of the client; test a restrictive tenant policy in isolation before any production change. |
| Approval functions | Existing definitions have missing tenant predicates on pending-row lookup. Staged replacements add the guard; attendance replacement uses `COALESCE` for partial values. | Two-tenant positive/negative tests, concurrency, audit preservation, grant/search-path checks and old-record regression. |
| Supabase production | Read-only inspection only. | No migration until isolated proof, rollback evidence and separate approval. |
| Candidate public route | Production build uses public-only route flag. | Real production route and application-write authorization acceptance. |
| Secrets and personal data | `.env*`, `.git`, dependency caches and build output excluded from the local checkpoint archive. | Full source/history credential scan and final backup sanitization. |

Detailed isolated SQL cases are in `docs/phase-2/APPROVAL_RESOLUTION_ISOLATED_TEST_PLAN.md`. Local Docker was unavailable and no Supabase branch exists, so the matrix is not passed.
