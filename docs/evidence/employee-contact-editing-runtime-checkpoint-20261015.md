# Employee Contact Editing — Runtime Acceptance Checkpoint

**Date:** 2026-10-15 Asia/Dhaka  
**Branch:** `codex/recovery-checkpoint-20261012`  
**Previous checkpoint:** `6f7700dc7e6eba90c3652883a1aa8795a9e9c476`  
**Scope:** Phase 05 employee contact-only editing and its isolated Auth/Postgres/browser acceptance.

## Source changes since the previous checkpoint

- `tests/sql/isolated-auth/run-employee-contact-editing.mjs`: added a loopback-only Docker host override and Colima SSH Docker execution so the disposable test runner can reach its local VM; added bounded, sanitized diagnostics for invalid Postgres JSON output.
- `tests/contracts/employee-directory.test.mjs`: added assertions for the loopback restrictions and Colima execution path.
- No employee application, migration, production data, or permission source was changed in this checkpoint.

## Verification

- `npm run check`: **PASS** — TypeScript passed, contract suite **155/155 PASS**, and Vite production build passed. Vite emitted its existing non-failing large-chunk warning.
- Focused employee-directory contracts: **6/6 PASS**.
- `node --check` for both isolated contact runner files: **2/2 PASS**.
- `git diff --check`: **PASS**.
- Latest isolated Auth/Postgres contact runner: **2/6 PASS, 4/6 FAIL**. The two passes were active-tenant permission/read isolation and the contact-only backend update/validation/audit checks.

### Isolated-run failures

1. The combined inactive-membership/inactive-tenant assertion failed. Inactive membership and inactive-tenant write returned `42501`; the inactive-tenant read response had no error code, so that read assertion is unresolved.
2. The real browser journey did not recover the contact details after the injected first `503`; `employee-a@hris.test` was not visible within 30 seconds at `run-employee-directory-browser.mjs:319`.
3. One of seven test-created Auth-user deletions failed, and the runner's cleanup verification reported one remaining Auth user. The test workdir had passed an empty-Auth preflight before this run. The remaining identity was `manager-a@hris.test` (`3c03436f-ad88-48d6-ab24-7abe482e8c0d`), created by this run. A later cleanup attempt could not be confirmed after its local process session detached.
4. The related browser persistence assertion therefore did not pass.

## Runtime limitation

At checkpoint time, Colima profile `hris-acceptance` was not running and `colima list` reported it as `Broken`. The existing environment was not reset. Starting this VM was attempted only through the normal local command and failed because the sandbox could not write its configuration outside the workspace. The escalated start request was rejected by automatic review because it conflicts with the instruction not to restart the existing environment. No workaround was attempted.

This runtime boundary leaves the synthetic Auth cleanup status unverified. No production endpoint, data, permissions, paid service, `main` branch, or deployment was touched.

## Status and next action

The contact-only implementation and its server-side permission, field allowlist, validation, direct-write denial, persistence, and audit checks remain implemented. Phase 05 contact editing is **not fully accepted** because the real local Auth/browser journey and final synthetic Auth cleanup verification remain incomplete.

To finish acceptance, resume the existing local `hris-acceptance` runtime (without resetting its database), confirm/delete only the test-created identity above, and rerun the guarded real Auth/Postgres desktop/mobile journey. The source ZIP remains deferred until Auth/browser acceptance, as previously requested. No production deployment is approved.
