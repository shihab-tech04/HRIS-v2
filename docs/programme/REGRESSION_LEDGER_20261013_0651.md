# Regression Ledger — 2026-10-13 06:51 Asia/Dhaka

**Feature HEAD:** `a2834b6550d2f42c56c94c1ace066d99f6b4e6a1`.

| Area | Verification | Status | Limit |
|---|---|---|---|
| Teams filtered CSV export | Focused Chromium 2/2; verifies filtered tenant rows, filename, formula-safe CSV cell and mobile overflow. | PASS | Synthetic team rows; read-only browser behavior. |
| Full authenticated workspace | Chromium 41/41. | PASS | Browser uses synthetic API responses and blocks external requests. |
| Contracts/type/build | TypeScript PASS; 45/45 contracts; Vite build PASS. | PASS | Existing large bundle advisory (762.46 kB minified JS). |
| Tenant/Auth/RLS | Disposable local suite 77/77; cross-tenant reads/RPCs/approvals denied. | PASS | No SQL changed since this run. |
| Figma evidence | Test-generated screenshots restored; prior Figma-aligned screenshots remain committed. | PRESERVED | Teams page uses established shell/tokens; no dedicated Teams frame was available. |
| Canonical stories | Project mount empty, local matrix empty skeleton; expected hash unverified. | BLOCKED ON SOURCE | 0/1,047 mapped and accepted; 1,047 pending. |
| Production state | Read-only metadata only; no production mutation, paid service, GitHub push or deployment. | UNCHANGED | Full release acceptance remains open. |

The prior regression history remains in `REGRESSION_LEDGER_20261013_0639.md`.
