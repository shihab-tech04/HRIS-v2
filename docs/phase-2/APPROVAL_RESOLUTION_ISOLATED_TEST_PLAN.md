# Approval resolution fixes — isolated test plan

**State: staged for isolated validation. Do not apply to production.** The SQL candidates live in `supabase/staging/approval-resolution/`, outside the tracked production migration directory. Their comments preserve the existing execute grants and require Auth/RLS certification.

## Why these changes are staged

- The existing leave decision function selects a pending request by ID without constraining it to `synesis_tenant_id()`.
- The existing attendance correction decision function has the same tenant lookup gap and can replace an existing punch with null when a request changes only one field.
- The recovered replacements add tenant predicates and preserve unrequested attendance fields. They do not add permissions or change function signatures.

## Test environment

Use a disposable Supabase branch or local Supabase stack that matches the current production schema. Do not seed production employee data. Create synthetic records for two tenants, two employees, one leave request, one attendance record, and corresponding correction requests. Exercise the functions through real Supabase Auth sessions and the authenticated database role.

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

Capture positive and negative SQL results, before/after row snapshots, audit rows, effective grants, and authenticated browser outcomes. Repeat the existing-record and one-field cases against older synthetic rows. Record the database version and test commit.

The Node contract test checks only source-level predicates, lock statements, audit calls, and grant preservation. It is not a substitute for these database and Auth tests. Keep the UI decision controls unavailable until all cases pass and the isolated function/grant readback matches the candidate.
