# Acceptance evidence — Phase 18 learning locale parity

| Journey | Evidence | Result |
|---|---|---|
| Employee My Learning | Switches to Bengali; translated heading, skill-profile heading and skill-name label appear; `document.documentElement.lang` updates; switch back returns the English heading. Existing enrollment, cancellation, skill-save and retry journeys remain server-backed. | PASS in disposable local Auth/Postgres browser run |
| Manager learning requests | Switches to Bengali; translated request queue heading and feedback-pending rows appear; document language updates; switch back returns the English heading. Existing approval/rejection and employee refresh continue using their tenant RPCs. | PASS in disposable local Auth/Postgres browser run |
| Learning program/session management | Existing local Auth/Postgres journey publishes a program and session, verifies persistence, and enrolls the linked employee. Page labels and dates use the active locale. | Persistence workflow PASS; locale catalog and page props covered by contract tests |
| Translation catalog | Literal `tx()` keys resolve to unique Bengali entries; employee, manager program, and manager request routes receive locale. | PASS, included in 116 contract tests |
| Full browser regressions | Chromium suite, including the project/task/review journeys and responsive widths. | 50/50 PASS |
| TypeScript/build/contracts | `npm run check`. | TypeScript PASS; 116/116 contracts PASS; Vite build PASS |
| Isolated-suite replay guard | A subsequent replay stopped before test setup because the disposable local Auth service was not empty. The harness refused to proceed. No records were inspected or removed. | BLOCKED before execution; no count claimed |

The first browser run exposed a strict-mode selector ambiguity because multiple queue rows correctly displayed “Feedback pending.” The assertion was narrowed to the first visible exact-text match. The next complete local Auth/Postgres run passed the learning SQL/Auth checks, end-to-end learning browser flow, and persisted manager-published program/session check. A later replay hit the empty-Auth guard before execution. Unrelated screenshot outputs rewritten by the Chromium suite were restored to their pre-test state.

No database or authorization changes were part of this batch. Product release acceptance, canonical story-ID mapping, remaining business journeys, Drive preservation readback for this checkpoint, final GitHub publication, and deployment remain pending.
