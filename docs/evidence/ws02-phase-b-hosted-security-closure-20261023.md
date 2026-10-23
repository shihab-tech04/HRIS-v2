# WS02 Phase B — replacement-hosted security closure, WS05 handoff
23 October 2026. **HOSTED_SECURITY=BLOCKED**. This is an exact-target **read-only** comparison package; it does not authorize or execute hosted changes.

## Reference heads and source identity

- WS02 owner PR #50 was `def8b9c562bf416c05c4bd2d3d2e76812c160bd6` at the comparison. The two new read-only check files are subsequently committed to this same branch. No production SQL/API source changed.
- WS05 Main PR #66: `aa6a5f7399fc5ec1a319a2c922c86fe8ccd225d4`; Candidate PR #12: `0c15cb5c5fe6cabefa45ff37b394184faeb3e5a7`. Refresh before execution.
- All four reviewed migration files **match byte-for-byte on WS02/WS05**, and are already present in WS05:
  - `supabase/migrations/20261016171104_employee_family_tenant_scoped_read.sql` — Git blob `38fde8db229bfd337cc00e841d9aabf0640e36dc`
  - `supabase/migrations/20261021060748_employee_addresses_tenant_read_guard.sql` — `bd6d7a17db3bbf0ba9b03648b4e9e8dabe4b6568`
  - `supabase/migrations/20261021084635_leave_types_authenticated_read_only_acl.sql` — `fd39520646e0b409d24c0cbfd779c626fe68ab4d`
  - `supabase/migrations/20261023130800_hris_private_storage_tenant_read_guard.sql` — `4f5b1d8db5510de1e63b7824c8ae600f2a757b2a`
- Jobs `20261022153000_hris_jobs_authenticated_tenant_read.sql` — `972d0db00b69789d17d7e2376d540db21318deb8` — **DO NOT REPLAY** based on absent source-version entry. Equivalent guarded DDL is already deployed under clone-specific history.
- `tests/contracts/employee-documents-tenant-read.test.mjs` `d467df594986d1638059a7e418c31e87ef3e2f93`; hostile leave overgrant `tests/sql/isolated-auth/overgrant-leave-types-for-hosted-parity.sql` `20c3c9b3ef069cf77b5d13550bf7074d227fa2a5` are byte-identical on both release/source lines.
- **Do not overwrite** WS05's integrated `tests/sql/isolated-auth/run-local.mjs` (Git blob `07d86d01d3dde4523e3c073365cd6acf5533c766`) with the divergent WS02 runner (`703558a7b5aefd601ab2d448443313da33ccf5fe`). Both have accepted retained-document scenarios.

## Read-only target verification (actually executed)

Replacement Supabase `xfuxnljfrgvusbrpvxpa`, PostgreSQL 17.11, 110 cloned migration entries, migration head `20261022142012`; 1 Auth user, 1 tenant, 0 memberships, 1 active protected Super Admin, 0 Storage objects; no isolated hosted QA branch. Original Supabase is out of scope and untouched.

Execute `tests/sql/hosted-parity/phase-b-target-preflight.sql` by SQL Editor/read-only query against the **intended replacement project only**. All **15/15 before checks passed** as observed. Any FAIL or drift on the release date is a **STOP** requiring a fresh comparison and WS05 approval. The script intentionally pins this particular target **before** migrations, and will no longer pass once a migration is deployed.

Execute `tests/sql/hosted-parity/phase-b-target-postconditions.sql` after each approved source mutation and again at completion. Currently **5/14** are installed, **9/14** not installed (Storage tenant resolver and restrictive read policies, tenant-sensitive address/family functions/guards, leave ACL). This query intentionally fails before the rollout. Even **14/14 is structural parity only, not Auth-certified hosted tenant acceptance**.

### Required target-specific migration sequence (WS05 only)

0. **HARD GATE:** independent security approval and protected release authorization; encrypted, recoverable target database/Auth/storage/ledger snapshot **outside GitHub**, checksum verification and independent restore test; exact snapshot of `pg_policy`, `pg_proc`, grant ACLs, functions, bucket metadata and objects. Protected original database untouched. Do not seed hosted QA identities.
1. If target precondition matches, run the **already-reviewed** family migration from its exact blob. Transactional migration includes schema prerequisite checks and replaces only its scoped policies/helpers.
2. Run the reviewed address migration, after independently comparing the current admin/self predicates and ensuring any additional permissive read policy will be intersected by the new restrictive guard.
3. Run the reviewed leave-types ACL migration: remove `PUBLIC` and `anon` table grants; maintain authenticated SELECT with RLS, deny direct client writes.
4. Run the reviewed private Storage migration last, after verifying three buckets remain private, path contracts match and no other policy has changed. New restrictive SELECT intersects other permissive rules; owner and same-tenant reviewers are admitted only via the requested object's actual tenant and approved business linkage. It retires the superseded restrictive owner-only guard *in the same transaction* so legitimate retained-document staff reviews continue.
5. Run the postcondition SQL and independently inspect full installed definitions, `pg_get_functiondef`, `pg_policies`, `has_table_privilege` and `has_function_privilege`. Stop on any unexpected deviation; do **not** fabricate/insert old source-version history entries. WS05 alone reconciles version provenance when DDL and reviews agree.
6. Verify production-equivalent two-tenant acceptance with **authorized isolated QA** and real GoTrue sessions/JWT + PostgREST/Storage requests before declaring release. Two independent synthetic tenant identities/memberships, owner/manager/recruiter permissions, cross-tenant negative reads/writes, unauthorized RPCs, signed-link issuance, inactive/revoked sessions, historical document access, candidate signup and Super Admin exclusivity must be tested. Never use actual personnel data. Hosting this QA branch may incur fees: secure approval before creating paid infrastructure.
7. Only after all gates pass may WS05 authorize the target migration/cutover. Recheck Main/Candidate shared endpoint/publishable-key routing; do not expose service role in browser builds.

### Recovery and signed-link limitations

Before COMMIT, any failed check must abort the migration transaction; the migration cannot be considered applied. After COMMIT, a simple `ROLLBACK` does **not** undo DDL. Restoration requires the independently tested pre-release encrypted snapshot, synchronized Auth, grants, policies, SQL ledger, audit and Storage objects.

If any live private-file leak appears, WS05 must **fail closed**, e.g. install a restrictive authenticated SELECT deny for the three private buckets before a verified secure restore; do **not** simply drop the tenant guard. Exact emergency deny SQL and important limitations are recorded in [WS02 PR #50 emergency runbook](https://github.com/shihab-tech04/HRIS-v2/pull/50#issuecomment-6360365094). Already issued signed links are bearer URLs and may remain valid until their expiry even after SELECT/issuance restrictions change. Treat this separately in incident response.

## Actual, approved QA evidence

- WS02 disposable GoTrue/PostgreSQL 17/Storage HTTP/PostgREST/browser: [39921357492](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39921357492) **393/393 PASS**, Phase04 **26/26 PASS**.
- WS05 integrated (different runner, same approved SQL): [39922517150](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39922517150) **392/392 PASS**, Phase04 **26/26 PASS**.
- Positive: own-tenant candidate/employee/attendance evidence and authorized same-tenant reviewer/manager reads, including retained former-employee and disabled candidate files.
- Negative: foreign tenant and unrelated employee/candidate document reads, anonymous access, unauthorized signed URL issuance, inactive membership, cross-tenant RPC, direct table ACL, and sole Super Admin escalation paths in disposable Auth acceptance. No hosted negative test can honestly be reported while hosted has 1 tenant, 0 memberships and 0 objects.
- Existing hosted security advisors include a deliberate anonymous public-jobs source review and compromised-password protection warning; do not disable public recruitment or grant arbitrary table privileges just to clear warnings. Enable leaked-password protection only through an authorized Auth configuration review.

**Hosted result as of this evidence:** 15/15 baseline preflight, 5/14 postconditions, no hosted migration, no actual hosted A/B JWT acceptance. **HOSTED_SECURITY=BLOCKED.**
