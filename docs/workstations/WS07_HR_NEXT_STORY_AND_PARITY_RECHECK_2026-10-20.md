# WS07 HR next-story and parity recheck

**Checked:** 2026-10-20  
**PR:** [#43](https://github.com/shihab-tech04/HRIS-v2/pull/43) — draft at head `779c8130e09281e60af94713de250edeca3703ea`, based on `1714a08e24f47999618b0127fc818a3d19eb187a`  
**Ownership:** WS07, HR02–HR33; HR01 and shared shell remain outside this workstation.

## Canonical next story

The master phase ledger still places **HR03-01** first in the next Phase 05 sequence. Its exact source requirement is “As HR, I want to manage legal entities.” The latest WS02 handoff on PR #43 confirms that production remains at migration head `20261020044145`, with no `public.legal_entities` relation or legal-entity API. The available `admin_get_organization_masters()` operation is a tenant-scoped, read-only organization reader; it does not provide legal entities or establish legal-entity write authorization.

Product decisions remain open for cardinality, required attributes, lifecycle/archive behavior, employee linkage, and effective-date/history semantics. HR03-01 therefore remains `BLOCKED_ON_UNAPPROVED_OR_ABSENT_CONTRACT`. Its existing proposal stays logical, DDL-free, and subject to WS02/WS01 review. No physical field, API signature, permission grant, lifecycle rule, or employee link is inferred here.

HR02 is assigned to Phase 07. The canonical readiness overlay currently classifies all 10 HR02 stories, including HR02-01 manual creation and HR02-02 accepted-candidate conversion, as `NOT_CLASSIFIED`; none is the next Phase 05 item. No story is advanced out of order or declared implemented from code presence alone. The next implementation gate remains product resolution plus WS02 contract/security approval and WS01 employee-integration review for HR03-01.

## Figma mapping check

The approved Figma file `XEXLe9J1oATlITS9I5u1P9`, page `0:1`, was searched in the current metadata. The pinned register has no approved story-level frame mapping for the exact HR02/HR03 requirements. The reviewed metadata did not establish a screen that can be confidently assigned to HR03-01, HR02-01, or HR02-02. This records a mapping gap; it does not prove the features are absent.

Two nearby nodes were reviewed and rejected as mappings:

- `86:36133` — “Department Lists,” a 487 × 227 px department dropdown within the Requisition area; it is not an organization-management screen.
- `86:38609` — “Candidate,” an 18 × 18 px icon/component; it is not a candidate conversion screen.

No desktop or mobile target frame was identified for HR03-01, HR02-01, or HR02-02. No visual match or mismatch can be claimed without an approved target frame.

## Runtime route evidence

For context only, the authenticated Teams route was viewed read-only at desktop `1300 × 953` and mobile `390 × 844`. The implementation is a tenant-protected, **read-only** Teams directory; this does not satisfy the “manage teams” write requirement and is not a screen for the canonical next story. The captures contain only the route header and omit account and record details.

| View | Evidence | Observation | Parity disposition |
| --- | --- | --- | --- |
| Desktop | `evidence/WS07_HR03_Teams_route_header_desktop_2026-10-20.jpg` | “Authenticated system workspace / Teams / Department teams.” | Route-only capture; no approved target frame, so parity is not assessable. |
| Mobile | `evidence/WS07_HR03_Teams_route_header_mobile_2026-10-20.jpg` | Same route identity at the 390 px viewport. | Route-only capture; no approved target frame, so parity is not assessable. |

The screenshots do not include employee or team records. The long navigation visible on mobile is recorded as context only; without an approved screen frame it is not classified as a parity defect. No shell change is in scope.

## Coordination and validation

- **WS02:** the latest hosted contract/security status is recorded in [the PR #43 handoff comment](https://github.com/shihab-tech04/HRIS-v2/pull/43#issuecomment-6290155963). The legal-entity contract and authorization remain unresolved; no production writes were made.
- **WS01:** requested review of the employee-linkage boundary before any future HR03 contract or employee integration is finalized. HR01 ownership stays unchanged.
- **WS04:** requested independent review of the story-to-frame disposition and the route-only desktop/mobile evidence. A mapping may be recorded only when WS04 identifies an approved canonical screen/frame.
- Focused local checks: `node --test tests/contracts/live-workspace.test.mjs tests/contracts/ws07-hr03-readiness.test.mjs` — **21/21 passed**. These are readiness and route-contract checks, not Figma visual-comparison tests.

No application source, HR01 file, shared shell, production schema, production records, Auth grants, tenant memberships, merge state, or deployment was changed.
