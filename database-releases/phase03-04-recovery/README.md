# Phase 03/04 database handoff — 20 October 2026

**Production database dependencies deployed and verified. Overall Phase 03/04 application acceptance is not declared.**

## Verified production state
- Target hrmis-saas: oslgwxaqfbteqtwqvdzs; organization qdcgrdntvspjsdszuzmy.
- Current native migration head: **20261020044145**; history **116 rows**, baseline 114.
- Ordered native releases:
  1. 20261020043721 — phase03_phase04_hosted_compatibility_recovery_20261020.
  2. 20261020044145 — phase03_learning_context_authenticated_acl_20261020.
- Existing HRIS connector successfully applied both. No dashboard sign-in, organization switch, credential transfer, production execute_sql DDL or manual history insertion.
- Six required new tables exist with RLS; all 55 package function names exist.
- Exact stored SQL bytes/MD5 verified against package source.
- One active Super Admin and one active membership preserved; second administrator remains unassigned.
- hr_admin retains only organization.manage; legacy global administrator retains 45 grants.
- Sparse optional-module defaults remain unchanged; no module configuration was seeded.

## Executed tests
| Boundary | Passing / total |
| --- | --- |
| Hosted Gate B schema/API catalog parity | 26/26 |
| Hosted security/catalog/role preservation | 20/20 |
| Hosted anonymous and sessionless database-role rejection | 9/9 |
| Disposable real Auth/RLS | 367/367 |
| Disposable source contracts | 336/336 |
| Disposable standalone browser regression | 56/56 |
| Production-shaped first-install / rollback / topology / replay / ACL suites | 5/5 |

Auth/RLS/browser run: https://github.com/shihab-tech04/HRIS-v2/actions/runs/39369561233
First-install and follow-up ACL run: https://github.com/shihab-tech04/HRIS-v2/actions/runs/39370837800
One duplicate full run had a Vite-start infrastructure failure in the referral browser subprocess; this is retained in release-status.md and is not counted as a full pass.

## Source and receipt
Migration-only PR: https://github.com/shihab-tech04/HRIS-v2/pull/37
Branch: migration/phase03-04-recovery-20261020, based on checkpoint/phase03-hosted-transition-20261019.
Exact native migration exports are under supabase/migrations with their server-recorded versions.
Package, ordered source inventory, pre/post catalog, preserved overwritten function definitions, read-only test SQL and deployment-receipt.json are under database-releases/phase03-04-recovery.
Do not replay the old staged compatibility SQL or the already recorded migrations. Do not blindly push divergent historical source migrations.

## Corrections included
The compatibility package lacked hris_can_read_learning_catalog(uuid); the exact approved helper/ACL was included.
The new learning-context wrapper inherited PostgreSQL PUBLIC execution; a separately rehearsed tracked follow-up restored its authenticated/service-only ACL without changing its function body.
The fresh real connector operation succeeded; the earlier requestState failure did not recur. Its exact internal verification rejection cause remains unknown.

## Remaining acceptance and ownership
No migration-submission blocker or pending migration remains for this reviewed package.
Signed-in **production HTTP** journeys with the sole Super Admin, assigned tenant user and cross-tenant/unauthorized accounts were **not executed** here. Database-role tests are not those HTTP journeys.
The application owner should use the verified schema head, regenerate source contracts/types where needed, and complete those signed-in journeys before declaring Phase 03/04 accepted or publishing its UI.
Existing frontend/Figma work and PR #36 remain independent. No frontend was changed or deployed by this workstream.
Migration ownership is now at a completed checkpoint; coordinate the next production SQL owner before any further release.

## Advisor boundary
Production security advisor has no error-level findings. The newly introduced anonymous learning-wrapper warning is resolved.
Existing warnings include intentional anonymous public job listings, authenticated guarded SECURITY DEFINER RPCs, and leaked-password protection disabled. RPC-only protected tables intentionally have RLS without direct-table policies.
Remediation references:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Deployment order and recovery
Both migration files are already applied. Future environments must use the ordered native exports after reconciling their baseline. Never replay divergent historical migrations or manually alter history. The first migration is 228160 bytes, SHA-256 fa390e603bb08ad2417e11d627304cce2197ad003aa44c4f097cc7ea1dcf82ed; the ACL follow-up is 1077 bytes, stored MD5 add4d73bacabc008716109d22324319c. Both stored content identities were verified.

Atomic rollback, protected topology and replay were rehearsed. Pre-change function definitions and policy metadata are preserved. After commit use a reviewed forward corrective migration; do not drop populated tables, delete audit history or restore legacy authorization blindly. No frontend release is included.
