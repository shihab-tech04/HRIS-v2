# HR01-08 — duplicate employee guard evidence (partial)

**Status: PARTIAL.** The deployed-schema-compatible employee identifier constraints reject duplicate employee numbers and official emails within one tenant. Duplicate-person matching and create-flow feedback remain unverified.

## Evidence

- Latest Main runtime commit: `1f0bec2fc40f27e600685661a83c6815dd43cf08`.
- Full disposable Auth/Postgres/Storage/browser workflow: [GitHub Actions run 39425355049](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39425355049), passed on 20 October 2026.
- Read-only production catalog query confirms unique indexes `employees_tenant_id_employee_number_key` on `(tenant_id, employee_number)` and `employees_tenant_id_official_email_key` on `(tenant_id, official_email)`.
- Runtime test: `tests/sql/isolated-auth/run-local.mjs`.
- Contract test: `tests/contracts/hr01-duplicate-prevention.test.mjs`.
- Runtime check: `HR01-08 partial: tenant employee-number and email duplicates are rejected without cross-tenant collision`.

## Verified scope

Synthetic disposable Postgres inserts that duplicate an employee number or official email within tenant A are rejected with PostgreSQL code `23505`. A same-email control row is accepted in tenant B, confirming uniqueness is tenant-scoped; the successful control row is deleted by the test. The disposable employee fixture mirrors the two deployed tenant-scoped unique indexes, and the test exercises those constraints without changing production schema or migration history.

## Limit of this result

These constraints cannot identify the same person entered under different identifiers and do not verify an HR create screen's duplicate warning or recovery. HR01-08 remains **partial**. No production data, schema, permission, or migration was changed.
