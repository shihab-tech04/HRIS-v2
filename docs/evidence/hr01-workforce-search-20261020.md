# HR workforce search/filter source evidence — HR01-03

**Canonical requirement:** HR01-03, “As HR, I want to search and filter the workforce.” The recovered 1,047-story / 153-module source matrix and its SHA-256 remain unchanged.
**Source checkpoint:** Main `development/hris-checkpoints` at `81eb677847fc19007cfb790dfc8cf7126c4c759d`.
**Verification:** [39373694520](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39373694520) passed the complete disposable Auth/Postgres/Storage/RLS/API/browser workflow.

An active synthetic tenant member with `employees.view` searched the workforce by employee name, department and active status, then filtered by team. The database journey verified the expected tenant-local matches, excluded private contact data from search, and rejected no-permission, global-only and cross-tenant access. The browser journey checked search, filters, empty results, refresh, export, Bengali locale persistence and mobile/desktop layouts. The source marker is `HR01-03_WORKFORCE_SEARCH_FILTER_BROWSER_PASS`.

Runtime evidence is in `tests/sql/isolated-auth/run-local.mjs` and `tests/sql/isolated-auth/run-employee-directory-browser.mjs`; the exact canonical mapping is in `tests/contracts/hr-workforce-search.test.mjs`. This proves only disposable source acceptance. Hosted database/API acceptance remains **NOT VERIFIED**.
