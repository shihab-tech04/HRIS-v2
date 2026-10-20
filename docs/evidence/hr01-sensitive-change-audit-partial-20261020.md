# HR01-06 — sensitive-change audit evidence (partial)

**Status: PARTIAL.** At application commit `7080be47683b9e578174c010bdbe68ba04eedfca`, the disposable suite checks all nine employee contact fields supported by the contact-update RPC and all nine profile fields supported by the protected profile-request path. This does not certify every sensitive employee-data category or hosted behavior.

## Evidence

- Full disposable Auth/Postgres/Storage/browser workflow: [GitHub Actions run 39385416264](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39385416264), passed on 20 October 2026.
- Phase 2A/2B tenant/Auth/RLS/browser workflow: [GitHub Actions run 39385416331](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39385416331), passed with **PASS=89 FAIL=0**.
- Full-run checks: TypeScript, **344/344 contract tests**, production build, **56/56** standalone browser regressions, **378/378** disposable local Auth/RLS assertions, Phase 04 SQL/API parity **26/26**, and disposable security advisor with no issues.
- Runtime test: `tests/sql/isolated-auth/run-local.mjs`.
- Browser test: `tests/sql/isolated-auth/run-employee-directory-browser.mjs`.
- Runtime marker: `HR01-06_CONTACT_AUDIT_BROWSER_PASS`.

The synthetic HR contact-edit journey changes all nine fields supported by `hris_update_tenant_employee_contact_details`: `official_email`, `personal_email`, `phone`, `official_phone`, `address`, `mailing_address`, `emergency_contact_name`, `emergency_contact_phone`, and `emergency_contact_relation`. It verifies one audit event contains every changed field name and excludes every changed value. Browser assertions cover save, recovery, persistence after refresh, English/Bengali, and 375px/1280px layouts. The protected profile-request path separately tests `full_name`, `official_email`, `personal_email`, `official_phone`, `address`, `mailing_address`, `emergency_contact_name`, `emergency_contact_phone`, and `emergency_contact_relation`; changed values stay out of audit details and persisted fields match approved requests.

The E02-17 profile-change approval journey also verifies that the audit record contains the changed `field_key` and omits a `requested_value` key. These tests use synthetic Auth identities and disposable Postgres rows only.

## Limit of this result

The expanded HR01-06 test covers the current contact RPC and related employee profile-request path; it does not establish a complete inventory of sensitive employee data or all write/audit paths. Production does not currently expose either contact-detail RPC or the source migration version; no signed-in production HR/Admin API session was exercised. HR01-06 therefore remains **partial**. Production Auth, data, schema, permissions, migration history, and deployment were not changed.
