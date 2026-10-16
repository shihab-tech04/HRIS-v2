# Regression Ledger — 2026-10-13 06:39 Asia/Dhaka

**Current HEAD:** `d18563f73007dd3e1746018295d040f2e00d1f3f` (`feat(organization): add tenant-scoped teams directory`).

| Area | Current evidence | Status |
|---|---|---|
| Phase 10 Teams directory | Focused Chromium 2/2; includes filter behavior, tenant request filter and 375px layout checks. | PASS |
| Full authenticated workspace | Chromium 41/41. | PASS |
| Contracts and build | TypeScript PASS; contracts 45/45; Vite build PASS with existing bundle-size advisory. | PASS |
| Tenant/Auth/RLS | Disposable local suite 77/77; cross-tenant attendance reads both directions, tenant RPC scoping, and leave/attendance approval denial all pass. | PASS |
| Figma evidence | Test-generated screenshots restored; prior Figma-aligned screenshots unchanged. Teams page reuses existing shell/tokens; no dedicated Teams frame was available. | PRESERVED / PARTIAL |
| Canonical stories | Local story matrix is empty skeleton; source mount is empty; expected canonical SHA not verified. | BLOCKED ON SOURCE |
| Timesheet reviewer | Default-deny; verified tenant-scoped project-lead mapping and permission are absent. | PRESERVED BLOCKER |
| Hosted environment | Read-only schema metadata only; no data/schema/permission/Auth writes, paid service, GitHub push, or deployment. | NO MUTATION |

The preceding regression ledger remains available at `REGRESSION_LEDGER_20261013_0025.md`.
