# HR01 employee-record update and deployed contact API gap — 2026-10-20

**Result: HR01-02 remains partial; HR01-06 remains partial. Hosted acceptance is not claimed.** The live employee directory has a safe, permission-gated editor for nine contact fields. The two RPCs it uses are present in source migration `20261014171952_employee_contact_details_editing.sql`, but neither the migration nor either procedure is present in hosted production. The application now reports PostgREST `PGRST202` as an unavailable contact service, preserves a failed edit draft, and never displays a save-success state for a missing update RPC.

## Read-only production evidence

Production project `hrmis-saas` (`oslgwxaqfbteqtwqvdzs`) was checked using catalog-only SQL on 20 October 2026:

| Catalog check | Result |
| --- | --- |
| Latest hosted migration | `20261020044145` (`phase03_learning_context_authenticated_acl_20261020`) |
| Source migration version `20261014171952` recorded | `false` |
| `hris_get_tenant_employee_contact_details(uuid,uuid)` present | `false` |
| `hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)` present | `false` |
| Active tenant count | `1` |

The read-only SQL result was: `source_migration_version_recorded=false`, `contact_read_rpc_present=false`, `contact_update_rpc_present=false`, `migration_head=20261020044145`.

The source migration remains unchanged. No production SQL write, schema change, migration replay, permission change, or deployment occurred. The API calls and migration file therefore do not currently have hosted application/API/SQL parity.

## Application compatibility and exact-story checks

- `OrganizationEmployeeDirectory` remains permission-gated by `employees.manage` and retains its current contact form, dialog, focus behavior, branding, Poppins typography, and English/Bengali layout.
- `PGRST202` from either contact RPC shows a localized, accessible administrator message. A missing read RPC leaves no contact values or edit action available. A missing update RPC keeps the entered draft and shows no success message.
- Browser simulation markers: `HR01-06_PGRST202_CONTACT_READ_SAFE_BROWSER_PASS` and `HR01-06_PGRST202_CONTACT_UPDATE_SAFE_BROWSER_PASS`. These are compatibility evidence from a disposable local Auth/Postgres/browser journey, not a production API call or story certification.
- `HR01-02_CONTACT_ONLY_UPDATE_SCOPE_BROWSER_PASS` and the isolated SQL check show the current live editor changes only the nine allowlisted contact fields. Employee identity, organization placement, lifecycle fields, and Auth identity remain protected from direct updates. This is partial coverage of the broad “update employee records” story.
- `tests/contracts/hr01-production-compatibility.test.mjs` ties the behavior and limits to exact canonical story IDs. HR01-01 and HR01-05 remain `NOT_CLASSIFIED`: the local-only prototype employee creator is not a live HR create journey; the Main app's separate preboarding activation was not independently mapped to HR01-01 or retested in this round; and no HR employee employment-history journey/approved contract is evidenced.
- HR01-03 and HR01-04 retain their earlier disposable evidence; they do not become hosted-certified through this change. HR01-06/07/08 remain partial. No bulk write or duplicate-person behavior is inferred.

## API/security collaboration and WS05 release readiness

WS02's open draft [PR #39 — HRIS Production API and Security Acceptance](https://github.com/shihab-tech04/HRIS-v2/pull/39) records a signed-in Super Admin read-only session and a passing two-tenant disposable API/RLS suite. It also records that production has one active tenant membership, no independent HR/Admin or available employee session, no production cross-tenant test, and no anonymous HTTP runtime rejection. Its production result is **PARTIAL / NOT ACCEPTED**. These limits match this workstream's catalog-only findings; disposable evidence is not substituted for hosted acceptance.

**WS05 release gate:** hold HR01-02/06 hosted acceptance until the migration/API owner resolves whether the existing source migration should be delivered through the controlled migration workstream, then verify both function signatures and signed-in `employees.manage` allow/deny, foreign-tenant denial, audit redaction, and anonymous HTTP denial against the deployed schema. Keep the contact editor's new safe failure behavior. Production cross-tenant release acceptance additionally needs a second approved production tenant and test identities; do not create them from WS01. WS02's broader release blockers remain listed in PR #39. No merge to `main` or deployment was requested or performed.
