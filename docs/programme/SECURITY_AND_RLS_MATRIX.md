# Security and RLS Matrix

**Checkpoint:** 2026-10-12. No production security configuration was changed.

| Surface | Current evidence | Remaining acceptance |
|---|---|---|
| Admin workspace modules | Client checks supported permissions before exposing the module. | Real authenticated role, stale permission and denied-action tests. |
| Dashboard data | Global candidate account count is omitted from tenant UI. | Verify positive/negative tenant roles in isolated and production-safe tests. |
| Attendance and leave reads | Existing permission-gated RPCs are used. | Authenticated, tenant-bound browser tests; empty/error/loading paths. |
| Employee summary RPCs | Production helper requires `admin_users.active` and resolves only through `synesis_tenant_id()` (`synesis-it`); client routes only to that verified scope. | A least-privilege employee RPC for ordinary employees, plus isolated positive/negative identity and tenant tests. |
| Approval functions | Existing definitions have missing tenant predicates on pending-row lookup. Staged replacements add the guard; attendance replacement uses `COALESCE` for partial values. | Two-tenant positive/negative tests, concurrency, audit preservation, grant/search-path checks and old-record regression. |
| Supabase production | Read-only inspection only. | No migration until isolated proof, rollback evidence and separate approval. |
| Candidate public route | Production build uses public-only route flag. | Real production route and application-write authorization acceptance. |
| Secrets and personal data | `.env*`, `.git`, dependency caches and build output excluded from the local checkpoint archive. | Full source/history credential scan and final backup sanitization. |

Detailed isolated SQL cases are in `docs/phase-2/APPROVAL_RESOLUTION_ISOLATED_TEST_PLAN.md`. Local Docker was unavailable and no Supabase branch exists, so the matrix is not passed.
