# WS05 E02-09 Main HRIS feature-integration review — 24 October 2026

## Current review scope

This is a **source-only review branch** targeting existing WS05 Main final integration, based on `da5fe3bc3b08f89e6945939ecef4b75284dcf348`. It does not write to hosted Supabase, merge `main`, enable private Candidate journeys, or deploy production.

Canonical E02-09: Employee sees designation, department, manager, location, grade and employment type. The previously present E02-08 narrower self-identity API stays unchanged. The new `employee_get_my_employment_info_v1(uuid)` returns the approved own-employment allowlist only; no payroll or bank information.

## Source lineage and acceptance

- WS02 own-RPC source and disposable PostgreSQL 17 two-tenant/anonymous/inactive denial tests: [owner review PR #75](https://github.com/shihab-tech04/HRIS-v2/pull/75), [exact-head CI PASS 40054489981](https://github.com/shihab-tech04/HRIS-v2/actions/runs/40054489981).
- WS06 Employee Profile read-only EN/BN implementation: [owner review PR #76](https://github.com/shihab-tech04/HRIS-v2/pull/76), [scoped frontend CI PASS 40054824514](https://github.com/shihab-tech04/HRIS-v2/actions/runs/40054824514). Preserves dashboard identity projection, existing responsive shell, disabled unapproved writes and default Figma sparse-state geometry. The populated Grade row requires owner visual approval.
- Main WS05 proposal [PR #77](https://github.com/shihab-tech04/HRIS-v2/pull/77) combines those exact owner implementation files and adds the separately versioned migration for full UI/API/SQL source parity. The Phase01 tracked RPC inventory changes **119 → 120**. The original Main release head is not overwritten.
- WS05 isolated asset sync [GitHub Action run 40055187939](https://github.com/shihab-tech04/HRIS-v2/actions/runs/40055187939) PASS, generated only tracked `index.html` and one hashed JavaScript asset change on this proposal branch; the associated CSS asset was unchanged. This is **not a Pages deployment**.

## Deployment and data boundaries

No verified live employee membership or authenticated A/B tenant acceptance exists on the hosted replacement DB. Protected release approval and standalone security-team authorization remain distinct. Preserve existing authentication, RLS, storage restrictions and WS05 release ownership. Do not mark the E02-09 full story certified until WS02, WS06 and WS04 review this exact integration. Do not merge obsolete PR #35 or replace newer Poppins/Material/Figma shell.

## Next integration checks

On the **new exact PR #77 head**, verify full `npm run check`, Candidate immutable pinned cross-repository contracts, PostgreSQL 17 employment-info fixture, responsive/EN-BN browser acceptance, and branch-served Pages asset parity. A PASS on this branch certifies source/testing only, not hosted user-data access or a production deployment.
