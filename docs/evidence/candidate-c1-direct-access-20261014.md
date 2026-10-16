# Candidate C1 Direct-Access Security Acceptance — 2026-10-14

**Result: PASS.** Local Auth, PostgreSQL/RLS, and desktop/mobile browser acceptance completed on the dedicated disposable Supabase project `synesis-candidate-c1-auth-20261014-fresh`. No production endpoint or data was used. The runner confirmed that test Auth users were removed at completion.

## Tested source revisions

- Main: `6b82be7b7e40128952b37f8c48a1bd1d9d6a783c`
- Candidate: `c7c55a57733cd65e944b5c3142ea7d0419d5043b`

## Acceptance results

- `npm run test:local-application-e2e`: **384 checks passed, 0 failed**; desktop and mobile.
- C1 direct Data API matrix: **196/196 denied** with SQLSTATE `42501` across seven protected tables, seven principals, and `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
- Candidate journeys persisted through local Auth and PostgreSQL: application submission and stage history, assessments, interviews, offer preboarding and verification, and employee activation with the same Auth identity.
- Main activation contract: **2 passed, 0 failed**.
- Candidate route regression suite: **20 passed, 0 failed**.
- Candidate runner syntax and Git whitespace checks: passed.

The direct-access matrix covers `candidate_application_stage_history`, `job_applications`, `interviews`, `candidate_assessments`, `candidate_document_requests`, `job_offers`, and `onboarding_handoffs`. Principals were anonymous, both synthetic candidates, tenant A recruitment manager and viewer, tenant B recruitment manager, and tenant A employee manager.

The first fixture attempt exposed a test-schema mismatch: the local tenant table requires a unique `code`. The disposable database was reset, the test fixture was aligned, and the complete acceptance run then passed. The separate fresh-project startup attempt was abandoned after its optional Supabase containers failed health checks; it did not affect the passing test project or production.

This is acceptance evidence for the Candidate application and C1 security boundary. It does not certify the full HRIS release or deployment readiness.
