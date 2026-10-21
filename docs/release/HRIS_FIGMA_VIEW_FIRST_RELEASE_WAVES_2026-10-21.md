# HRIS 360 — Figma-first, view-first production plan (2026-10-21)

## Scope and release contract
Goal: production-serve approved, role-specific **1:1 Figma views**, even if some business actions cannot yet work. Unready actions must be visible as unavailable/disabled, never simulate success, leak tenant data, or bypass hosted Auth/RLS. Maintain shared Material/Poppins shell, approved brand, EN/BN and privacy; preserve working modules and SQL. WS05 alone can merge/deploy after protected reviews, external code+DB backup/readback/restore, exact-head CI, two-tenant rejection and live version validation.

## Denominator
Current Main: 36 routes. Candidate: 13 routes (public-only production). Approved Figma file XEXLe9J1oATlITS9I5u1P9 Page 1: 74 full-desktop frame/states, 40 distinct labels; 13 component specimens. Breakdown: dashboard/role 12, attendance/leave 25, profile/employee records 29, performance/evaluation 6, employee recruitment/request 1, ambiguous 1. 61 historical parity checks = 4 shell geometry PASS, 1 token mismatch, 56 unmapped/BLOCKED; not another 61 screens or completed pixel checks. Candidate private design mapping is **unknown**.

## Nine delivery phases
| Phase | Work | Owner(s) | Exit |
| --- | --- | --- | --- |
| UI-00 | Approved frame → Main route/role/state + Candidate route map, component baseline | WS04 + WS03 | All mapping or explicit no-frame dispositions |
| UI-01 | Shared shell/header/sidebar/tabs, typography, tables/forms, primary-token decision | WS01 Main / WS03 Candidate | Scoped Figma screenshots, desktop+mobile |
| UI-02 | Personal/manager dashboards, role navigation (12 frame/states) | WS06 + WS08 | Correct chart semantics and role/state |
| UI-03 | Attendance/leave requests and decisions (25 frame/states) | WS07 + WS08; WS01 integration | Matched visual states; incomplete writes gated |
| UI-04 | Profile/contact/family/bank/training/work (29 frame/states) | WS06 | Owner-only views, approved fields |
| UI-05 | Evaluations (6), employee recruitment (1), ambiguous (1), remaining Main routes | WS07 + WS08 | Matched or approved N/A |
| UI-06 | Candidate jobs, CV, apply, interviews, offers and preboarding | WS03 | Approved Candidate visual contract and privacy |
| UI-07 | Independent screen-by-screen QA at 1920/1280/768/375, EN/BN, keyboard, error/empty/loading | WS04 | Exact-head evidence, no untested claims |
| UI-08 | Reviewed UI integration, off-GitHub code+DB recoverable backup, secure production release and rollback proof | WS02 + WS05 | Hosted acceptance, live SHA/URL; otherwise HOLD |

## First independent work packets
- WS01: [PR #49](https://github.com/shihab-tech04/HRIS-v2/pull/49) implements approved Attendance & Leave title band and route-gated navigation in `LiveHrisWorkspace`; no new backend or hidden demo mode. Verify exact CI, screenshots and original actions.
- WS04: independent comparison of attendance `17:28320`, request `17:29937/30342/30766/31148`, leave `17:31769/32168/32584/32957`; no unverified PASS.
- WS03: public Candidate jobs → detail → back, 375/768/1280/1920 EN/BN, search/filters and accessible empty/error states; do not unlock private features. Candidate Figma mapping is still unapproved.
- WS06: employee dashboard/profile Figma and approved owner fields; no shared shell.
- WS07: HR attendance/leave columns, manager approval states; do not change WS01 source.
- WS08: Manager dashboard chart semantics and leave frames; no invented master-data writes.
- WS02: RPC/RLS/auth tenant-negative checks and [PR #48](https://github.com/shihab-tech04/HRIS-v2/pull/48) security source review; production read-only.
- WS05: sole release controller, reconcile Main release #38 and Candidate release #5; verify Pages asset parity and restore-safe external backups.

## As-checked release state
Main production branch `cfd5fc5`, development `2a5fe5f`; Candidate production branch `38174c7`, development `e3cb9c1`. Supabase hrmis-saas ACTIVE_HEALTHY, migration head `20261020044145`, but two hosted contact RPCs absent. Main WS05 release-ledger exact-head GitHub Actions 39546438210 **FAIL** (Pages entry parity), WS04 design-audit 39546436342 **PASS**; PR #48 source build/PG17 tests do not prove hosted tenant acceptance. **RELEASE HOLD** until actual gates close.

Browser connection in ordinary Chat is read-only: eight HRIS workstation tabs can be listed, not closed. GitHub branches/CI can be operated concurrently in this session; opening independent ChatGPT Work sessions requires Work mode. This document itself creates no autonomous work.
