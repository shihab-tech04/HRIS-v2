# Phase 00 — Source acquisition and programme reconciliation

**Gate:** PASS — source and programme scope. **Scope is not functional acceptance of Phases 01–21 or hosted deployment.**

## Exit requirements and evidence

| Exit criterion | Result | Evidence |
| --- | --- | --- |
| Exact immutable original requirements acquired | PASS | SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`, source 935,389 bytes |
| Every canonical requirement recoverable | PASS | 1,047 unique IDs, verbatim text and source line, 153 modules; no source statuses rewritten |
| Module-to-phase execution scope | PASS | 153/153 modules mapped to one *operational primary phase* for sequencing by `scripts/phase00-module-phases.mjs`; overlapping dependencies still need cross-phase testing |
| Source-linked evidence ledger exists | PASS | 25 individual IDs with historical passing disposable Auth/Postgres/browser evidence; 13 explicitly blocked IDs, 4 explicitly partial IDs recorded; all other IDs remain unclassified |
| Historical 82-story aggregate safely reconciled | PASS via quarantine | Previous 82-ID membership is missing. **It cannot be deduplicated or treated as 82 independently certified IDs.** Retain original figure for history only; Phase 20 will reverify every requirement against original text and build a new, deduplicated current count |
| Current branch/CI baseline preserved | PASS | Main development commit `445feeff8ec2eeadc09ccc2f2bac0fd7c39207b5` passed disposable Auth/Postgres/browser acceptance (run [39147470480](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39147470480)); Candidate development `e3cb9c178cbfb66eb611c640f885a13581b50f51` passed prior Candidate acceptance (run [39025809497](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39025809497)) |

The initial Phase 00 checkpoint independently evidenced 25 IDs. Phase 05 later recovered two additional exact IDs (`E02-03` and `E02-17`) with existing passing disposable runtime evidence, bringing the **current** individual evidence inventory to 27 without adding anything to the historical 82 aggregate. The canonical catalogue itself retains its original `phase: null` fields and `NOT TESTED` statuses. The operational execution assignment is deliberately a separate plan and **does not alter** the source or pretend that stories are implemented. Run:

```bash
node scripts/phase00-reconciliation.mjs
node scripts/phase00-reconciliation.mjs --json
node --test tests/contracts/phase00-reconciliation.test.mjs tests/contracts/story-acceptance-overlay.test.mjs
```

The JSON form exposes all 1,047 IDs, source text, source line, module, operational phase, exact test references, previously accepted disposable-only evidence, and open-story evidence. Entries without adequate evidence remain `NOT_YET_DETERMINED`. **No additional user stories were accepted merely by completing Phase 00.**

## Deferred to their actual phase gates

- Phase 01: architecture contracts and all inter-system route/data flows.
- Phases 03–19: implementation, tenant-scoped SQL/API parity, Auth/RLS and complete module journeys.
- Phase 20: fresh exact-ID acceptance of **every** story, with no recycling or double-counting of the old 82 aggregate.
- Phase 21: final integrated release, immutable verified bundle and single coordinated deployment.

Current hosted Gate B still fails 25/25 checks; its controlled resolution belongs to the relevant backend/security phases. No production DB, hosted sites, Candidate source or accepted UI were changed for Phase 00.
