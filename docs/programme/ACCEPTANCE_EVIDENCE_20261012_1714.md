# Acceptance Evidence — 2026-10-12 17:14 Asia/Dhaka

This checkpoint extends the employee attendance-correction journey with manager-side approval and rejection acceptance. It is functional evidence only and does not certify full Phase 08, the 22-phase product, or canonical story coverage.

## Phase 08 — Correction request and resolution

- The employee flow added at 17:07 remains accepted by the **47/47 local Auth/RLS** suite and mobile browser journey: active linked employee and tenant binding, tenant-local time conversion, required reason/change validation, pending request, audit and own correction history.
- Attendance Information now verifies the manager path through the existing `admin_resolve_attendance_correction` contract. The browser journey opens the correction queue, approves one request, confirms rejection of another, checks the RPC payloads and verifies the refreshed statuses.
- `tests/browser/attendance-information.spec.ts`: **1/1 PASS** for detail/report mode, filters/export/mobile and manager approve/reject. `HRIS_TEST_PORT=4199 npm run test:e2e`: **37/37 PASS, 0 failed**.
- Latest `npm run check`: TypeScript PASS; contracts **26/26 PASS**; Vite build PASS (699.64 kB JavaScript chunk warning remains). `git diff --check`: PASS.
- Evidence: `docs/evidence/employee-attendance-correction-mobile-20261012.png`, `docs/evidence/attendance-information-desktop-20261012.png`, `docs/evidence/attendance-information-mobile-20261012.png`.

The five previously failing tenant-security cases remain passing in the 47-check local SQL/Auth suite. The browser suite uses mocks and blocked external requests; the local SQL/Auth suite uses disposable synthetic users and does not change production.

## Canonical story status and release boundary

The user-reported catalogue remains 1,047 stories across 153 modules with expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The mounted Project `sources/` folder has zero files; the local tracking matrix is an empty skeleton, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. Therefore **0/1,047 are mapped and accepted against canonical IDs; 1,047 remain unmapped**. Do not infer stories from implementation or test labels.

Continue Phase 08 roster/time work and Figma-aligned pages. No paid service, production data/permission change, GitHub push, final source archive or deployment occurred. Final order remains: complete acceptance, verify Drive source archive, push to GitHub, then deploy.
