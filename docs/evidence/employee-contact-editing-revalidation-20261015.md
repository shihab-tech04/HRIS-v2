# Employee Contact Editing — Local Revalidation

**Date:** 2026-10-15 Asia/Dhaka  
**Source checkpoint:** Main HRIS `d0ce759d4e0722fb4df6dcb8417ec30066cd197e`  
**Scope:** Phase 05 contact-only editing; no product source was changed by this revalidation.

## Result

The guarded acceptance runner was executed against the disposable workdir `/private/tmp/synesis-hris-contact-20261015-clean`, using local Auth/Postgres only. Its preflight confirmed that the workdir contained the recognized synthetic fixture and no Auth users or storage objects. The runner completed **4/6 assertions; 2 failed**.

### Passed (4)

- Contact-only updates reject lifecycle and organization fields, invalid/overlong values, duplicate official email, direct table writes, unauthorized writers, cross-tenant writes, and anonymous writes; the allowed edit persisted and audit details contained changed field names only.
- Inactive memberships and inactive tenants deny contact reads and writes.
- All seven synthetic Auth identities created by this run were deleted.
- Final cleanup verification found **zero Auth users** in the disposable project.

### Failed (2)

- The active-tenant read assertion failed for the first manager response: the recorded detail was `manager:"allowed"`, while tenant B returned its expected email and all denied/cross-tenant cases returned their expected denials. The runner did not record the first response's message/data keys, so this does not establish a permission defect or a passing read.
- The real browser journey timed out after 30 seconds on the sign-in screen. It observed no Auth response or Auth request failure, and the contact editor was not reached. The browser assertion therefore remains **NOT ACCEPTED**.

## Environment evidence and limits

- Before the run, the disposable Auth and Postgres containers reported healthy.
- During runner initialization Supabase CLI printed a `Stopped services` notice for optional local services.
- After the run, `http://127.0.0.1:59621/auth/v1/health` was unreachable, while a read-only container inspection still showed the Auth and database containers running/healthy and REST running. This points to local API forwarding/gateway availability as a likely test-environment cause; the exact transport failure is not yet isolated.
- The runner restored the synthetic employee contact values and removed the test audit row. No production URL, production record, permission, or paid service was used or changed.
- The implementation is not being marked fully accepted until the read payload and Auth/browser journey pass. The earlier **5/6** revalidation remains preserved separately.

## Next executable action

Diagnose the disposable local API host-port/gateway path and capture the read RPC's sanitized error code/message and response shape, without restarting or mutating production. Then rerun the guarded browser journey only after the endpoint is healthy.
