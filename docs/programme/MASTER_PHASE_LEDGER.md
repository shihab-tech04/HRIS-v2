# Synesis HRIS 360° — Master Phase Ledger

**Checkpoint:** 2026-10-12 16:23 Asia/Dhaka. **Overall state:** INCOMPLETE; no release phase accepted.

This ledger records evidence available in the current Main and Candidate source checkouts against the user-supplied master implementation directive. “Not verified” means this checkpoint does not establish acceptance; it does not claim the feature is absent. The original canonical story rows were not recovered. Do not invent acceptance criteria or mark a phase complete from a local build alone.

| Phase | Scope | State | Evidence at this checkpoint |
|---|---|---|---|
| 00 | Source acquisition and programme reconciliation | PARTIAL | Main/Candidate remote `main` heads match the local bases. Prior checkpoints and the attendance archive were reviewed. The original story ledger and accepted historical work remain unreconciled. |
| 01 | Architecture and integration blueprint | PARTIAL | Authenticated route and existing RPC contracts inspected. A route-level workspace correction is present; full architecture/story mapping is not accepted. |
| 02 | Figma design system and UX foundation | PARTIAL | Managerial Dashboard and Personal Leave references inspected. The manager page now follows the visible Figma summary-card and attendance-chart composition; desktop and mobile captures are saved under `docs/evidence/`. Candidate/Super Admin reference recovery and full authenticated React-to-Figma comparison remain outstanding. |
| 03 | SaaS platform and tenant lifecycle | PARTIAL | Synthetic two-tenant membership and isolation journeys passed locally. Tenant provisioning, lifecycle operations and cross-tenant browser acceptance remain open. |
| 04 | Authentication, roles, permissions and security | PARTIAL | 43/43 isolated local Auth/RLS checks passed with eight synthetic Auth identities across two tenants. Active membership role IDs scope permissions; global roles alone grant no tenant access; effective function ACLs, employee self-service, storage, denied actions, anonymous calls, revocation, approval, audit paths, and tenant-scoped dashboard aggregates were exercised. Full application role and story acceptance remains open. Production review also found other exposed tables/functions and leaked-password settings requiring review; see `SUPABASE_SECURITY_ADVISOR_20261012.md`. |
| 05 | Organization, people and employee master data | PARTIAL | Ordinary linked employees now have a tenant-checked own dashboard RPC and can read their own attendance, balances and leave history. General employee CRUD and the complete people lifecycle remain unaccepted. |
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
| 17 | Dashboards, analytics and reporting | PARTIAL | Tenant-scoped Managerial Dashboard follows the visible Figma top-page composition with eight real attendance/team metrics, a 7/30-day attendance chart, metric search, CSV download, and pending-work shortcuts. “Today” follows the tenant timezone. Counts use explicit stored statuses/modes and approved leave; former employees and schedule-based late inference are excluded. Browser checks cover display, search, range filter, download and mobile layout. Additional analytics and full role/story acceptance remain open. |
| 18 | Mobile, EN/BN, accessibility and UX refinement | PARTIAL | The Managerial Dashboard passes a 375px narrow-screen check with no page-level horizontal overflow; desktop/mobile screenshots are saved. The full browser suite passed, including prior responsive, Bengali expansion, keyboard, recovery, and employee leave cases. Complete app-wide accessibility and visual acceptance remain open. |
| 19 | Data migrations, security and cross-system certification | PARTIAL | The local release-candidate migration and staged approval SQL passed 43/43 isolated Auth/RLS checks. No production SQL or settings changed. Remaining schema/function review, Candidate public-column validation, full migration drift reconciliation and release certification are open. |
| 20 | Canonical story coverage and gap-closure loops | BLOCKED | The original 1,047-row ledger is unavailable; zero stories are mapped and accepted here. |
| 21 | Final release candidate and one-time publication | BLOCKED | No final backup certification, GitHub publication, deployment or production acceptance occurred. |

## Next sequence

1. Recover the original canonical story ledger and authoritative master directive; do not synthesize IDs.
2. Continue using the free local scratch stack; the selected-organization branch cost lookup is unavailable from the connected Supabase service, and no paid branch is authorized.
3. Continue functional role pages and workflows using the existing Main/Candidate contracts while recovering the canonical catalogue; do not invent story IDs or claim catalogue coverage.
4. Reconcile the remaining production policies, functions, migration history and Candidate public surface.
5. Verify Drive folder ownership/write access and round-trip integrity for a final versioned source archive before any GitHub publication.
6. Publish and deploy only after every required gate passes.
