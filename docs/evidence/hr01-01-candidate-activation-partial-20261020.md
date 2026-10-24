# HR01-01 employee creation — candidate activation partial evidence — 2026-10-20

**Canonical requirement:** **HR01-01 — “As HR, I want to create employee records.”**

**Result: PARTIAL_ACCEPTANCE in a disposable Auth/Postgres/browser journey.** The existing HR workspace can activate a fully verified, accepted-offer candidate into a tenant employee record. This does not cover a general manual employee-create workflow, and hosted acceptance is **NOT_VERIFIED**.

## Exact implementation and runtime evidence

- Latest Main repository checkpoint: `1f0bec2fc40f27e600685661a83c6815dd43cf08` on `development/hris-checkpoints` (the activation fix was introduced in `4cc26610c2bd8fc339990cb433d64a6e9c24e15a`).
- Full isolated acceptance workflow: [run 39425355049](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39425355049).
- Full run passed **350/350 contract tests, 56/56 standalone browser regressions, 386/386 local Auth/RLS assertions, and Phase 04 parity 26/26**, with a successful production build and no disposable database security advisor findings.
- Forward fix: `supabase/migrations/20261020121500_hris_candidate_activation_employee_id.sql` replaces the activation RPC without rewriting the earlier migration and explicitly supplies `gen_random_uuid()` for the employee primary key.
- Auth/RLS runtime record: `HR01-01 partial: the HR workspace activates a verified candidate into a tenant employee record with safe retry` in `tests/sql/isolated-auth/run-local.mjs`.
- Browser marker: `HR01-01_PARTIAL_CANDIDATE_ACTIVATION_BROWSER_PASS` from `tests/sql/isolated-auth/run-hr01-01-employee-creation-browser.mjs`.
- Source migration compatibility record for **HR01-02/HR01-06**: `HR01-02/06 contact RPC source migration reapplies after current authorization schema with the expected signatures, ACL, and search path`. The runner reapplies `20261014171952_employee_contact_details_editing.sql` only inside this disposable database, after later authorization and employee-table migrations.
- Cross-system integration is separately recorded as partial **X03-07** and **X03-08** at `docs/evidence/x03-07-08-candidate-employee-activation-partial-20261020.md`, with exact runtime records in the same workflow.

## Verified path

The test uses a synthetic Tenant A candidate with an accepted offer and a submitted four-step onboarding handoff. A fresh authenticated HR manager with `employees.manage` completes verification in the existing Onboarding queue. The journey verifies a generated employee ID linked to the candidate Auth user; an active employee record; the application advancing to `hired`; the onboarding handoff completing and recording its verifier; one audit event; one tenant Employee membership; and an identical retry returning the same employee without duplicating the result.

The Auth/RLS checks reject an account without `employees.manage`, cross-tenant HR, unverified candidate details, and a future joining date. The browser captures the activation RPC request and checks for horizontal overflow at 375px and 1280px. All records are synthetic and the runner removes the fixture rows before the disposable database stops.

Reserved fixture identifiers include job `ab010001-0000-4000-8000-000000000001`, application `ab010001-0000-4000-8000-000000000002`, handoff `ab010001-0000-4000-8000-000000000003`, offer `ab010001-0000-4000-8000-000000000004`, and employee number `HR01-01-E001`.

## Acceptance boundary

This evidence supports **partial** HR01-01 only. No general HR employee-create form or independently approved manual-create contract is evidenced. The onboarding flow starts from an accepted Candidate offer and submitted candidate packet, with verification before HR activation. The isolated replay of the contact RPC migration establishes source compatibility within the disposable schema; it does not apply that migration to production or close the hosted API gap.

The preceding test run on `c095cfdb3b8fa2c53ccdd794f6546286fe5522de` exposed a missing primary key (`23502`, `employees.id` was null); that failed run is not acceptance evidence. The forward migration above fixes the defect, and the cited run retests the full activation path.

Production remains read-only at migration head `20261020044145`. Both contact RPCs remain absent from production, no SQL write or deployment occurred, and hosted HR/Admin acceptance remains **NOT_VERIFIED**. HR01-05 employment history remains **NOT_CLASSIFIED**.
