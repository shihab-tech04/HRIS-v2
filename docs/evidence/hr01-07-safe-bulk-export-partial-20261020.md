# HR01-07 — safe bulk export evidence (partial)

**Status: PARTIAL.** The existing employee directory supports read-only export of the current authorized page. This does not validate bulk writes or other bulk operations.

## Evidence

- Main application commit: `7080be47683b9e578174c010bdbe68ba04eedfca`.
- Full disposable Auth/Postgres/Storage/browser workflow: [GitHub Actions run 39385416264](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39385416264), passed on 20 October 2026.
- Runtime tests: `tests/sql/isolated-auth/run-local.mjs` and `tests/sql/isolated-auth/run-employee-directory-browser.mjs`.
- Contract test: `tests/contracts/hr01-safe-bulk-export.test.mjs`.
- Browser marker: `HR01-07_SAFE_BULK_EXPORT_BROWSER_PASS`.

## Verified scope

An authenticated synthetic tenant-A member with `employees.view` exports the six employees in the current directory page. The CSV contains exactly `Employee`, `Employee number`, `Department`, `Designation`, `Team`, and `Employment status`. The test confirms that employee contact values and tenant-B-only rows are absent. The current-page page-size boundary and generated CSV are checked in the browser journey.

## Limit of this result

This verifies a permitted read-only export path. It does not define or validate safe bulk create, update, delete, or import behavior, and hosted signed-in acceptance remains pending. HR01-07 remains **partial**. No production schema, data, permission, or deployment was changed.
