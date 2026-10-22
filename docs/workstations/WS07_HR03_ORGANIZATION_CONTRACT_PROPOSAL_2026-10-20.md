# WS07 HR03 organization contract proposal

**Status:** PROPOSAL FOR WS02 API/security and WS01 integration review. Not approved; no implementation authorization.
**Reviewed:** 2026-10-20 (Asia/Dhaka)
**Workstation scope:** HR02–HR33 (244 canonical IDs). HR01-01..HR01-08 remain with WS01.
**PR:** [#43](https://github.com/shihab-tech04/HRIS-v2/pull/43)
**Verified development base:** `development/hris-checkpoints` at `1714a08e24f47999618b0127fc818a3d19eb187a`
**Pinned classification register:** [HRIS 1,047 Story Classification Register](https://github.com/shihab-tech04/HRIS-v2/blob/dcdd89ba140cd92ace71130b4eab439525e07594/docs/audit/HRIS_1047_Story_Classification_Register_2026-10-20.csv)
**Approved design reference searched:** [HRIS Figma](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)

## Decision requested

WS02 should verify the deployed catalog/API/authorization contract and identify the least-privilege implementation boundary. WS01 should review the employee-linkage boundary and confirm how any later approved HR03 contract can integrate without changing its HR01 ownership. Product ownership must decide the unresolved legal-entity rules below before schema/API approval.

Until those decisions are recorded, HR03-01 remains blocked and HR03-02..HR03-09 stay in canonical order behind it. This document proposes a review boundary; it does not claim approval, implementation, certification, or hosted acceptance.

## Evidence checked

### Canonical requirements and classification

The nine source requirements, in canonical order:

| Story | Exact acceptance text |
| --- | --- |
| HR03-01 | As HR, I want to manage legal entities. |
| HR03-02 | As HR, I want to manage offices/branches. |
| HR03-03 | As HR, I want to manage departments. |
| HR03-04 | As HR, I want to manage units. |
| HR03-05 | As HR, I want to manage teams. |
| HR03-06 | As HR, I want to manage designations. |
| HR03-07 | As HR, I want to manage grades/bands. |
| HR03-08 | As HR, I want to maintain reporting relationships. |
| HR03-09 | As HR, I want effective dating so structural changes do not destroy history. |

The pinned register rows are lines 896–904. All nine are marked `BLOCKED` / `NO_STORY_LEVEL_EVIDENCE_LOCATED`; the register says that this classification does not prove feature absence. It also records no canonical story-ID correspondence in the reviewed Figma metadata.

### Approved Figma

The file has a single page, Page 1. A read-only search covered 22,522 text layers and found 37 unique organization-related labels, but no legal-entity master, entity cardinality, structural history/effective-date definition, grades/bands model, or canonical HR03 story-ID mapping.

- “Organization Name” appears in the `profile experience` and `profile work experience` frames (for example node `66:51545` and `66:51010`). It is employee work-history content, not evidence for a legal-entity master.
- “Reporting/Mentor” appears under `HR-mis-user → Requisition → Employee Recquistion Form` (node `86:35997`). It does not define an employee manager relationship, hierarchy, or effective-dated reporting contract.
- Department, designation, team, and position labels occur in general HR screens and requisition forms. They do not settle the relationships or lifecycle rules in HR03-02..HR03-09.

### Existing application and migration history

- `src/views/admin/OrgStructureAndRoles.tsx` uses `HRISContext`. Department creation updates local in-memory state; it is not a persisted organization API. This historic surface stays unchanged.
- `src/live/OrganizationTeams.tsx` reads tenant-filtered teams and departments. It has no create/update/delete/upsert/RPC calls.
- `supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql` defines the active-session, active-tenant-membership permission check and the department `SELECT` policy. `supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql` adds membership-backed `SELECT` guards for designations, grades, locations, and teams. The current permission IDs used for organization reads are `organization.view` and `organization.manage`; this proves a read-visibility pattern, not approved legal-entity write access.
- `supabase/migrations/20261017092147_employee_directory_team_filter.sql` joins existing department, designation, and team references within the same tenant. The deployed/source contract has no legal-entity link, reporting-manager field, position relation, or effective-dated organization history in that projection.
- No versioned migration creates a `legal_entities` relation or a legal-entity RPC. `src/sql/contracts.ts` contains a speculative target DDL marked **UNAPPLIED TO PRODUCTION**, including a proposed `legal_entities` table and `primary_manager_id`. Neither is approval or deployed evidence and neither is adopted here.
- WS02’s current [draft PR #39](https://github.com/shihab-tech04/HRIS-v2/pull/39) reports production migration head `20261020044145`, no deployed legal-entity relation/API, one active tenant, and only the sole Super Admin’s active `hr_admin` tenant membership with `organization.manage`. It reports no independent HR membership and no production cross-tenant acceptance opportunity. This remains read-only WS02 evidence.

## Minimal contract proposal for owner decision

### Resource and schema boundary

**Proposed logical boundary:** if product approves HR03-01, treat legal entity as a resource owned by one tenant. Do not equate it to the tenant row, an office/location, department, or company name in an employee work-history form.

The current acceptance text does not authorize physical table/column names or any of the following: one-vs-many entity cardinality; a code or registration number; country; active/deactivated state; parent entity; entity-to-location/department relationship; employee assignment; or historical/effective-date fields. No DDL, column list, migration, or employee foreign key is proposed in this checkpoint. Product must approve the minimum identity/display attributes and uniqueness/lifecycle rules; WS02 must then choose physical names and constraints against the deployed catalog.

### API boundary

**Proposed behavior, names/signatures pending WS02 approval:**

1. Provide a tenant-authorized list/read operation for the active tenant’s legal entities.
2. Provide create and update operations only if “manage” is confirmed to include both actions.
3. Do not expose delete, archive, merge, or effective-date operations until product chooses the lifecycle and history rules.
4. Keep the client on a typed, narrow API contract; do not grant broad direct table writes to authenticated clients. Each operation must derive or validate the tenant from the authenticated tenant membership and reject foreign-tenant identifiers.

Possible RPC names such as `hris_list_tenant_legal_entities`, `hris_create_tenant_legal_entity`, and `hris_update_tenant_legal_entity` are illustrative only. They are not registered APIs and their signatures/payloads are intentionally unspecified until the approved attributes are known.

### Authorization boundary

**Proposal for WS02 review:** test reuse of the existing tenant permissions: `organization.view` for read and `organization.manage` for create/update, provided the deployed role-permission mapping and security owner explicitly approve those semantics for legal entities. If that mapping is not acceptable, WS02 must propose an explicit least-privilege permission contract; WS07 will not create a new permission ID or infer HR role grants.

All access must require a live authenticated session, active tenant, active membership, active role, and the approved tenant permission. A global `user_roles`/legacy `has_permission` result or a Super Admin flag must not become a fallback. Existing RLS guards on other organization tables are not automatically legal-entity policies.

## Disposable tenant-isolation acceptance plan

Run only after schema/API/permission approval, in a free disposable Supabase/Auth environment with two synthetic tenants and synthetic users. Use no production tenant, user, or data. These are proposed acceptance cases, not tests already run.

| Case | Setup and action | Required result |
| --- | --- | --- |
| TEN-01 | Unauthenticated caller lists or mutates legal entities. | Denied; no rows or writes exposed. |
| TEN-02 | Authenticated caller has only a global legacy role and no active tenant membership. | Denied for both tenants. |
| TEN-03 | A user who is an active member of Tenant A only, with approved view permission, lists entities while Tenant B has distinguishable fixtures. | Only Tenant A’s authorized records are returned. |
| TEN-04 | Tenant A view-only user attempts create/update. | Denied; persisted state is unchanged. |
| TEN-05 | Tenant A manage user creates/updates an entity for Tenant A using the approved payload. | Allowed only if `organization.manage` is approved for these operations; resulting row remains in A. |
| TEN-06 | A caller who is an active member of Tenant A only substitutes Tenant B’s tenant identifier in a request. | Denied; no Tenant B data is returned or changed. |
| TEN-07 | A caller who is an active member of Tenant A only reads/updates/deactivates an identifier belonging to Tenant B. | Denied or indistinguishably not found; Tenant B state is unchanged. |
| TEN-08 | Tenant A entity payload references a Tenant B employee/location/department, if those relationships are later approved. | Rejected by same-tenant validation/FK; no cross-tenant link is created. |
| TEN-09 | Caller has an inactive membership, inactive role, or inactive tenant. | Denied even if a role permission row exists. |
| TEN-10 | Direct authenticated table access is attempted, if the approved design uses RPC-only writes. | Read/write exposure matches the approved RLS and grants; no path bypasses the RPC authorization checks. |

After product resolves cardinality and lifecycle, add explicit same-name uniqueness, deactivation/delete, concurrent update, history preservation, effective-date boundary, and employee-assignment tests. Their expected outcomes cannot be fixed from the current story text.

## Product decisions still open

1. Can one tenant own one or multiple legal entities? Is a tenant itself allowed to represent a legal entity?
2. What are the minimum required identity/display attributes, uniqueness scope, and any code format?
3. Does “manage” mean create/list/read/update/deactivate/delete? Which action preserves referenced history?
4. Must every employee belong to an entity, may they belong to several, or is the relation outside HR03-01? How does an entity relate to offices/branches, departments, units, positions, and payroll?
5. Does HR03-09 apply to legal-entity master changes, employee assignments, organization structure, or all of these? What date type, time zone, backdating/future dating, overlap rule, and correction/audit behavior are intended?
6. For HR03-04, what is a “unit” and where does it sit in the hierarchy? For HR03-06/07, are designations, positions, grades, and bands separate concepts? For HR03-08, are reporting relationships single-manager or matrix, and who can see them?
7. Should `organization.view`/`organization.manage` authorize the new resource, and which tenant roles receive those permissions?

## Stop and handoff criteria

HR03-01 stays blocked until product records the legal-entity decisions and WS02 approves an exact schema/API/permission contract against the deployed catalog. WS01 must confirm employee/master integration impact before any employee linkage is added. Only after those approvals may WS07 implement the first exact unblocked HR03 story on this branch with disposable positive and negative tenant tests. This proposal does not authorize a production migration, grant change, record change, shared Auth/RLS edit, merge, or deployment.
