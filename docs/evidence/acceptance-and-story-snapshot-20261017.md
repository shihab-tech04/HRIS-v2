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

## Story-level evidence snapshot

Counts below require the exact requirement text to resolve from the hash-verified catalogue and the implementation to have matching tracked contract coverage plus passing isolated evidence where the story requires persisted data or a user journey.

| Status | Count | Scope |
| --- | ---: | --- |
| **VERIFIED** | 78 | E01 (7), E02 (2), E03 (5), E04 (4), E05 (5), E06 (7), E07 (5), E08 (16), E09 (3), E12 (5), E13 (3), E15 (10), E35 (3), Candidate/cross-system privacy (3). |
| **MISSING — partially implemented acceptance** | 12 | E01-01/06/10, E04-05, E06-04/06, E09-03/05, E13-04/05, E15-08, E35-05. These are not counted as complete. |
| **BLOCKED** | 13 | E03-02/03/06, E07-05/06/07, E08-15/16, E12-06..09, and E35-04. The required upload/replacement/reminder, leave entitlement, request edit/withdrawal, shift-change, or mandatory-acknowledgment contracts are not approved or not present; no rules were invented. |
| **BROKEN** | 0 | No acceptance failures on commit `b27c627`. This is specific to the tested scope and does not claim every catalogue requirement was exercised. |
| **Not yet classified** | 944 | Remaining catalogue stories have not yet been mapped against implementation and executable evidence. They are not being labeled missing or verified by inference. |

The source-linked contracts include the exact E01 and E02 requirements; E03 document self-service; E12/E13 roster requirements; E15 timesheet requirements; E35 announcement requirements; and Candidate private-history stories `CA15-06`, `CA18-05`, and `X02-09`. Isolated Candidate evidence confirms that candidate history excludes recruiter-authored notes, actor identifiers, and panel debrief text. The E13 change-history and notification stories remain partial because the current contract covers assignment creation but not shift-change history or update notifications.

## Release state

Only `development/hris-checkpoints` changed. Production `main`, production SQL/Auth settings, and live deployments were not touched. The full 1,047-story acceptance and Figma release gates remain open. Final recovery backup and production release remain gated on those applicable acceptance gates.

## Next checkpoint

Continue source-linked reconciliation beyond the 16 modules with evidence in this snapshot. Prioritize independently testable journeys, and treat unapproved role or data-sharing rules as blockers rather than widening access.
