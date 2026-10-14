# Acceptance Evidence — Project, Task, Peer Review, and EN/BN

Checkpoint: 2026-10-14 06:05 Asia/Dhaka. All database evidence below is from the free disposable local Supabase Auth/Postgres stack with synthetic users and two synthetic tenants.

| Journey or control | Evidence | Result |
|---|---|---|
| Admin/Manager project creation | Auth/Postgres role-negative cases | PASS: ordinary Admin and ordinary Manager denied; Super Admin allowed to create and appoint; direct writes denied. |
| Project manager scope | Two-tenant task/project access cases | PASS: assigned PM manages only led projects; ordinary members, other tenant and global-only identity denied. |
| Team plus concurrent projects | Persisted team/project allocations | PASS: employee retains organizational team and belongs to multiple projects within allocation cap. |
| Task lifecycle | Real local browser to Postgres | PASS: create, update outage/retry, member addition, start, release, complete and refresh persisted. Completion succeeded while two reviews were pending. |
| Review eligibility and uniqueness | SQL authorization and persistence cases | PASS: assignment overlap controls eligibility; no self-review; non-overlapping submission denied; duplicate submissions denied. |
| Review form and history | Real local reviewer/reviewee browser | PASS: 0–5 criteria, Not Observed stored separately, review submitted once, task/assignment/history linkage verified, history displayed to employee. |
| Locale and responsive behavior | Real local browser at 375px and 1280px | PASS: EN/BN switch updates labels and `document.lang`; Bengali choice persists in localStorage; no horizontal overflow. |
| Tenant/RLS/Auth regression | `node tests/sql/isolated-auth/run-local.mjs` | **206/206 PASS**, 0 failures. |
| Contract, types, and build | `npm run check` | **114/114 contracts PASS**; TypeScript PASS; Vite build PASS. Existing advisory: generated JavaScript chunk exceeds 500 kB. |
| Chromium regression | `npm run test:e2e` | **50/50 PASS**. |

There were earlier test-run failures from stale test selectors/expected capitalization and a sandbox loopback permission error. Test expectations were aligned to the implemented accessible labels; the isolated and Chromium suites were then rerun successfully. No production target was contacted or modified.

This evidence validates this journey only; it is not a release-wide certification or canonical story acceptance. The remaining story-to-evidence mapping and program phases remain open.
