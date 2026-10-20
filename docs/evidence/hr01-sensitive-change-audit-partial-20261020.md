# HR01-06 — sensitive-change audit evidence (partial)

**Status: PARTIAL.** At application commit `f02ae03da438c88fc796163be7dc0880826b54e3`, the disposable suite checks all nine employee contact fields supported by the contact-update RPC and all nine profile fields supported by the protected profile-request path. It also verifies safe failure when either deployed contact RPC is missing. This does not certify every sensitive employee-data category or hosted behavior.

## Evidence

- Full disposable Auth/Postgres/Storage/browser workflow: [GitHub Actions run 39396457586](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39396457586), passed on 20 October 2026.
- Phase 2A/2B tenant/Auth/RLS/browser workflow: [GitHub Actions run 39396457535](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39396457535), passed with **PASS=89 FAIL=0**.
- Full-run checks: TypeScript, **347/347 contract tests**, production build, **56/56** standalone browser regressions, **381/381** disposable local Auth/RLS assertions, Phase 04 SQL/API parity **26/26**, and disposable security advisor with no issues.
- Runner availability probe: [GitHub Actions run 39396457633](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39396457633), passed.
- Runtime test: `tests/sql/isolated-auth/run-local.mjs`.
- Browser test: `tests/sql/isolated-auth/run-employee-directory-browser.mjs`.
- Runtime marker: `HR01-06_CONTACT_AUDIT_BROWSER_PASS`.
- Exact-ID safe-failure markers: `HR01-06_PGRST202_CONTACT_READ_SAFE_BROWSER_PASS` and `HR01-06_PGRST202_CONTACT_UPDATE_SAFE_BROWSER_PASS`; the run also asserts `HR01-02_CONTACT_ONLY_UPDATE_SCOPE_BROWSER_PASS`.

The synthetic HR contact-edit journey changes all nine fields supported by `hris_update_tenant_employee_contact_details`: `official_email`, `personal_email`, `phone`, `official_phone`, `address`, `mailing_address`, `emergency_contact_name`, `emergency_contact_phone`, and `emergency_contact_relation`. It verifies one audit event contains every changed field name and excludes every changed value. Browser assertions cover save, recovery, persistence after refresh, English/Bengali, and 375px/1280px layouts. The protected profile-request path separately tests `full_name`, `official_email`, `personal_email`, `official_phone`, `address`, `mailing_address`, `emergency_contact_name`, `emergency_contact_phone`, and `emergency_contact_relation`; changed values stay out of audit details and persisted fields match approved requests.

The E02-17 profile-change approval journey also verifies that the audit record contains the changed `field_key` and omits a `requested_value` key. These tests use synthetic Auth identities and disposable Postgres rows only.

## Limit of this result

The expanded HR01-06 test covers the current contact RPC and related employee profile-request path; it does not establish a complete inventory of sensitive employee data or all write/audit paths. Production does not currently expose either contact-detail RPC or the source migration version; no signed-in production HR/Admin API session was exercised. HR01-06 therefore remains **partial**. Production Auth, data, schema, permissions, migration history, and deployment were not changed.
