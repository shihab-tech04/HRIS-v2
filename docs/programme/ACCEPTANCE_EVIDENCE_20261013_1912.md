# Acceptance Evidence — 2026-10-13 19:12 Asia/Dhaka

## Candidate offer-to-preboarding handoff

Main implementation commit: `cca02aa` (`feat: add secure candidate preboarding handoff queue`).
Candidate implementation commit: `36f7cd1` (`feat: complete live offer-to-preboarding flow`).

The candidate accepted and signed an issued offer through the existing UI. The isolated database created one application-linked handoff. The candidate completed the four existing packet sections, persisted them to local PostgreSQL, refreshed, and recovered saved values. Candidate submission records `candidate_submitted_at`; it does not complete or activate an employee account.

The authorized Main recruiter queue reads submitted packet details through a tenant-scoped RPC. The queue is shown only to `recruitment.manage`. The application and handoff data remain unavailable through direct authenticated table reads or writes.

## Security and journey evidence

- Candidate Auth/PostgreSQL/browser workflow: **67 pass, 0 fail**.
- Candidate route, navigation, and recovery tests: **15 pass, 0 fail**.
- Main HRIS contract/security regression tests: **82 pass, 0 fail**.
- TypeScript checks and Vite builds: **pass in both repositories**.
- Candidate journey: 375px mobile and 1280px desktop; offer signature, incomplete-step validation, identity and payroll saves, policy acknowledgment, final submission, refresh recovery, and post-submission lock.
- Authorization: candidate ownership, cross-tenant access, anonymous access, view-only recruiter access, and direct table reads/writes were denied. Tenant A and Tenant B managers saw only their own submitted handoffs.
- The test runner verified its disposable local Auth stack started with zero users and cleaned all synthetic users before reporting success. Production, GitHub, paid services, and deployment were not touched.

## Scope boundary

HR final verification and same-Auth-ID employee activation remain outside this checkpoint because the repository does not provide a verified activation RPC and the allowed activation fields and approval transition are not specified. The recruiter queue is read-only; no completion or compensation policy was inferred.

The canonical story IDs were not attached to this checkpoint. No IDs or requirement text were reconstructed; this evidence records the actual workflow scenarios and their test results.
