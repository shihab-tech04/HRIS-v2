# Regression Ledger

**Checkpoint:** 2026-10-12.

| Area | Regression protection executed | Result | Limit |
|---|---|---|---|
| Main authenticated workspace | `npm run check`, including 21 contract tests and production build | PASS | Source/build-level only; no authenticated browser or role journey. |
| Approval SQL source contracts | Main contract suite checks staged location, tenant predicates, locking/audit/grant/search-path preservation and partial-field behavior | PASS | Does not execute PostgreSQL, Auth, RLS or concurrency scenarios. |
| Candidate public vacancy search | Candidate lint, four contract tests and public-only build | PASS | No live Supabase integration or real browser workflow. |
| Responsive/Figma parity | Earlier layout screenshots exist in source; no current full-page comparison was run here. | NOT ACCEPTED | No authenticated screenshots at required widths; no Candidate/Super Admin Figma recovery. |
| Auth, recovery, roles and tenant isolation | Not executed in this checkpoint. | NOT TESTED | Requires isolated environment and synthetic accounts. |

Do not upgrade source-level contract results to end-to-end acceptance. Add new rows only with the exact command/journey, outcome and evidence path.
