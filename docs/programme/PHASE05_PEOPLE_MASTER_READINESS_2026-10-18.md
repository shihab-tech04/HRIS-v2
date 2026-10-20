# Phase 05 — Organization, people and employee master-data readiness

**State: PARTIAL — 18/57 disposable-evidenced, 5/57 partial, 3/57 blocked on missing contracts; 0/57 claimed hosted acceptance.** The 57 exact requirements are the original canonical E02, E03, E04, E37, HR01, HR03 and SA06 stories. Run `node scripts/phase-readiness.mjs 05 --json` to retrieve each verbatim requirement, ID, current classification and evidence location.

| Source-linked result | Exact story IDs | Count |
| --- | --- | ---: |
| Disposable Auth/Postgres/browser evidence | E02-01/03/08/12/17; E03-01/04/05/07/08; E04-01/02/03/04; E37-01/05; HR01-03/04 | 18 |
| Explicitly blocked on missing/unauthorized HR contract | E03-02, E03-03, E03-06 | 3 |
| Partial evidence only | E04-05, E37-02/03/04, HR01-06 | 5 |
| No source-ID acceptance classification yet | All remaining stories in these seven modules | 31 |

**Current source-linked evidence:** E02-01, E02-08 and E02-12 passed the disposable Auth/Postgres/browser run [39371994771](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39371994771) at `6ff29e898aef54c2779e44cfdd5e465c79e6c11c`. HR01-03 ("As HR, I want to search and filter the workforce.") passed the permission-scoped employee-directory journey [39373694520](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39373694520) at `81eb677847fc19007cfb790dfc8cf7126c4c759d`. HR01-04 ("As HR, I want to see active, inactive, probation, notice, exited, and other configured statuses.") passed its tenant-configured option and per-status filter journey at commit `d22de6793784bf55b67f34fe00253289dc624772`, full run [39377300851](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39377300851): six values for Tenant A, Tenant B's unique status excluded, tenant/permission denials, and EN/BN browser checks at 375px/1280px. Details: `docs/evidence/hr01-employment-status-visibility-20261020.md`. The evidence is tied to the immutable canonical matrix; runtime and story mappings are in the corresponding `tests/sql/isolated-auth/` and `tests/contracts/` files. The overlay records **39** individually identified passing story IDs across all modules. The historical aggregate's 82 IDs remain unreconciled; no deduplicated total is claimed. Hosted acceptance remains **0/57**.

The three blocked document stories need actual business/technical rules before mutating HR records:

- **E03-02 upload:** which document categories and accepted evidence formats HR permits, who authorizes them, and whether employee-supplied material requires mandatory verification.
- **E03-03 replacement:** version/expiry semantics, whether the previous verified document remains visible and auditable, and which role can approve a replacement.
- **E03-06 reminders:** lead time, recipients, channels, frequency and opt-out/retention rules. No notification schedule may be invented.

**HR01-06 remains partial.** At commit `686eec7016ec831e9b679500f28f553b8f93b14f`, full disposable workflow [39378140222](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140222) verifies that all nine fields supported by the current contact-update RPC appear by field name in one audit event and that every changed contact value is excluded. The related E02-17 profile-approval journey also confirms a `field_key` audit and no `requested_value` key. The full workflow passed **342/342 contracts, 375/375 local Auth/RLS assertions, Phase 04 disposable parity 26/26**, and the production build; Phase 2A run [39378140175](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39378140175) passed. Other sensitive-data categories and hosted signed-in API behavior remain unverified. Details: `docs/evidence/hr01-sensitive-change-audit-partial-20261020.md`.

The partial E04-05 employment-inactive behavior and E37-02/03/04 directory filters/contact/reporting projection need actual current-schema behavior and role grants re-tested. Other unclassified E02/HR01/HR03/SA06 features need source-linked acceptance, and several employee-master CRUD functions require more than existing read-only projections.

**Next sequence:** continue HR01-06 from its expanded partial checkpoint by identifying other active sensitive-data mutation paths and validating their audit coverage under the approved API and SQL contracts. Keep HR01-06 partial until the full sensitive-data area is evidenced. Then continue the remaining Phase 05 stories in source order with synthetic two-tenant negative tests. Do not enable bulk sensitive HR writes or guess lifecycle rules. The hosted migration/schema gate has passed; signed-in production API acceptance for profile, directory and document endpoints remains pending. Phase 05 is not accepted as complete.
