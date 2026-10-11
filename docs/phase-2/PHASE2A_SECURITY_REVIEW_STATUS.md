# HRIS-v2 Phase 2A: Security review status

Reviewed repository at main commit 12e91872 and active Supabase hrmis-saas.

## Verified
- Database has 89 public tables, one active tenant and zero active tenant memberships.
- Existing Phase 1 read-policy hardening remains active.
- Tenant provisioning is a staged contract, not a working production feature.
- Original first-admin enrollment RLS accepts a signed-in first-member user with a qualifying corporate email domain. It does not independently require platform super-admin status.
- Review PR #7 stages an ADDITIONAL restrictive policy. It has not been applied to production.

## Required acceptance before activating tenants
1. Run staged SQL in an isolated PostgreSQL/Supabase test environment and record positive/negative results.
2. Test original first-admin enrollment with active platform super-admin, ordinary same-domain account, anonymous caller and revoked session.
3. Verify the staging provisioning transaction, unique constraints, audit row, membership role conflict and last-admin protection.
4. Review existing privileged RPCs for correct tenant isolation; never grant broad global roles to other tenants.
5. Only after independent evidence, approve a migration and verify policy read-back.
6. Test actual authenticated browser and mobile journeys; static contract checks do not certify database enforcement.

**Status: BLOCKED for production enablement.** No production migrations or identities changed. Applicant Portal remains an independent future repository.
