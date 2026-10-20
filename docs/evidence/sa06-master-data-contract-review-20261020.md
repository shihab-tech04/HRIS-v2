# SA06 Master Data contract proposal — review only

**Status: REVIEW PROPOSAL — NOT APPROVED OR IMPLEMENTED.** This document is for WS01 shell/integration and WS02 API/security review. It records source-backed behavior and the minimum safeguards needed before implementation. It does not add controls, data fields, an endpoint, SQL, or a migration.

## Exact story evidence

Audited against `development/hris-checkpoints` at `1714a08e24f47999618b0127fc818a3d19eb187a` and canonical source register commit `dcdd89ba140cd92ace71130b4eab439525e07594`.

| Story | Canonical title | Exact requirement | What the source establishes |
| --- | --- | --- | --- |
| SA06-01 | Master Data | As super admin, I want to manage configured master-data values. | Super Admin management intent only. No catalog, field list, or operation is named. |
| SA06-02 | Master Data | As super admin, I want controlled values reused across modules. | Reuse intent only. No shared value sets, scope, or consuming modules are identified. |
| SA06-03 | Master Data | As super admin, I want inactive values retained for historical records. | An inactive state and historical retention are required at story level. The source does not specify history display/snapshot behavior or the exact values covered. |
| SA06-04 | Master Data | As super admin, I want duplicate/inconsistent values minimized. | Duplicate/inconsistency reduction is required at story level. No identity key, normalization, scope, or remediation operation is specified. |

The canonical register marks these rows `BLOCKED`, `NO_STORY_LEVEL_EVIDENCE_LOCATED`, and `TRACEABILITY_GAP_NOT_EVIDENCE_OF_ABSENCE`. In the source story matrix the UI, API, permission, validation, and state-transition fields are null for all four. The local Phase 05 overlay still reports `NOT_CLASSIFIED` and `hosted_accepted: false`; neither status is upgraded by this proposal.

## Figma and existing behavior reviewed

- The linked Figma file `XEXLe9J1oATlITS9I5u1P9` has one page (`0:1`). Its page metadata has no SA06 ID or Master Data/Super Admin editor frame label. The inspected `HR-mis-user` node (`3:39433`) is a personal dashboard. The `personal leave` node (`3:39880`) shows a leave request/history experience, including a `Leave Type` label in history; it is not a leave-type editor. These designs do not source Master Data fields or actions.
- The connected `LiveHrisWorkspace` has no Master Data route. `OrganizationTeams` is a tenant-filtered read/export surface, not an editor. The shared route remains WS01-owned.
- Production read-only inspection of Supabase project `hrmis-saas` (`oslgwxaqfbteqtwqvdzs`) found deployed migration head `20261020044145` (`phase03_learning_context_authenticated_acl_20261020`). The production tables `departments`, `designations`, `teams`, and `leave_types` each have `tenant_id` and `active`; none is a platform-global catalog.
- Existing production RPCs `admin_save_department`, `admin_save_designation`, `admin_save_team`, and `admin_save_leave_type` are tenant-scoped. They derive the active tenant with `synesis_tenant_id()` and check `organization.manage` or `leave.manage`; their writes are recorded in `admin_audit_logs`. They are not a platform-wide SA06 API. Their current payload fields are documented below only as existing schema/API evidence, not as approved SA06 controls.
- Production has the server-side `platform_hris_is_super_admin()` check. It requires a live session and an active `admin_users` row with `is_super_admin`, plus a confirmed, non-deleted, non-banned auth user. The existing `protect_super_admin` trigger protects the flagged account from deletion, reassignment, deactivation, or demotion. This establishes a server-side role check, not a Master Data write API. This branch makes no change to `admin_users` or Super Admin protections.
- The source branch contains `hris_save_leave_type` and `LeaveTypePolicyManager`, which are separately tenant-scoped to `leave.manage`, use a client-provided tenant identifier that the RPC verifies against active membership, and update only existing leave-type fields. That local migration (`20261016142000`) is not in the deployed migration history; the live database has `admin_save_leave_type`, not `hris_save_leave_type`. The local component/API contract is therefore not production deployment evidence and neither leave RPC is a global Master Data API.

### Existing fields and safeguards (not an SA06 field list)

| Existing tenant-owned record | Production fields and references relevant to this review | Existing duplicate/inactive evidence |
| --- | --- | --- |
| Department | `id`, `tenant_id`, `location_id`, `name`, `code`, `description`, `active`, timestamps | Unique `(tenant_id, code)`. Existing save RPC trims name/code, uppercases code, validates same-tenant location, and writes an audit entry. |
| Designation | `id`, `tenant_id`, `department_id`, `grade_id`, `title`, `code`, `active`, timestamps | Unique `(tenant_id, code)`. Existing save RPC trims title/code, uppercases code, validates same-tenant department/grade, and writes an audit entry. |
| Team | `id`, `tenant_id`, `department_id`, `name`, `code`, `active`, timestamps | Unique `(tenant_id, code)`. Existing save RPC trims name/code, uppercases code, validates same-tenant department, and writes an audit entry. |
| Leave type | `id`, `tenant_id`, `name`, `code`, `description`, `annual_entitlement`, `is_paid`, `allow_carry_forward`, `max_carry_forward_days`, `requires_document_proof`, `min_days_notice`, `applicable_gender`, `active`, timestamps | Unique `(tenant_id, code)`. Live `admin_save_leave_type` trims name, uppercases code, checks `leave.manage`, and audits. Leave requests and balances reference leave types with `ON DELETE RESTRICT`; current local UI preserves balance rows and lets users filter active/inactive/all. |

These existing tenant RPCs establish behavior only for their own tenant-owned entities. They do not establish a platform-global taxonomy, global uniqueness rules, a universal status model, or the SA06 entity set. Existing code checks and database constraints are not generalized by this document.

## Minimum contract proposed for WS01/WS02 review

### 1. Server-checked identity and tenant scope

1. Derive the actor from the authenticated session (`auth.uid()`); reject missing/invalid live sessions. Never accept a client-supplied actor ID or role as authority.
2. For any platform-global SA06 write, check `platform_hris_is_super_admin()` on the server for that request. Do not substitute `organization.manage` or `leave.manage`; those permissions authorize tenant APIs only.
3. Resolve whether each approved value set is global or tenant-owned before routing or writing. For an existing tenant-owned record, the write must remain scoped to the authorized tenant and validate all parent references in that same tenant. A supplied tenant ID alone grants no authority. If Super Admin cross-tenant targeting is intended, WS02 must explicitly authorize the target tenant and WS01 must expose the approved scope context.
4. Do not accept arbitrary table names or field names from the client. The server must bind the request to an allowlisted, approved value set and its approved field contract. Those allowlists remain unresolved until stories and design are approved.
5. Keep the authorization check, scope check, validation, mutation, and audit record atomic. Do not expose browser direct DML for the catalog. If an RPC needs definer privileges, WS02 must review its schema exposure, fixed `search_path`, explicit actor check, and execute grants before approval.

### 2. Inactive values and historical references

- Implement the SA06-03 intent through an inactive state while retaining the same value identity and its historical references; do not hard-delete, cascade-delete, or silently repoint records as part of deactivation.
- The production `active` flag and restrictive leave-type foreign keys show one existing tenant-scoped pattern, not a global rule for every catalog. For each approved set, WS02 must verify all consuming FKs and WS01 must confirm how inactive values appear in history. Whether historical labels are current or snapshotted remains open.
- Whether inactive values disappear from new-choice controls must be confirmed for each consuming module before integration. The leave editor's confirmation text applies only to leave types.

### 3. Duplicate prevention

- Enforce uniqueness in the server/database write transaction using the exact identity key and scope approved for that value set. Client-side search or preflight is not sufficient to prevent races. Duplicate rejection must leave the transaction without a partial write.
- Existing tenant entities use `(tenant_id, code)` and their current RPCs uppercase trimmed codes. This is evidence for those tenant records only. SA06 has no approved platform-global key, case/Unicode normalization rule, duplicate-name rule, or merge behavior. WS02 and the data owner must settle these before any global mutation API is approved.
- Do not silently merge, rename, or reassign existing values to remediate inconsistencies; the story does not authorize those changes.

### 4. Integration contract and ownership

| Owner | Review/approval input needed before functional SA06 work |
| --- | --- |
| WS01 | Approve the connected route and navigation slot, Figma node(s), and whether a platform-wide screen or tenant context is shown. No shared shell change is in this PR. |
| WS02 | Approve the server endpoint/RPC, authoritative global role check, target-tenant rules, catalog allowlist, validation, duplicate key, inactive/history semantics, transaction/audit behavior, and isolated negative tests. No production migration/API change is in this PR. |
| WS08 | After those approvals, implement only the approved fields/actions and add exact story-ID evidence. Until then, no SA06 form, controls, or write calls are added. |

Transport path, method/RPC name, request/response field names, operation set, and error vocabulary remain undecided. This proposal intentionally does not invent them. The API boundary should return the persisted canonical value representation for the approved set and expose enough information for the UI to render its approved active/history state; exact response fields require approval.

### 5. Isolated acceptance evidence required

Before any SA06 story is accepted, verify in a disposable database/project:

- authenticated active Super Admin can perform only the approved scope;
- unauthenticated, non-Super-Admin, inactive/deleted/banned actor, wrong-tenant, and cross-tenant-reference attempts fail server-side;
- a concurrent duplicate attempt yields one accepted identity and no partial second write under the approved normalization/key;
- deactivation retains the same identity and historical references, while consumer-specific new-choice behavior matches the approved story/design;
- rejected writes leave data unchanged and successful writes produce the approved audit record in the same transaction;
- the connected route and exact Figma fields/actions map to `SA06-01` through `SA06-04` without modifying other workstation modules.

No production writes, migrations, route changes, or user data reads were performed for this review. The production inspection used migration, schema, routine-definition, constraint, grant, and policy metadata only. Off-GitHub backups were not accessed or changed. The four SA06 stories remain blocked/unclassified pending review; this is not certification evidence.
