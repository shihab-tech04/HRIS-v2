# Employee document self-service — E03 evidence

Canonical source: `docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json`

Verified SHA-256: `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`

Catalogue totals: 1,047 stories across 153 modules. The canonical source remains unchanged.

## Acceptance mapping

| Story | Requirement | Implementation and evidence | Status |
|---|---|---|---|
| E03-01 | View documents stored against the employee record | `EmployeeDocumentVault`; `hris_get_my_employee_documents`; isolated employee Auth/RLS/browser assertions | Verified after `EMPLOYEE_DOCUMENTS_BROWSER_ACCEPTANCE=PASS` |
| E03-02 | Upload documents HR allows the employee to provide | No approved employee upload allowlist or write contract was found in this batch; no upload permission was invented | Pending |
| E03-03 | Replace an expired document | Depends on an approved employee upload/write contract and replacement semantics | Pending |
| E03-04 | See verification status | Status in own-record projection and responsive EN/BN browser assertion | Verified after `EMPLOYEE_DOCUMENTS_BROWSER_ACCEPTANCE=PASS` |
| E03-05 | See expiry dates | Expiry date in own-record projection and responsive browser assertion | Verified after `EMPLOYEE_DOCUMENTS_BROWSER_ACCEPTANCE=PASS` |
| E03-06 | Receive approaching-expiry reminders | No approved reminder schedule or notification contract was found; no threshold was invented | Pending |
| E03-07 | Download documents the employee may access | Download uses the private Storage API with the employee-owned object path; foreign origins and other owners are rejected | Verified after Storage/Auth browser assertion |
| E03-08 | See the reason for a rejected document | The server projection returns a review note only when status is `rejected`; synthetic Auth/RLS and browser assertions verify this | Verified after `EMPLOYEE_DOCUMENTS_BROWSER_ACCEPTANCE=PASS` |

The new database function is read-only. Existing upload, replacement, expiry-reminder and verification-management behavior is not modified. Isolated acceptance runs on a fresh synthetic Supabase/Auth/Postgres/Storage stack; no production data or schema is touched.
