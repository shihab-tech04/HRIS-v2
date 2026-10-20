# SA06 Master Data contract audit — 2026-10-20

## Checkpoint and scope

- Repository: `shihab-tech04/HRIS-v2`
- Audited source: `development/hris-checkpoints` at `1714a08e24f47999618b0127fc818a3d19eb187a`
- Canonical register: `docs/audit/HRIS_1047_Story_Classification_Register_2026-10-20.csv` at `dcdd89ba140cd92ace71130b4eab439525e07594`
- Owned allocation: `SA06-01` through `SA06-04` only.
- No application shell, production SQL, migration, authorization policy, or other workstation module was changed.

## Canonical requirements

| Story | Canonical requirement |
| --- | --- |
| SA06-01 | As super admin, I want to manage configured master-data values. |
| SA06-02 | As super admin, I want controlled values reused across modules. |
| SA06-03 | As super admin, I want inactive values retained for historical records. |
| SA06-04 | As super admin, I want duplicate/inconsistent values minimized. |

The supplied classification register marks each row `BLOCKED` with `NO_STORY_LEVEL_EVIDENCE_LOCATED` and `TRACEABILITY_GAP_NOT_EVIDENCE_OF_ABSENCE`. The source user-story matrix has no approved field list, entity taxonomy, UI/API contract, permission model, validation rules, or state transitions for these stories. Its corresponding contract fields are null. This audit therefore treats the register as a certification blocker, not proof that data or behavior does not exist.

The branch-local Phase 05 readiness overlay has no SA06 evidence entry. `node scripts/phase-readiness.mjs 05 --json` consequently reports all four SA06 stories as `NOT_CLASSIFIED` and `hosted_accepted: false`. The source-register status and local evidence status remain distinct; this change does not promote or overwrite either classification.

## Existing implementation inspected

- `src/live/LiveHrisWorkspace.tsx` owns the connected application navigation and currently has no Master Data route. `tests/contracts/live-workspace.test.mjs` explicitly keeps the older generic `LiveSystemWorkspace` out of the connected application. That older file is not a usable route or authorization boundary.
- The connected `OrganizationTeams` page reads the current tenant's teams and departments, filters/exports them, and does not write them. It does not establish a general master-data editor.
- `src/live/LeaveTypePolicyManager.tsx` is a related, working leave-policy editor. It only calls `hris_save_leave_type` for the current tenant. The migration `supabase/migrations/20261016142000_hris_leave_type_policy_management.sql` requires `leave.manage`, uses existing `leave_types` fields, audits changes, rejects duplicate codes and stale edits, and revokes direct table DML. This contract is specific to leave policies and cannot authorize a Super Admin master-data catalog or edits to other tables.
- No corresponding connected writer/API contract was found for departments, designations, or teams. Existing tenant read policies and fields do not authorize browser-side writes.
- The supplied register marks SA06 Figma correspondence `NOT_VERIFIED` and says no canonical story-ID reference was found in the reviewed Figma metadata. Frame-level Figma designs were not fetched in this workstation audit, so no visual assumptions were made.

## Safe implementation decision

No SA06 UI or write path was added. A new screen would need a route in the shared workspace shell, which this workstation is expressly not authorized to change. A stand-alone component would not be reachable from the product. Wiring writes to existing read policies or broadening the leave-policy RPC would bypass the approved contracts and risk changing values used by other modules.

The following contract inputs are needed before a functional SA06 implementation can be accepted:

1. The authoritative catalog scope: whether values are platform-wide or tenant-owned, and which existing value sets belong in SA06.
2. The exact existing fields and cross-module references that may be managed for each included set.
3. The authorized Super Admin identity/scope and server-checked write API, including audit and concurrency behavior.
4. The approved inactive-value behavior where historical records reference a value.
5. The definition and safe handling of duplicate/inconsistent values, including whether the workflow only warns or may change existing records.
6. The approved SA06 screen/frame correspondence and the shared-shell integration point.

The audit adds `tests/contracts/sa06-master-data-readiness.test.mjs` to guard these current boundaries. It does not certify the four stories. Production SQL and the readiness overlay remain untouched.
