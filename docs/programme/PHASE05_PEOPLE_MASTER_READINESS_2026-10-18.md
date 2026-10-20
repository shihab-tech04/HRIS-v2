# Phase 05 — Organization, people and employee master-data readiness

**State: PARTIAL — 17/57 individually evidenced in previously passing disposable journeys; 0/57 claimed hosted acceptance.** The 57 exact requirements are the original canonical E02, E03, E04, E37, HR01, HR03 and SA06 stories. Run `node scripts/phase-readiness.mjs 05 --json` to retrieve each verbatim requirement, ID, current classification and evidence location.

| Source-linked result | Exact story IDs | Count |
| --- | --- | ---: |
| Disposable Auth/Postgres/browser evidence | E02-01/03/08/12/17; E03-01/04/05/07/08; E04-01/02/03/04; E37-01/05; HR01-03 | 17 |
| Explicitly blocked on missing/unauthorized HR contract | E03-02, E03-03, E03-06 | 3 |
| Partial evidence only | E04-05, E37-02/03/04 | 4 |
| No source-ID acceptance classification yet | All remaining stories in these seven modules | 33 |

**Current source-linked evidence:** E02-01, E02-08 and E02-12 passed the disposable Auth/Postgres/browser run [39371994771](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39371994771) at `6ff29e898aef54c2779e44cfdd5e465c79e6c11c`. HR01-03 ("As HR, I want to search and filter the workforce.") passed the permission-scoped employee-directory journey [39373694520](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39373694520) at `81eb677847fc19007cfb790dfc8cf7126c4c759d`, using the tenant `employees.view` permission, exact name/department/status/team filters, negative access checks, and EN/BN mobile/desktop browser assertions. The evidence is tied to the immutable canonical matrix; runtime and story mappings are in the corresponding `tests/sql/isolated-auth/` and `tests/contracts/` files. The overlay records **38** individually identified passing story IDs across all modules. The historical aggregate's 82 IDs remain unreconciled; no deduplicated total is claimed. Hosted acceptance remains **0/57**.

The three blocked document stories need actual business/technical rules before mutating HR records:

- **E03-02 upload:** which document categories and accepted evidence formats HR permits, who authorizes them, and whether employee-supplied material requires mandatory verification.
- **E03-03 replacement:** version/expiry semantics, whether the previous verified document remains visible and auditable, and which role can approve a replacement.
- **E03-06 reminders:** lead time, recipients, channels, frequency and opt-out/retention rules. No notification schedule may be invented.

The partial E04-05 employment-inactive behavior and E37-02/03/04 directory filters/contact/reporting projection need actual current-schema behavior and role grants re-tested. Other unclassified E02/HR01/HR03/SA06 features need source-linked acceptance, and several employee-master CRUD functions require more than existing read-only projections.

**Next allowed actions:** verify source-backed, policy-neutral self-service and HR list/detail cases first; implement changes only under confirmed permissions and with synthetic two-tenant negative tests. Do not enable bulk sensitive HR writes or guess lifecycle rules. Hosted Gate B is still blocked for the newer documents, profile and directory endpoints. Phase 05 is not accepted as complete.
