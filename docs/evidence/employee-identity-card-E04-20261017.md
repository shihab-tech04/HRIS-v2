# Employee Digital ID — E04 story evidence

Canonical source: `docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json`

Verified SHA-256: `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`

Module: E04 — Employee ID / Digital ID (5 stories)

## Implemented scope

The existing employee dashboard profile now opens a read-only digital ID card containing the employee name, employee number, current designation, department, and exact employment status. The card reads only the authenticated employee's record through an RPC that verifies a live Auth session, active tenant membership, an active tenant, and the existing own-employee link. The existing own-employee helper excludes resigned and terminated records. Contact, family, payroll, and other employee data are not returned. The UI refreshes the card from the server, reports loading/errors, supports retry and close/Escape, and is localized in English and Bengali.

## Story mapping (implementation status, not yet accepted)

| Story | Evidence mapping | Status |
| --- | --- | --- |
| E04-01 — see employee ID | Existing profile and new card display employee number | Implemented; isolated acceptance pending |
| E04-02 — access digital employee card where supported | Authenticated self-service identity card dialog | Implemented; isolated acceptance pending |
| E04-03 — official designation and department | Same-tenant joins in the read-only RPC and card fields | Implemented; isolated acceptance pending |
| E04-04 — reflect active employment information | Server-refreshed fields and exact employment status; active status is emphasized while other statuses remain neutral | Implemented; isolated acceptance pending |
| E04-05 — expired or inactive status | Inactive is returned/displayed as inactive; the existing helper denies resigned/terminated records. The current employee schema has no verified employment-expiry field or policy. | Partial; expiry handling requires an approved source contract |

The catalogue remains read-only and its original story status fields are unchanged. Do not count E04 as accepted until the isolated Auth/Postgres and browser workflow passes in GitHub Actions.

## Acceptance evidence

- Contract tests: `tests/contracts/employee-identity-card.test.mjs`
- Isolated Auth/RLS assertions: `tests/sql/isolated-auth/run-local.mjs`
- Browser workflow: `tests/sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs`
- GitHub Actions run: pending
- Verified commit: pending
