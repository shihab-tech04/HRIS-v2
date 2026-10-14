# Candidate-to-employee activation checkpoint — 2026-10-14

**Workflow status: implemented and verified in the isolated local environment.** The broader HRIS product remains under development and is not a deployment checkpoint.

## Verified journey

The local Auth/Postgres/browser journey completed offer acceptance, four-step preboarding, HR verification, employee activation, and employee workspace entry. Activation preserved the candidate's Auth user ID, persisted the application legal name, employee number and confirmed joining date, recorded the verifier and verification time, advanced the application to hired, and returned the same employee on retry.

- Auth, database, RLS, and browser acceptance: **PASS=188, FAIL=0**, mobile and desktop.
- Five unauthorized activation callers were denied: recruitment manager, recruitment viewer, other-tenant manager, candidate, and anonymous caller.
- Direct employee insertion was denied. The activated employee could read only their own tenant, not the other test tenant.
- The original candidate Auth session resolved to the employee navigation and Personal Dashboard after activation.
- `npm run test:contracts` in Main: **143 passed, 0 failed**.
- `npm run test:routes` in Candidate: **20 passed, 0 failed**.
- Candidate `npm run lint`: PASS.
- `node --check tests/candidate-application-local-e2e.mjs`: PASS.
- `git diff --check`: PASS in both repositories.
- Main `npm run build`: PASS for the current application source at checkpoint `b0f5491`; the build emitted the existing non-failing large-chunk warning. No Main application code changed in this verification update.

The Auth/Postgres/browser run used synthetic users in the fresh, disposable local Supabase project `synesis-candidate-c1-auth-20261014-fresh` on the `colima-hris-acceptance` Docker context. Its configured API and database ports were 58121 and 58122. The runner cleaned its own synthetic users and records. Existing Auth entries outside this fresh test project were not inspected or removed.

The test fixture now mirrors the production tenant visibility needed by employee managers and newly activated employees. The employee workspace assertion checks the role/navigation transition and persisted Auth identity; this focused Candidate fixture does not claim acceptance of the separate employee dashboard summary-data RPC.

## Earlier test-start failures and resolution

The original local project ports were already bound by SSH forwards from another local profile. The fresh disposable project was moved to unused ports; no other profile's Auth data was inspected or changed. Earlier browser assertion failures came from a test-only tenant policy that omitted `employees.manage` and linked employees, plus comparisons against the candidate profile display name instead of the persisted application legal name. The fixture and assertions were aligned to the existing source contracts; no production SQL or permissions were changed.

## Safety state

No production data or permissions were changed, no paid service was activated, and no deployment was made. The workflow is an isolated verified checkpoint, not approval to deploy the product.
