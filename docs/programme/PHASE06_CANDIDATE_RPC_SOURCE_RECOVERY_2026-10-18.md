# Phase 06 — Candidate requested-document RPC source recovery

**Source parity blocker: RESOLVED. Full recruitment and Candidate integration phase: NOT COMPLETE.** This is a narrow source-recovery improvement, not a new hosted deployment or a newly accepted canonical story.

The Main+Candidate integration scanner initially identified one callable Candidate API name with no tracked SQL body: `candidate_submit_requested_document`. A read-only PostgreSQL `pg_get_functiondef` inspection of the intended HRIS Supabase project on 18 October 2026 established the following **actual deployed contract**:

- Name/signature: `public.candidate_submit_requested_document(p_request_id uuid, p_file_name text, p_file_path text)`; returns `jsonb`.
- `SECURITY DEFINER`; authenticated execute granted; anonymous execute denied.
- Requires live Auth session, candidate-UID-leading private Storage path, an existing candidate-documents storage object, an owned application, a pending document request and an unexpired due date. Updates submitted file name/path/time and returns submission status without exposing the document body.
- Hosted `storage.objects` insert/select/delete/update policies require a candidate-owned path prefix; insert additionally requires an active candidate profile.

The prior Candidate prose under `docs/INTEGRATION_CONTRACT.md` described a `p_payload` parameter, but actual `HRIS-Candidate-v2/src/lib/api.ts` uses the **deployed** three-argument signature and uploads to the `candidate-documents` private bucket before invoking the RPC. The new Main migration `supabase/migrations/20261018120000_candidate_requested_document_source_recovery.sql` restores the already-deployed function definition and its explicit grants into version control. It does **not** change Candidate application code or hosted SQL.

`tests/contracts/candidate-document-source-recovery.test.mjs` verifies the function's signature, owner/session/status/storage checks, role grants and actual caller parameter shape. The Phase 01 integration inventory now reports **119/126 versioned RPC names, 7/126 staged-only platform tenant RPCs, 0 source-unresolved names**.

## Boundaries before accepting any recruitment stories

1. This stored SQL is a recovery copy of the observed deployed body, not a safe-to-apply migration against arbitrary divergent hosted histories. Compare semantic object definitions/dependencies before any final SQL promotion.
2. Rehearse it with real disposable Auth/Postgres/Storage: positive owner upload, another candidate's request or path, missing storage object, expired request, unauthenticated access, retry/duplicate write and cleanup on RPC failure. The managed workspace has no disposable Supabase/Docker CLI; this new file has **not yet been database-executed**.
3. Review `SECURITY DEFINER` search path and owner-scoped storage access as part of the Phase 19 function audit; do not mark the function safe solely because its body and grants were recovered.
4. The full Phase 06 scope is 226 original stories in 33 modules. At present 12 exact CA14 stories have existing independently recorded passing disposable evidence, 214 remain unclassified. This source recovery does not promote another story or establish hosted Candidate sign-in/application acceptance.

No production Auth, database, permissions, Candidate source, GitHub branch or deployed site changed for this recovery.
