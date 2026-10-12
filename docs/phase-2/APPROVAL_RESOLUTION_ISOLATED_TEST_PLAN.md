# Approval resolution fixes — isolated test plan

**State: LOCAL SQL/AUTH CASES PASS (42/42); NOT production-certified.** The exact SQL candidates live in `supabase/staging/approval-resolution/`, outside the production migration directory. They were applied only to a disposable local Supabase CLI stack together with the current tenant-membership release candidate. Do not apply to production as part of this checkpoint.

## Why these changes are staged

- The existing leave decision function selects a pending request by ID without constraining it to `synesis_tenant_id()`.
- The existing attendance correction decision function has the same tenant lookup gap and can replace an existing punch with null when a request changes only one field.
- The recovered replacements add tenant predicates and preserve unrequested attendance fields. They do not add permissions or change function signatures.

## Test environment

Use a disposable Supabase branch or local Supabase stack that matches the current production schema. Do not seed production employee data. The executed run used a free local CLI stack at API/database ports 55421/55422, eight synthetic Auth identities across two tenants, two employees, two distinct tenant-A managers, one private scratch evidence bucket, and synthetic leave/attendance requests. The runner refuses a non-empty Auth service, mismatched ports, a non-empty bucket, or a different Docker context. The existing `colima-t` Auth runtime was left untouched.

Before applying the candidates, record the baseline function definitions, execute grants, relevant policies, and migration version. Apply both candidate files only in that isolated target.

## Required cases

| Case | Expected result |
|---|---|
| Active leave manager approves a pending request in their tenant | Request resolves once; the correct tenant balance moves pending days to used days; one audit row records the actor and decision. |
| Active leave manager rejects a pending request in their tenant | Request resolves once; pending days are removed; used days do not increase; one audit row is written. |
| Manager from tenant B submits tenant A request ID | Function returns the expected not-found/denied result; request, balances, and audit log remain unchanged. |
| Caller lacks `leave.manage`, has a revoked session, or is anonymous | Function rejects; no request or balance changes. |
| Leave request spans a year boundary, weekly-off day, or configured holiday | Recalculated days match the existing employee calculation policy for the request owner; each year updates only its matching balance ledger. |
| A required employee balance ledger row is absent | Transaction fails without partially resolving the request or changing other yearly balances. |
| Active attendance manager approves a pending correction in their tenant | Correction resolves once; write and audit rows stay in that tenant. |
| Manager from tenant B submits tenant A correction ID | Function returns the expected not-found/denied result; no attendance or audit rows change. |
| Correction changes only check-in | Existing check-out, work mode, client name, and status are preserved. |
| Correction changes only check-out or work mode | Every unrequested existing punch and field is preserved. |
| Existing attendance row is absent | Approved correction follows the established `admin_save_attendance` behavior and creates no cross-tenant row. |
| Two managers resolve the same pending record concurrently | Exactly one decision succeeds; the other observes no pending request; balances and audit records change once. |
| Caller lacks `attendance.manage`, has a revoked session, or is anonymous | Function rejects; no correction or attendance changes. |

## Acceptance evidence

Executed the plan with `node tests/sql/isolated-auth/run-local.mjs`; the latest run passed 42/42 checks. Evidence includes positive/negative two-tenant queries, effective `EXECUTE` privilege readback (`anon=false`, `authenticated=true`, `service_role=true` for the tested functions), before/after request/balance/attendance rows, audit counts, inactive membership and revoked-session denials, and concurrency from two different managers. Check-in-only, check-out-only, and work-mode-only corrections preserved omitted fields; a missing attendance row was created through the existing save contract. The runner also covered the exact staged SQL files.

The run is local synthetic acceptance only. It does not certify authenticated browser journeys, all schema policies, all SECURITY DEFINER functions, or the 1,047-story catalogue. Production schema, data, grants and Auth settings were not changed. The Node source-contract suite remains a separate check.
