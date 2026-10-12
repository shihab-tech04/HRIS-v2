# Synesis HRIS 360° — Master Phase Ledger

**Checkpoint:** 2026-10-12 16:44 Asia/Dhaka. **Overall state:** INCOMPLETE; no release phase accepted.

This ledger records evidence available in the current Main and Candidate source checkouts against the user-supplied master implementation directive. “Not verified” means this checkpoint does not establish acceptance; it does not claim the feature is absent. The original canonical story rows were not recovered. Do not invent acceptance criteria or mark a phase complete from a local build alone.

| Phase | Scope | State | Evidence at this checkpoint |
|---|---|---|---|
| 00 | Source acquisition and programme reconciliation | PARTIAL | Main/Candidate remote `main` heads match the local bases. Prior checkpoints and the attendance archive were reviewed. The original story ledger and accepted historical work remain unreconciled. |
| 01 | Architecture and integration blueprint | PARTIAL | Authenticated route and existing RPC contracts inspected. A route-level workspace correction is present; full architecture/story mapping is not accepted. |
| 02 | Figma design system and UX foundation | PARTIAL | Managerial Dashboard and Personal Leave references inspected; the employee dashboard reference (`3:39433`) has now been implemented in the authenticated workspace using live tenant-scoped data. Desktop and mobile captures are saved under `docs/evidence/`. Candidate/Super Admin reference recovery and formal side-by-side React-to-Figma acceptance remain outstanding. |
| 03 | SaaS platform and tenant lifecycle | PARTIAL | Synthetic two-tenant membership and isolation journeys passed locally. Tenant provisioning, lifecycle operations and cross-tenant browser acceptance remain open. |
| 04 | Authentication, roles, permissions and security | PARTIAL | 44/44 isolated local Auth/RLS checks passed with synthetic identities across two tenants. Active membership role IDs scope permissions; global roles alone grant no tenant access; effective function ACLs, employee self-service, storage, denied actions, anonymous calls, revocation, approval, audit paths, and tenant-scoped dashboard aggregates were exercised. Full application role and story acceptance remains open. Production review also found other exposed tables/functions and leaked-password settings requiring review; see `SUPABASE_SECURITY_ADVISOR_20261012.md`. |
| 05 | Organization, people and employee master data | PARTIAL | Ordinary linked employees now have a tenant-checked own dashboard RPC returning linked profile fields and tenant-local date, plus their own attendance, balances and leave history. General employee CRUD and the complete people lifecycle remain unaccepted. |
| 06 | Recruitment administration and Candidate integration | NOT VERIFIED | Candidate public search fixes were made; the recruitment lifecycle and Main/Candidate integration were not accepted. |
| 07 | Onboarding and employee conversion | NOT VERIFIED | No complete candidate-to-employee journey was run. |
| 08 | Attendance, shift, roster and time management | PARTIAL | Tenant-scoped reads and approval controls are wired. The exact staged approval SQL passed local Auth/RLS tests for tenant denial, same-tenant approval, audit, concurrency, check-in-only, check-out-only, work-mode-only, and missing-row creation. The full 36/36 Chromium suite passed, including manager attendance navigation; roster/time journeys remain open. |
| 09 | Leave, holiday and absence management | PARTIAL | Employees can submit tenant-scoped requests with required private evidence, and managers can resolve requests. Local tests covered proof requirements, duplicate overlap, pending/used ledgers, holidays, year boundaries, half-days, rollback, tenant denial and audit. The 36/36 Chromium suite includes the 375×812 employee leave journey; the full leave module remains open. |
| 10 | Projects, teams and resource allocation | NOT VERIFIED | No end-to-end acceptance evidence in this checkpoint. |
| 11 | Performance management | NOT VERIFIED | No end-to-end acceptance evidence in this checkpoint. |
| 12 | Learning, development and career management | NOT VERIFIED | No end-to-end acceptance evidence in this checkpoint. |
| 13 | Compensation, payroll and benefits | NOT VERIFIED | No calculations or confidentiality acceptance in this checkpoint. |
| 14 | Expense, travel and claims | NOT VERIFIED | No end-to-end acceptance evidence in this checkpoint. |
| 15 | Employee lifecycle and HR service operations | NOT VERIFIED | No end-to-end acceptance evidence in this checkpoint. |
| 16 | Communication, notifications and task engine | NOT VERIFIED | No delivery or retry acceptance in this checkpoint. |
| 17 | Dashboards, analytics and reporting | PARTIAL | The tenant-scoped Managerial Dashboard retains eight real attendance/team metrics, 7/30-day chart, search, CSV and pending-work links. The authenticated Employee Dashboard now displays linked identity, tenant-local date, attendance, recent work hours/location, leave balances, request entry/history and upcoming holidays from the self-service RPC. Chromium tests cover both dashboards and their controls. Additional analytics and full role/story acceptance remain open. |
| 18 | Mobile, EN/BN, accessibility and UX refinement | PARTIAL | At 375px the Employee Dashboard exposes all four views in a two-by-two tab layout without tab or page horizontal scrolling; its desktop/mobile captures are saved. The full Chromium suite passed, including responsive, Bengali expansion, keyboard, recovery, employee leave, and manager dashboard journeys. Complete app-wide accessibility and visual acceptance remain open. |
| 19 | Data migrations, security and cross-system certification | PARTIAL | The local release-candidate migration and staged approval SQL passed 43/43 isolated Auth/RLS checks. No production SQL or settings changed. Remaining schema/function review, Candidate public-column validation, full migration drift reconciliation and release certification are open. |
| 20 | Canonical story coverage and gap-closure loops | BLOCKED | The owner identified the recovered catalogue and its expected SHA-256 as `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. It is not present in this task's mounted `sources/` folder (which is empty), the connected Drive filename/hash searches found no catalogue file, and the in-repo tracking skeleton has 0 stories and SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. No IDs or acceptance criteria have been inferred; 0/1,047 are mapped/accepted. |
| 21 | Final release candidate and one-time publication | BLOCKED | No final backup certification, GitHub publication, deployment or production acceptance occurred. |

## Next sequence

1. Resolve Project-source mount/access for the exact canonical catalogue SHA, then map current test evidence to its recovered IDs; do not synthesize IDs or criteria.
2. Continue using the free local scratch stack; the selected-organization branch cost lookup is unavailable from the connected Supabase service, and no paid branch is authorized.
3. Continue Figma-aligned role pages and workflows using existing Main/Candidate contracts while resolving source access; do not invent story IDs or claim catalogue coverage.
4. Reconcile the remaining production policies, functions, migration history and Candidate public surface.
5. Verify Drive folder ownership/write access and round-trip integrity for a final versioned source archive before any GitHub publication.
6. Publish and deploy only after every required gate passes.
