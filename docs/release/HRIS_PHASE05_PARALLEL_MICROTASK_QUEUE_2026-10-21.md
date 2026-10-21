# HRIS Phase 05 — Parallel Microtask Queue (21 October 2026)

**Authority:** Canonical 1,047-story register (WS04), current draft PR heads, source-backed acceptance. Phase 05 contains **57 exact IDs in 36 initial packets**, each ID allocated once. Saved register classification: IMPLEMENTED_NOT_CERTIFIED: 19; BLOCKED: 29; PARTIAL: 9. No story is independently hosted-certified by these classifications.

**Execution:** At most one scoped 15–30-minute packet per owner at once. Different WS branches may work concurrently. Each packet is the *next smallest source/test/implementation checkpoint*; packet completion is not full story certification. If blocked, record evidence and switch to another independent packet rather than inventing data/API or extending the task.

**Hard gates:** WS02 approves any RPC/RLS/tenant write contract with isolated two-tenant negative tests; WS04 checks exact story-ID evidence; WS05 alone reviews guarded merge/deployment. Preserve the solved UX and shared shell, sole Super Admin, Figma design system, mobile accessibility, SQL sync, external backups and existing migration head. Never write to production, merge, or release from these packets without clearance. Pages asset parity is still open.

**Current first parallel wave:** WS01 HR01-07/08 (read-only source-to-test gap); WS02 E02-09/HR01 contact function isolated security contract; WS06 E04-05 inactive state negative test (not expiry-rule invention); WS07 HR03-01 product-contract recovery; WS08 SA06-01 write-scope recovery; WS04 evidence reconciliation; WS05 exact-SHA Pages parity and release gates.

| Packet | Owner | Exact stories | Smallest scoped finish condition |
|---|---|---|---|
| P05-01 | WS01 | HR01-03, HR01-04 | Verify workforce search and status at current base; exact source and browser evidence |
| P05-02 | WS01 | HR01-01 | Identify the smallest employee-create gap; do not change unapproved fields |
| P05-03 | WS01 | HR01-02, HR01-06 | Reconcile employee edit and sensitive-field audit trail against original requirements |
| P05-04 | WS01 | HR01-07, HR01-08 | Verify existing bulk-operation permissions and duplicate protection before editing |
| P05-05 | WS01 | HR01-05 | Recover approved employment-history contract; no invented history table |
| P05-06 | WS06 | E02-01, E02-08 | Check owner-only profile and employment read at current exact SHA |
| P05-07 | WS06 | E02-02, E02-04, E02-06 | Reconcile existing hosted self-profile RPC allowlist and source parity with WS02 |
| P05-08 | WS06 | E02-03, E02-17 | Verify protected-field request and status journey in both locales |
| P05-09 | WS06 | E02-05 | Address self-edit integration only after server contract/Auth parity |
| P05-10 | WS06 | E02-07 | Family/dependent edit integration only after server contract/Auth parity |
| P05-11 | WS06 | E02-09 | Connect six approved employment fields to current LiveHrisWorkspace only after WS02 RPC security acceptance |
| P05-12 | WS06 | E02-10 | Check existing education components and approved write contract |
| P05-13 | WS06 | E02-11, E02-18 | Resolve historical employment read/write retention contract before UI edits |
| P05-14 | WS06 | E02-12 | Verify scoped skills editing and mobile regressions |
| P05-15 | WS06 | E02-13, E02-14 | Check certification and professional-link source contracts; no invented fields |
| P05-16 | WS06 | E02-15 | Recover owner-scoped private profile-photo upload/replace contract |
| P05-17 | WS06 | E02-16 | Map verified vs HR-controlled fields from approved source |
| P05-18 | WS06 | E03-01, E03-04 | Exact-sha owner-document read and verification-status proof |
| P05-19 | WS06 | E03-05, E03-06 | Expiry display evidence; reminders remain gated on approved schedule/threshold |
| P05-20 | WS06 | E03-07, E03-08 | Owner-only download EN/BN and rejected correction reason test; save exact CI proof |
| P05-21 | WS06 | E03-02, E03-03 | Recover approved upload and replacement allowlist, then smallest safe implementation |
| P05-22 | WS06 | E04-01, E04-02 | Verify identity card open/close and employee ID under correct role |
| P05-23 | WS06 | E04-03, E04-04 | Verify active designation and department in approved card |
| P05-24 | WS06 | E04-05 | Test inactive/terminated state; flag expiry semantics pending requirements |
| P05-25 | WS06 | E37-01, E37-02 | Verify search and existing department/team filters; location gated on approved projection |
| P05-26 | WS06 | E37-03, E37-04 | Reconcile permitted directory contact and reporting lines with WS02 |
| P05-27 | WS06 | E37-05 | Verify directory private-field exclusion and export privacy |
| P05-28 | WS07 | HR03-01 | Recover legal-entity cardinality, owner, fields and tenant authorization from canonical sources |
| P05-29 | WS07 | HR03-02 | Map approved office/branch relationships; no speculative schema |
| P05-30 | WS07 | HR03-03, HR03-04 | Compare department and unit editor requirements with existing tenant UI |
| P05-31 | WS07 | HR03-05 | Verify team hierarchy contract without changing shared navigation |
| P05-32 | WS07 | HR03-06, HR03-07 | Map designation and grade/band controlled-value contracts |
| P05-33 | WS07 | HR03-08, HR03-09 | Recover reporting/effective-date history semantics and regression cases |
| P05-34 | WS08 | SA06-01 | Recover Super Admin global/tenant master-data write permissions and approved controls |
| P05-35 | WS08 | SA06-02 | Trace cross-module controlled-value reuse without new fields |
| P05-36 | WS08 | SA06-03, SA06-04 | Specify inactive historical retention and duplicate avoidance tests |

## Cross-workstation gates (not extra story IDs)

- WS02: source-verified HR01 contact and E02-09 RPC signatures, grants, ownership, RLS, two-tenant Auth and negative cases; no production migration replay.
- WS04: reconcile every exact ID after real test/hosted evidence; do not double-count historical passing runs, docs or audit-only work.
- WS05: integrate only reviewed code and matching generated Pages assets, require backups/read-back/restore, protect main and ensure hosted role/tenant acceptance; maintain RELEASE HOLD until passing.

## Checkpoint template

`ID(s) → exact commit/PR → changed paths → implemented behavior → tests and actual CI run → responsive/accessibility/privacy checks → blocker(s) → WS04 status → WS05 release decision`.

**Important:** GitHub handoff comments/documentation do not themselves launch or keep ChatGPT workstation conversations running. Live execution needs those workstations resumed or the parallel work performed through active tool sessions. No automatic/background execution is claimed.
