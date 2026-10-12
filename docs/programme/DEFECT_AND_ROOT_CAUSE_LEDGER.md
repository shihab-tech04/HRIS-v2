# Defect and Root-Cause Ledger

**Checkpoint:** 2026-10-12.

| Defect / risk | Root cause evidence | Correction in checkpoint | Remaining proof |
|---|---|---|---|
| Authenticated admin route showed a generic record explorer | `LiveSystemWorkspace` route did not represent the supported HRIS modules and existing design architecture. | Replaced route with permission-gated `LiveHrisWorkspace` using observed RPCs. | Compare actual authenticated role screens against approved Figma and existing design shell; test roles in browser. |
| Employee self-service RPCs reject ordinary linked employees | Production `employee_for_auth_user()` requires an active `admin_users` row and matches the fixed active `synesis-it` tenant. Both employee summary RPCs call that helper. | Client routing is constrained to the verified active-admin/Synesis-employee contract; ordinary linked employees are not sent to an RPC path known to reject them. | Approve and implement a least-privilege employee RPC contract, test it in isolation, and verify employee RLS journeys. |
| Duplicate Admin View entry | Conflicting route/navigation path in the authenticated admin flow. | Removed duplicate route from `LiveApp`. | Verify navigation across all authorized roles. |
| Unsupported/global dashboard values could leak into tenant summary | Dashboard RPC includes a global candidate count. | Count is not rendered; unsupported values remain unavailable. | Validate tenant data and role behavior in authenticated tests. |
| Approval functions could resolve a pending record without tenant predicate | Read-only inspection of current production function definitions. | Tenant-scoped replacements staged outside production migrations. | Isolated cross-tenant, concurrency, audit and prior-record tests; no production apply yet. |
| Partial attendance correction could clear untouched values | Existing replacement pattern accepted nulls for omitted fields. | Staged SQL preserves existing values with `COALESCE`. | Execute partial-field, null and concurrency cases in isolated PostgreSQL. |
| Candidate search could run from unsent input / stale response could win | Search request was coupled to changing input and had no latest-request guard. | Search now uses submitted text and latest-request protection. | Browser race test against real public data contract. |
| Saved-job load could interfere with vacancy results | Saved-job request shared vacancy search state. | Saved jobs load separately and errors are isolated. | Authenticated Candidate browser journey after application auth is approved. |
