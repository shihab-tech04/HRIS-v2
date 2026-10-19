# Synesis HRIS 360° — phase-by-phase evidence dashboard (2026-10-18)

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
| 03 | Tenant platform | 2 | 7 | 0 | Previously staged/tested; live rollout blocked |
| 04 | Auth, permissions, RLS | 6 | 32 | 0 | Hosted Gate B 0/25 blocked |
| 05 | People and organization | 7 | 57 | 13 | Story acceptance open; three employee-document business contracts absent |
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
| **Total** | **22 phases** | **153** | **1,047** | **27** | **0 hosted story acceptances certified** |

**Important accounting:** the 27 are specific IDs connected to previously passing disposable tests; they are not release certifications. A separate historical checkpoint claimed 82 verified, but did **not preserve all their IDs**, so the exact, deduplicated intersection is unknown and **27 + 82 is not a valid progress figure**. Currently there are 13 exact blocked requirements, 4 partial and 1,003 not individually classified. `NOT_CLASSIFIED` is **not** a finding that the feature is absent; it means acceptance traceability is insufficient.

Phases 00, 01, 02, 18, 20 and 21 are programme/cross-cutting work, therefore no exclusive source modules were assigned to them; **zero stories in their column does not mean zero work or approval**. The source's own phase fields remain untouched.

## Blockers that cannot be declared solved by code inventory

1. **Hosted permission and schema divergence:** the actual database's migration history is not name-aligned with the versioned source; 25/25 Gate B predicates are not yet satisfied. The `notices` policy lacks the tenant membership guard found in newer source. A schema-only provenance diff, isolated Auth/RLS negative tests, backup plan, and an ordered migration rehearsal are needed before production change. See [Phases 03–04](PHASE03_04_TENANT_SECURITY_READINESS_2026-10-18.md).
2. **Seven platform-only staged RPCs:** the tenant provisioning source is still intentionally staged, with no final hosted authorization. Passing prior disposable tests does not authorize tenant activation.
3. **Missing product policy:** E03-02/E03-03/E03-06 require the HR-allowed document classes, replacement/verification/version behavior, and reminder schedule; payroll calculation/pay-run authority and expense approval tiers also require their owners' decisions. We will not silently invent HR, compensation or finance policy.
4. **Full-app UX and release acceptance:** the inspected Figma file did not provide full Candidate or platform-Super-Admin references. The two codebases still need full EN/BN, keyboard/screen-reader, mobile/desktop, direct-denial, persistence, cross-system and backup/rollback checks on the final head. No GitHub or hosting deployment has been made in this execution.

The next safe engineering sequence remains: finish source-backed tests and implementation for independently specified workflows; decide the outstanding HR/finance/leave contracts; establish and exercise a disposable security-parity environment; re-run and evidence all 1,047 canonical requirements; only then perform an authorized final dual-application publication. **This dashboard is a truthful checkpoint, not a 22-phase completion certificate.**
