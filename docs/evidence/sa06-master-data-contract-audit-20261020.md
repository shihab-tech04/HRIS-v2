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
- `src/live/LeaveTypePolicyManager.tsx` is a branch-local tenant leave-policy editor. It calls `hris_save_leave_type` with the selected tenant; the branch migration requires an active tenant membership with `leave.manage`, uses existing `leave_types` fields, audits changes, and rejects duplicate codes and stale edits. That migration is not in the current production migration history. Production instead has the older tenant-scoped `admin_save_leave_type` RPC. Neither leave contract authorizes a Super Admin platform-wide catalog or edits to other tables.
- Production also has tenant-scoped `admin_save_department`, `admin_save_designation`, and `admin_save_team` RPCs guarded by `organization.manage`. The connected `OrganizationTeams` page does not call these writers; it remains read/export only. These tenant RPCs do not establish a global SA06 API or data model.
- The supplied register marks SA06 Figma correspondence `NOT_VERIFIED` and says no canonical story-ID reference was found in the reviewed Figma metadata. In the Figma file's only page (`0:1`), the page metadata contains no SA06 story-ID or Master Data/Super Admin frame label. Inspected `HR-mis-user` (`3:39433`) and `personal leave` (`3:39880`) screens are employee dashboard and leave-history flows; they do not define a master-data editor or its fields.

## Safe implementation decision

No SA06 UI or write path was added. A new screen would need a route in the shared workspace shell, which this workstation is expressly not authorized to change. A stand-alone component would not be reachable from the product. Wiring writes to existing read policies or broadening the leave-policy RPC would bypass the approved contracts and risk changing values used by other modules.

The following contract inputs are needed before a functional SA06 implementation can be accepted:

1. The authoritative catalog scope: whether values are platform-wide or tenant-owned, and which existing value sets belong in SA06.
2. The exact existing fields and cross-module references that may be managed for each included set.
3. The authorized Super Admin identity/scope and server-checked write API, including audit and concurrency behavior.
4. The approved inactive-value behavior where historical records reference a value.
5. The definition and safe handling of duplicate/inconsistent values, including whether the workflow only warns or may change existing records.
6. The approved SA06 screen/frame correspondence and the shared-shell integration point.

The audit adds `tests/contracts/sa06-master-data-readiness.test.mjs` to guard these current boundaries. A new review-only proposal records the minimum server authorization, tenant scope, retention, duplicate, and integration invariants without defining unapproved fields or endpoint signatures. It does not certify the four stories. Production SQL and the readiness overlay remain untouched.
