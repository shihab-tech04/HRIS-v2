# Synesis HRIS execution checkpoint — 2026-10-14 03:40 Asia/Dhaka

## Functional batch

Phase 13 now includes two separate, read-only payroll journeys in the existing HRIS shell:

- **My Payslips** shows each linked employee their released payslips and same-tenant period details.
- **Payroll Register** lets active tenant members with `payroll.view` or `payroll.manage` review the organization’s persisted payslip rows, search employee name/number, filter by period and status, paginate, and refresh.

The register is database-authorized through a tenant-scoped RPC. Its response whitelist omits bank, bank-account, tax-ID, and note fields. It does not write payroll data or calculate amounts. Tenant changes hide prior-scope rows while the next request loads; failed first loads expose a retry action.

## Verification

- `npm run check`: TypeScript pass, **106/106 contract tests pass**, Vite production build pass. The existing JavaScript chunk-size advisory remains.
- `git diff --check` and browser-runner syntax checks pass.
- Full isolated local Supabase Auth/Postgres/RLS/browser acceptance: **192/192 passed, 0 failed**. Payroll coverage includes permissioned tenant A data, cross-tenant/unlinked/global-only/employee/anonymous denials, RPC ACL, period and status validation, filtering, pagination, persisted amount display, sensitive-field omission, injected outage/retry, refresh, and 375px mobile / 1280px desktop layouts. Existing Phase 10/11 project, task and peer-review checks remain in the same passing suite.
- All database fixtures and Auth identities were synthetic in the disposable local stack. No hosted database, production data or permissions, paid services, GitHub push, or deployment changed.

## Source and constraints

- Feature commit: `50acbefb27e8706ac38d86bd8cb474f062f1b2ac` (`feat(hris): add tenant-scoped payroll register`).
- Phase 13 remains partial. Payroll calculations, pay-run management, benefits, and additional payroll authority rules are unresolved; this batch did not infer them.
- The user identifies the recovered canonical matrix as 1,047 stories across 153 modules with expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. This project mirror’s `sources/` directory is empty and its local matrix file is only the empty tracking skeleton, so this checkpoint does not verify that hash or claim story-ID mapping.
- No GitHub push or deployment. A versioned source archive and Git bundle are prepared for the existing connected-account-owned Drive preservation folder before any final publication.
