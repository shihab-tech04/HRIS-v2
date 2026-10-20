# HR01-06 — sensitive-change audit evidence (partial)

**Status: PARTIAL.** At application commit `686eec7016ec831e9b679500f28f553b8f93b14f`, the test now checks all nine employee contact fields supported by the current employee contact-update RPC. This still does not certify every sensitive employee-data category or production behavior.

## Evidence

- Full disposable Auth/Postgres/Storage/browser workflow: [GitHub Actions run 39378140222](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140222), passed on 20 October 2026.
- Phase 2A tenant/Auth/RLS/browser workflow: [GitHub Actions run 39378140175](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140175), passed.
- Full-run checks: TypeScript, **342/342 contract tests**, production build, **375/375** disposable local Auth/RLS assertions, Phase 04 SQL/API parity **26/26**, and disposable security advisor with no issues.
- Runtime test: `tests/sql/isolated-auth/run-local.mjs`.
- Browser test: `tests/sql/isolated-auth/run-employee-directory-browser.mjs`.
- Runtime marker: `HR01-06_CONTACT_AUDIT_BROWSER_PASS`.

The synthetic HR contact-edit journey changes all nine fields supported by `hris_update_tenant_employee_contact_details`: `official_email`, `personal_email`, `phone`, `official_phone`, `address`, `mailing_address`, `emergency_contact_name`, `emergency_contact_phone`, and `emergency_contact_relation`. It verifies one audit event contains every changed field name and excludes every changed value. Browser assertions cover save, recovery, persistence after refresh, English/Bengali, and 375px/1280px layouts. The exact runtime result reports all nine field names and `allChangedValuesExcluded: true`.

The existing E02-17 profile-change approval check separately verifies that the audit record contains the changed `field_key` and omits a `requested_value` key. These tests use synthetic Auth identities and disposable Postgres rows only.

## Limit of this result

The expanded HR01-06 test covers the current contact RPC and the related employee profile-request path; it does not establish a complete inventory of sensitive employee data or all write/audit paths. No signed-in production API session was exercised. HR01-06 therefore remains **partial**. Production Auth, data, schema, permissions, and deployment were not changed.
