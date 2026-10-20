# Synesis HRIS 360° — phase-by-phase evidence dashboard (2026-10-20)

This checkpoint covers **all 22 operational phases 00–21** against the recovered immutable 1,047-story / 153-module source. Recreate the authoritative count/state view with:

```bash
node scripts/programme-phase-dashboard.mjs
node scripts/programme-phase-dashboard.mjs --json
```

## Readiness and exact-ID acceptance

| Phase | Scope | Modules | Stories | Prior exact-ID disposable evidence | Gate |
|---|---|---:|---:|---:|---|
| 00 | Scope and canonical inventory | — | — | — | Source/scope gate passed |
| 01 | Source integration architecture | — | — | — | Blueprint gate passed; live parity open |
| 02 | Design tokens and foundation | — | — | — | Foundation gate passed; app-wide visual parity open |
| 03 | Tenant platform | 2 | 7 | 7 | Production migration gates passed; signed-in tenant/API acceptance pending |
| 04 | Auth, permissions, RLS | 6 | 32 | 0 | Hosted migrations 26/26; API and tenant-isolation acceptance pending |
| 05 | People and organization | 7 | 57 | 18 | Story acceptance open; 5 partial and three employee-document business contracts absent |
| 06 | Recruiting and Candidate | 33 | 226 | 12 | Candidate document RPC source recovered; full journey still open |
| 07 | Onboarding and conversion | 6 | 46 | 0 | Historic tested journey, individual acceptance open |
| 08 | Attendance and time | 16 | 115 | 2 | Further policy/acceptance open |
| 09 | Leave and absence | 8 | 65 | 0 | Entitlement/accrual/carry-over/cancellation business rules open |
| 10 | Projects and allocation | 2 | 8 | 0 | Individual acceptance open |
| 11 | Performance | 15 | 105 | 0 | Appraisal lifecycle and acceptance open |
| 12 | Learning and career | 6 | 38 | 0 | Individual acceptance open |
| 13 | Payroll, compensation, benefits | 12 | 80 | 0 | Pay-run rules and decision authority unapproved |
| 14 | Expenses and travel | 2 | 22 | 0 | Expense decision roles and limits unapproved |
| 15 | Employee lifecycle/services | 23 | 149 | 0 | Individual acceptance open |
| 16 | Communications and tasks | 6 | 31 | 0 | Reminder/delivery rules and acceptance open |
| 17 | Dashboards and reporting | 8 | 61 | 0 | Individual acceptance open |
| 18 | Mobile, BN/EN, accessibility and Figma | — | — | — | Cross-cutting all-route gate open |
| 19 | Cross-system migration/security | 1 | 5 | 0 | Hosted provenance and security certification blocked |
| 20 | Story-by-story acceptance | — | — | — | Full exact-ID recertification open |
| 21 | Final backup, GitHub and dual deployment | — | — | — | Release not authorized |
| **Total** | **22 phases** | **153** | **1,047** | **39** | **0 hosted story acceptances certified** |

**Important accounting:** the 39 are specific IDs connected to passing disposable tests; they are not release certifications. A separate historical checkpoint claimed 82 verified, but did **not preserve all their IDs**, so the exact, deduplicated intersection is unknown and **39 + 82 is not a valid progress figure**. Currently there are 13 exact blocked requirements, 5 partial and 990 not individually classified. `NOT_CLASSIFIED` is **not** a finding that the feature is absent; it means acceptance traceability is insufficient.

Phases 00, 01, 02, 18, 20 and 21 are programme/cross-cutting work, therefore no exclusive source modules were assigned to them; **zero stories in their column does not mean zero work or approval**. The source's own phase fields remain untouched.

## Blockers that cannot be declared solved by code inventory

1. **Phase 03/04 production migration prerequisite:** complete on Supabase project `oslgwxaqfbteqtwqvdzs` in organization `qdcgrdntvspjsdszuzmy`; the live ledger ends at `20261020044145`. The migration workstream reports hosted schema parity **26/26**, security checks **20/20**, and database-role rejection **9/9**; the application stream independently reran the read-only 26-check catalog probe and confirmed **26/26**. No migrations were reapplied by this application stream.
2. **Signed-in production API and tenant-isolation acceptance:** still pending. The live HRIS app currently presents its sign-in form in the connected browser, with no authorized QA session available to execute real Auth-to-PostgREST requests. No production test user or data was created or modified. The app release remains blocked until this acceptance is completed.
3. **Seven platform-only staged RPCs:** tenant provisioning source is still intentionally staged. Passing disposable tests and the hosted migration baseline do not authorize tenant activation or release of those RPCs.
4. **Missing product policy:** E03-02/E03-03/E03-06 require the HR-allowed document classes, replacement/verification/version behavior, and reminder schedule; payroll calculation/pay-run authority and expense approval tiers also require their owners' decisions. We will not silently invent HR, compensation or finance policy.
5. **Full-app UX and release acceptance:** the inspected Figma file did not provide full Candidate or platform-Super-Admin references. The two codebases still need full EN/BN, keyboard/screen-reader, mobile/desktop, direct-denial, persistence, cross-system and backup/rollback checks on the final head. No application deployment was made in this execution.

The next safe engineering sequence remains: finish source-backed tests and implementation for independently specified workflows; decide the outstanding HR/finance/leave contracts; establish and exercise a disposable security-parity environment; re-run and evidence all 1,047 canonical requirements; only then perform an authorized final dual-application publication. **This dashboard is a truthful checkpoint, not a 22-phase completion certificate.**
