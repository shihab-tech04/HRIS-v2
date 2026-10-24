# Employee Digital ID — E04 story evidence

Canonical source: `docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json`

Verified SHA-256: `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`

Module: E04 — Employee ID / Digital ID (5 stories)

## Implemented scope

The existing employee dashboard profile now opens a read-only digital ID card containing the employee name, employee number, current designation, department, and exact employment status. The card reads only the authenticated employee's record through an RPC that verifies a live Auth session, active tenant membership, an active tenant, and the existing own-employee link. The existing own-employee helper excludes resigned and terminated records. Contact, family, payroll, and other employee data are not returned. The UI refreshes the card from the server, reports loading/errors, supports retry and close/Escape, and is localized in English and Bengali.

## Story mapping

| Story | Evidence mapping | Status |
| --- | --- | --- |
| E04-01 — see employee ID | Own employee number persisted in the Auth/Postgres record and shown on the digital ID card | **VERIFIED** |
| E04-02 — access digital employee card where supported | Authenticated card opens, recovers from a failed read, refreshes, and closes at desktop/mobile sizes | **VERIFIED** |
| E04-03 — official designation and department | Same-tenant designation and department persist and display on the card | **VERIFIED** |
| E04-04 — reflect active employment information | Active employment status is server-refreshed and displayed | **VERIFIED** |
| E04-05 — expired or inactive status | Inactive is displayed and terminated records are denied. The current employee schema has no verified employment-expiry field or policy. | **PARTIAL**; expiry handling requires an approved source contract |

The catalogue remains read-only and its original story status fields are unchanged. Four stories are accepted from the isolated run; E04-05 remains partial.

## Acceptance evidence

- Contract tests: `tests/contracts/employee-identity-card.test.mjs`
- Isolated Auth/RLS assertions: `tests/sql/isolated-auth/run-local.mjs`
- Browser workflow: `tests/sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs`
- GitHub Actions run: [39018685182](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39018685182), job `117355935474`; Auth/Postgres/RLS **358/358 PASS**, contracts **292/292 PASS**, including desktop/mobile identity-card browser assertions
- Verified development commit: `426527fd45a983e6958a0ca5ef063305d69bd48a`
