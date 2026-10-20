# Workstation 07 — HR Operations ownership and Phase 05 audit

**Checked:** 2026-10-20 13:43 Asia/Dhaka
**Repository:** `shihab-tech04/HRIS-v2`
**Verified source branch head:** `development/hris-checkpoints` at `1714a08e24f47999618b0127fc818a3d19eb187a`
**Work branch:** `work/ws07-hr-org-phase05-20261020`
**Canonical ownership CSV:** [HRIS 1,047 Story Classification Register](https://github.com/shihab-tech04/HRIS-v2/blob/dcdd89ba140cd92ace71130b4eab439525e07594/docs/audit/HRIS_1047_Story_Classification_Register_2026-10-20.csv)
**Recovered source matrix checksum:** `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`

## Ownership boundary

Workstation 07 owns exactly role `HR`, modules `HR02` through `HR33`: **244 distinct story IDs across 32 modules**. The IDs below were generated from the recovered canonical matrix and independently compared against the pinned ownership CSV; both sources return the same 244 IDs.

`HR01-01` through `HR01-08` (Employee Master, all eight IDs) remain with Workstation 01 until a formal handoff. They are excluded from this inventory. No E*, M*, H*, A*, C*, SA*, CA* or X* stories are owned here. Shared Auth/RLS, common shell, Candidate, production migrations, production records, grants, tenant memberships, `main`, and deployment remain outside this workstation.

## Enumerated 244-ID scope

<!-- OWNERSHIP_IDS_START -->
| Module | Canonical module name | Count | Exact IDs |
| --- | --- | ---: | --- |
| HR02 | Employee Creation / Joining | 10 | HR02-01, HR02-02, HR02-03, HR02-04, HR02-05, HR02-06, HR02-07, HR02-08, HR02-09, HR02-10 |
| HR03 | Organization Structure | 9 | HR03-01, HR03-02, HR03-03, HR03-04, HR03-05, HR03-06, HR03-07, HR03-08, HR03-09 |
| HR04 | Employment Lifecycle | 11 | HR04-01, HR04-02, HR04-03, HR04-04, HR04-05, HR04-06, HR04-07, HR04-08, HR04-09, HR04-10, HR04-11 |
| HR05 | Attendance Configuration | 8 | HR05-01, HR05-02, HR05-03, HR05-04, HR05-05, HR05-06, HR05-07, HR05-08 |
| HR06 | Shift Management | 7 | HR06-01, HR06-02, HR06-03, HR06-04, HR06-05, HR06-06, HR06-07 |
| HR07 | Holiday Management | 5 | HR07-01, HR07-02, HR07-03, HR07-04, HR07-05 |
| HR08 | Leave Configuration | 10 | HR08-01, HR08-02, HR08-03, HR08-04, HR08-05, HR08-06, HR08-07, HR08-08, HR08-09, HR08-10 |
| HR09 | Leave Administration | 6 | HR09-01, HR09-02, HR09-03, HR09-04, HR09-05, HR09-06 |
| HR10 | Recruitment Requisition | 5 | HR10-01, HR10-02, HR10-03, HR10-04, HR10-05 |
| HR11 | Job Circular | 11 | HR11-01, HR11-02, HR11-03, HR11-04, HR11-05, HR11-06, HR11-07, HR11-08, HR11-09, HR11-10, HR11-11 |
| HR12 | Applicant Tracking | 9 | HR12-01, HR12-02, HR12-03, HR12-04, HR12-05, HR12-06, HR12-07, HR12-08, HR12-09 |
| HR13 | Screening | 6 | HR13-01, HR13-02, HR13-03, HR13-04, HR13-05, HR13-06 |
| HR14 | Interview Management | 9 | HR14-01, HR14-02, HR14-03, HR14-04, HR14-05, HR14-06, HR14-07, HR14-08, HR14-09 |
| HR15 | Candidate Assessment | 6 | HR15-01, HR15-02, HR15-03, HR15-04, HR15-05, HR15-06 |
| HR16 | Offer Management | 9 | HR16-01, HR16-02, HR16-03, HR16-04, HR16-05, HR16-06, HR16-07, HR16-08, HR16-09 |
| HR17 | Candidate-to-Employee Conversion | 6 | HR17-01, HR17-02, HR17-03, HR17-04, HR17-05, HR17-06 |
| HR18 | Onboarding | 7 | HR18-01, HR18-02, HR18-03, HR18-04, HR18-05, HR18-06, HR18-07 |
| HR19 | Probation Administration | 6 | HR19-01, HR19-02, HR19-03, HR19-04, HR19-05, HR19-06 |
| HR20 | Performance Cycle Configuration | 8 | HR20-01, HR20-02, HR20-03, HR20-04, HR20-05, HR20-06, HR20-07, HR20-08 |
| HR21 | Performance Calibration | 5 | HR21-01, HR21-02, HR21-03, HR21-04, HR21-05 |
| HR22 | Learning Administration | 9 | HR22-01, HR22-02, HR22-03, HR22-04, HR22-05, HR22-06, HR22-07, HR22-08, HR22-09 |
| HR23 | Payroll Configuration | 8 | HR23-01, HR23-02, HR23-03, HR23-04, HR23-05, HR23-06, HR23-07, HR23-08 |
| HR24 | Payroll Processing | 11 | HR24-01, HR24-02, HR24-03, HR24-04, HR24-05, HR24-06, HR24-07, HR24-08, HR24-09, HR24-10, HR24-11 |
| HR25 | Increment / Compensation Revision | 5 | HR25-01, HR25-02, HR25-03, HR25-04, HR25-05 |
| HR26 | Bonus / Incentive | 5 | HR26-01, HR26-02, HR26-03, HR26-04, HR26-05 |
| HR27 | Employee Relations / Grievance | 7 | HR27-01, HR27-02, HR27-03, HR27-04, HR27-05, HR27-06, HR27-07 |
| HR28 | Disciplinary Management | 7 | HR28-01, HR28-02, HR28-03, HR28-04, HR28-05, HR28-06, HR28-07 |
| HR29 | Promotion Administration | 6 | HR29-01, HR29-02, HR29-03, HR29-04, HR29-05, HR29-06 |
| HR30 | Transfer Administration | 6 | HR30-01, HR30-02, HR30-03, HR30-04, HR30-05, HR30-06 |
| HR31 | Separation | 8 | HR31-01, HR31-02, HR31-03, HR31-04, HR31-05, HR31-06, HR31-07, HR31-08 |
| HR32 | Final Settlement | 8 | HR32-01, HR32-02, HR32-03, HR32-04, HR32-05, HR32-06, HR32-07, HR32-08 |
| HR33 | HR Analytics | 11 | HR33-01, HR33-02, HR33-03, HR33-04, HR33-05, HR33-06, HR33-07, HR33-08, HR33-09, HR33-10, HR33-11 |
<!-- OWNERSHIP_IDS_END -->

## Phase 05 immediate allocation — HR03 (9 IDs)

The nine source requirements, in canonical order:

- **HR03-01** — As HR, I want to manage legal entities.
- **HR03-02** — As HR, I want to manage offices/branches.
- **HR03-03** — As HR, I want to manage departments.
- **HR03-04** — As HR, I want to manage units.
- **HR03-05** — As HR, I want to manage teams.
- **HR03-06** — As HR, I want to manage designations.
- **HR03-07** — As HR, I want to manage grades/bands.
- **HR03-08** — As HR, I want to maintain reporting relationships.
- **HR03-09** — As HR, I want effective dating so structural changes do not destroy history.

## Current source and contract audit

### Existing organization surfaces

- `src/views/admin/OrgStructureAndRoles.tsx` is a legacy UI backed by `HRISContext`. Its role and department create actions update in-memory state; they do not persist through Supabase. Preserve this historic screen and do not treat its save affordances as a live HR contract.
- `src/live/OrganizationTeams.tsx` is a live, read-only view. It loads `teams` and `departments` with the selected `tenant_id`; it has search, status filtering, refresh and CSV export, but no create/update/delete calls.
- `src/live/LiveSystemWorkspace.tsx` lists departments, teams and designations through tenant-filtered reads and labels its record view read-only. It is not mounted by the current `src/live/LiveApp.tsx` route tree.
- The authenticated app derives organization visibility from `organization.view` or `organization.manage` through `has_tenant_permission`; the live Teams route is gated on that permission. Existing tenant membership RLS is in the deployed migration history. This work does not alter that shared security contract.

### Current data/API boundaries

- The live employee-directory RPC projects department, designation title, team and employment status through same-tenant joins. It does not project a manager, reporting line, position, grade, effective dates or organization history.
- The repository’s `src/sql/contracts.ts` describes a **speculative, explicitly unapplied** target DDL that includes legal entities, department hierarchy and `primary_manager_id`. Those fields are not evidence of deployed schema and cannot be used as implementation approval.
- Current source does not establish what “unit” means or how units relate to departments; it does not establish position semantics; and it does not define effective dating or historical-change behavior. Read-only fixture fragments for `grades` and `org_locations` are not sufficient to infer their production fields or lifecycle.
- The existing read-only production inventory records no `public.legal_entities` relation or `legal_entity_name` tenant column and no legal-entity API. The minimum legal-entity model, cardinality, attributes, HR permissions, and employee/history relationship are unspecified. **HR03-01 is blocked.** See `docs/evidence/hr03-01-legal-entity-contract-gap-20261020.md`.

### Ordered disposition

The canonical 2026-10-20 classification CSV marks all nine HR03 rows blocked for missing story-level evidence; that classification does not prove a feature is absent. The independent branch readiness overlay also identifies the specific absent-contract blocker for HR03-01. Therefore this checkpoint stops at HR03-01: it records the exact model boundaries and adds a test-backed contract, but does not implement a speculative legal-entity model or skip forward to HR03-02..HR03-09. Those stories remain unclassified until the source-backed API/schema contract and their ordered dependencies are resolved.

### Production acceptance boundary from Workstation 02 evidence

Workstation 02’s [open draft PR #39](https://github.com/shihab-tech04/HRIS-v2/pull/39) reports production migration head `20261020044145`, one active production tenant, and one active tenant membership: the sole Shihab Super Admin using `hr_admin` with `organization.manage`. It reports no independent HR/Admin membership and no production cross-tenant acceptance opportunity. The signed-in browser observed two readable department rows for that membership. This supports a read path only; it does not certify an independent HR journey or any organization write workflow. No production records or schema were changed.

## Checkpoint test

`tests/contracts/ws07-hr03-readiness.test.mjs` checks the 244-ID inventory against the hashed recovered source matrix, the exact HR03 wording/order, the HR03-01 blocker, preservation of the legacy in-memory surface, current tenant-filtered read-only organization paths, and reporting/effective-date omissions. Passing this contract records audit boundaries; it does not certify HR03 story completion or hosted acceptance.

The latest authoritative development-head checkpoint (`1714a08e24f47999618b0127fc818a3d19eb187a`) has passing GitHub Actions runs: [disposable Auth/Postgres/browser acceptance](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39386413561), [Phase 2A Auth/RLS/browser acceptance](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39386413562), and [runner probe](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39386413577). The disposable run records **378/378 Auth/RLS assertions** and **26/26 Phase 04 parity checks**; its full job also completed browser acceptance. This is baseline evidence for the source head, not a run on this workstation’s branch.

On this workstation branch, the new contract passes **6/6**, the scope-safe Main contract subset passes **336/336**, TypeScript checking passes, and `npm run build` passes. The local full contract command cannot load seven Candidate-dependent contract files because the separate Candidate checkout is outside this workstation’s permitted scope; automatic review rejected an attempted read-only checkout for that reason. This branch did not inspect or modify Candidate files. Local disposable Auth/RLS execution is unavailable because Supabase CLI and Docker are not installed. A local Chromium download returned a zero-byte archive, so local browser execution is unavailable. The production bundle builds successfully, but its generated asset hashes do not match the checked-in Pages assets at the base checkpoint; those generated assets were restored and are deliberately excluded from this evidence-only PR.

## Next gate

Before implementation proceeds, Workstation 02 / the API owner must verify production catalog columns and callable contracts for the organization tables and answer the HR authorization/API questions. The product owner must approve the legal-entity contract before HR03-01 can advance. Keep production migration head and the sole Super Admin unchanged; do not alter HR01, shared Auth/RLS, or the current design system.
