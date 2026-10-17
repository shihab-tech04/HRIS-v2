# HRIS acceptance and canonical story snapshot — 2026-10-17

## Canonical source

The recovered catalogue is preserved verbatim at `docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json`. Its SHA-256 is `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520` (935,389 bytes; 1,047 stories; 153 modules). The source's own statuses and evidence fields remain unchanged.

## Resolution of the 325/335 regression

The initial development acceptance run [39003613417](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39003613417) passed 325 of 335 checks and failed 10. The failures had two root causes:

| Failed checks | Root cause | Verified correction |
| --- | --- | --- |
| Four E02 profile-request checks | The disposable runner omitted the latest employee-profile schema contract migration, so the request RPC referenced fields that did not exist in the isolated database (`42703`). Approval, history, audit assertions, and the browser flow then failed as downstream effects. | The isolated migration sequence now applies the schema contract. On the later run, E02 submission and history passed, approval persisted one field and one redacted audit event, duplicate decisions were rejected, and the EN/BN responsive browser journey passed. |
| Six E01/dashboard checks | The preceding learning-cancellation test left a shared synthetic session cancelled. The dashboard correctly excluded it because it had no active enrolled assignment; the first assertion aborted the shared browser script, causing five later dashboard checks to cascade-fail. | The fixture now restores the synthetic assignment to `enrolled` before the dashboard journey. The run confirmed enrolled count `1`, retained cancelled count `2`, and then passed the dashboard checks. No RLS rule or test expectation was weakened. |

The rerun on exact development commit `b27c627d912ddfedd6b560c7ac7fe8b5d066d31b` passed the expanded suite: [Main isolated acceptance run 39020230361](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39020230361) reports **358/358 Auth/Postgres/RLS assertions**, **293/293 contract tests**, and no failures. TypeScript, production-bundle, and standalone browser regression steps also passed. The 358-check suite includes and exceeds the requested 335 checks. The companion Phase 2A run [39020230394](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39020230394) passed **61/61**.

## Employee directory team-filter checkpoint — 2026-10-17

The directory's additive team filter was published on development commit `940eb87e8b462591644f2c36677c3bfa37c00c89`. Its first isolated run [39021335906](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39021335906) passed 358 of 361 Auth/RLS assertions. The two SQL failures and one browser failure had one test-fixture cause: synthetic employee `55555555-5555-4555-8555-555555555559` had a team but a NULL department, so the correctly intersected department/team query returned no row. The fixture now gives that synthetic employee its team's department. No product filter or authorization behavior was weakened.

The corrected exact development commit is `38fb943aa612504b5063da59e723713165d194cb`. [Main isolated acceptance run 39021983981](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39021983981) passed **361/361 Auth/Postgres/RLS assertions** and **297/297 contract tests**; TypeScript, production build, standalone browser regressions, disposable database security inspection, and cleanup all passed. [Phase 2A run 39021983982](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39021983982) passed **61/61**.

## Story-level evidence snapshot

Counts below require the exact requirement text to resolve from the hash-verified catalogue and the implementation to have matching tracked contract coverage plus passing isolated evidence where the story requires persisted data or a user journey.

| Status | Count | Scope |
| --- | ---: | --- |
| **VERIFIED** | 82 | Previous verified scope plus E37-01 tenant-scoped employee search, E37-05 omission of sensitive employee fields, and the two E13 history/notification requirements now passing isolated persisted-data journeys. |
| **MISSING — partially implemented acceptance** | 13 | Previous partial scope after moving E13-04 and E13-05 to VERIFIED; includes E37-02 (location filtering has no approved normalized contract), E37-03 (employee-view contact visibility is undefined; contact detail access remains employees.manage only), and E37-04 (designation/team are available but the verified schema has no reporting-line relation). These are not counted as complete. |
| **BLOCKED** | 13 | E03-02/03/06, E07-05/06/07, E08-15/16, E12-06..09, and E35-04. The required upload/replacement/reminder, leave entitlement, request edit/withdrawal, shift-change, or mandatory-acknowledgment contracts are not approved or not present; no rules were invented. |
| **BROKEN** | 0 | No acceptance failures on commit `b27c627`. This is specific to the tested scope and does not claim every catalogue requirement was exercised. |
| **Not yet classified** | 939 | Remaining catalogue stories have not yet been mapped against implementation and executable evidence. They are not being labeled missing or verified by inference. |

The source-linked contracts include the exact E01, E02, and E37 requirements; E03 document self-service; E12/E13 roster requirements; E15 timesheet requirements; E35 announcement requirements; and Candidate private-history stories `CA15-06`, `CA18-05`, and `X02-09`. Isolated Candidate evidence confirms that candidate history excludes recruiter-authored notes, actor identifiers, and panel debrief text. The latest Main run verifies E13-04 and E13-05 with persisted change-history/notification evidence. The canonical matrix remains byte-for-byte unchanged with its original SHA-256; its source-owned `NOT TESTED` tracking fields were not rewritten.

## Latest checkpoint delta — 2026-10-17

- Main development branch head `01b20934a9a63e0f220eb30c9a65d55daf4010b4` (tree `12eef1b2eafedeefdab3b62e1c0ef811f81eab5b`) passed [run 39025622956](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39025622956): **362/362 Auth/Postgres/RLS, 302/302 contracts, and all 56 browser checks**. Companion [run 39025622996](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39025622996) passed **61/61** Phase 2A/2B Auth/RLS assertions.
- Candidate development branch head `e3cb9c178cbfb66eb611c640f885a13581b50f51` (tree `cccccbc8ab966c6d06ed8ad3560d280765905d12`) passed [run 39025809497](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39025809497): **166/166 Auth/RLS, 19/19 C1 browser, 447/447 Candidate Auth/Postgres journey checks, 48/48 route/contracts, and TypeScript/build checks**. The persisted browser run emitted `CANDIDATE_CA14_STORY_EVIDENCE PASS=12 FAIL=0` for the original CA14-01 through CA14-12 requirements using the verified source hash `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. Therefore, **CA14 is now verified 12/12**.
- Candidate test-harness corrections: [run 39025196737](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39025196737) first exposed a lookup of the saved-CV control while wizard step 1 was mounted; the next run [39025556151](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39025556151) passed Auth/RLS and C1 E2E but exposed Playwright strict-mode ambiguity because “Application Submitted” appeared both in a status badge and the history region. The final run scopes that assertion to the application-history region and passes. Both were test-selector defects; no application behavior, RLS, or assertions were weakened.
- The existing aggregate baseline remains **82 VERIFIED, 13 partially implemented, 13 BLOCKED, 0 BROKEN in tested scope, and 939 not yet classified**. CA14 is listed separately as 12/12 now verified because the prior aggregate did not preserve its complete story-ID set and CA14-12 had earlier individual evidence; do not add 12 to the aggregate until ID-level deduplication is recorded. These counts do not imply full programme acceptance.

## Release state

Only `development/hris-checkpoints` changed. The current Main development head is `01b20934a9a63e0f220eb30c9a65d55daf4010b4` (local equivalent tree `12eef1b2eafedeefdab3b62e1c0ef811f81eab5b`); the current Candidate head is `e3cb9c178cbfb66eb611c640f885a13581b50f51` (local equivalent tree `cccccbc8ab966c6d06ed8ad3560d280765905d12`). Production `main`, production SQL/Auth settings, and live deployments were not touched. The full 1,047-story acceptance and Figma release gates remain open. Final recovery backup and production release remain gated on those applicable acceptance gates.

## Next checkpoint

Continue by rebuilding the aggregate's story-ID inventory so the verified CA14 module can be deduplicated exactly; then reconcile the next unclassified modules against original requirement text and executable evidence. Prioritize independently testable journeys, and treat unapproved role or data-sharing rules as blockers rather than widening access.
