# HR01-06 — sensitive-change audit evidence (partial)

**Status: PARTIAL.** This checkpoint records the bounded behavior exercised at application commit `a920281911b3d61ea116dc951bca900aeb3b4958`; it does not certify every sensitive employee-data category or production behavior.

## Evidence

- Full disposable Auth/Postgres/Storage/browser workflow: [GitHub Actions run 39375324961](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39375324961), passed on 20 October 2026.
- Runtime test: `tests/sql/isolated-auth/run-local.mjs`.
- Browser test: `tests/sql/isolated-auth/run-employee-directory-browser.mjs`.
- Runtime marker: `HR01-06_CONTACT_AUDIT_BROWSER_PASS`.

The journey performs an authorized HR contact change and verifies one audit row naming `official_email` and `emergency_contact_phone`. It confirms the changed email value is not included in the audit details and checks the existing contact-editing browser journey. All records and Auth identities are synthetic and disposable.

## Limit of this result

The test covers only two contact fields. It does not establish a complete inventory of sensitive fields, certify all audit paths, or exercise a signed-in production API session. The story therefore remains partial. Production Auth, data, schema, permissions, and deployment were not changed by this application checkpoint.
