# Executed release checkpoint — 20 October 2026 UTC

Production status: NOT APPLIED. Phase 03/04 hosted acceptance NOT PASSED.
Target: oslgwxaqfbteqtwqvdzs / qdcgrdntvspjsdszuzmy.
Last confirmed production head: 20261019100443; 114 migration rows. No transition advisory lock observed.

## Corrected package evidence
Package SHA-256 fa390e603bb08ad2417e11d627304cce2197ad003aa44c4f097cc7ea1dcf82ed, 228160 bytes.
[Corrected disposable run 39369561233](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39369561233) SUCCEEDED:
- 336 contract tests.
- 56 browser tests.
- 367/367 local Auth/RLS checks, zero failed.
- 26/26 local catalog parity.
- Corrected package rollback/fingerprint rehearsal PASSED with learning helper removed before deployment.
- Disposable security advisor: No issues found.

[Hosted-shaped PostgreSQL 17 run 39370270132](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39370270132) SUCCEEDED:
1. Failed first-install transaction fully rolls back schema/functions/policies/Auth/admin/membership/grant fingerprints.
2. Preflight refuses a second-administrator tenant membership with no partial installation.
3. First install from production-derived public table columns/types/defaults/generated expressions/PK/unique/check constraints reaches 26/26 parity; missing helper restored with expected ACL and null-tenant rejection.
4. Replay reaches 26/26 parity and preserves one Super Admin / unassigned second administrator.

The hosted-shaped baseline uses synthetic identities and minimal local Auth/Storage scaffolding. Existing public foreign keys are not cloned into that fixture; new package foreign keys are exercised. It is not a production-data clone or hosted API acceptance.

## Additional executions and observed failure
Documentation commits initially retriggered the full workflow. Triggers now target executable package files only.
Runs 39369666722 and 39369668995 also succeeded on the same executable package.
Duplicate run 39369671872 reached 366/367: its employee-referral browser subprocess failed to start a local Vite server (exit 1), before that browser journey. This infrastructure failure is preserved, not counted as a full pass. It did not report a migration SQL or RLS assertion failure. The exact server-start cause is not established. No application files were changed.
Earlier first-install fixture attempts failed because the fixture created table defaults before synesis_tenant_id and represented stored generated expressions as defaults; the fixture was corrected. Passing run 39370270132 supersedes those fixture setup failures.

## Recovery evidence
Exact nine pre-change affected function definitions/owners/ACLs are in prechange-functions.json.
Pre-change policies and catalog/grants metadata are retained in production-catalog-20261020.json.
Atomic rollback and protected topology were actually exercised in disposable PostgreSQL 17.
After a committed release, recovery is a reviewed forward corrective migration; do not destructively drop populated tables, fabricate history or restore legacy authorization wholesale.

## Remaining release boundary
A fresh real reviewed apply_migration submission has not yet been made in this checkpoint.
Existing CLI route is not verified: prior credential preflight was empty.
Hosted Gate B actually executed against production: 0/26.
Signed-in hosted API/tenant isolation acceptance is NOT EXECUTED. Existing connector reads are not proof of a separately authenticated hosted test client.
No frontend deployment is authorized by this database checkpoint.
