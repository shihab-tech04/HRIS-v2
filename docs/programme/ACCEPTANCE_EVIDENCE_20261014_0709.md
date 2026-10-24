# Acceptance Evidence — Candidate application history

**Checkpoint:** 2026-10-14 07:09 Asia/Dhaka. **State:** accepted feature slice; overall programme remains incomplete.

## Workflow accepted

- Candidate applies to a published role through the existing verified application journey.
- The transaction writes the initial `applied` stage-history event for the authenticated candidate. Administrative/import inserts do not create a candidate-authored event.
- Candidate `My Applications` now renders persisted stage-history rows instead of fixed screening milestones. Existing interview-scheduling and offer-issuance history appears after refresh.
- Main's existing owner-scoped recruitment context returns the event history but strips recruiter notes and actor IDs. The Candidate adapter independently rejects non-candidate notes and never maps actor IDs.
- Cross-candidate isolation was exercised: Candidate B did not receive Candidate A's application or history.
- The Candidate history panel has a true keyboard-operable disclosure and visible focus ring. The actual local browser journey passed at 375px and 1280px without horizontal overflow.
- Empty history remains an explicit state for older records without events. No milestone is inferred from the current application status.

## Changed source

Main commit `74516ea07781deb1569f7ee957e573fdca0e6282` adds the local source migration `20261014150000_hris_candidate_initial_application_history.sql` and its SQL contract test.

Candidate commit `0262a5bc6c327064fcc048dddcbf515eaf10a8a2` adapts safe stage-history rows, renders the actual event history, and extends the Candidate Auth/Postgres/browser journey and reusable test fixture.

## Executed verification

- Candidate isolated local Auth/Postgres/Storage/browser workflow: **137 passed, 0 failed**. It covered candidate application persistence, initial event creation, stage history after interview and offer actions, internal-note redaction, cross-candidate isolation, mobile/desktop rendering, and the existing assessment, interview, offer, and preboarding journey.
- Candidate route/contract tests: **20 passed, 0 failed**.
- Candidate TypeScript and production build: **PASS**. Existing Vite config-loader and bundle-size advisories remain.
- Main `npm run check`: TypeScript **PASS**, contracts **122 passed, 0 failed**, Vite production build **PASS**. Existing bundle-size advisory remains.
- `git diff --check`: **PASS**.
- Project/task peer-review suite remains **206/206 PASS** from the previous isolated checkpoint. It was not rerun in this unrelated Candidate slice.

### Test-environment corrections

Two local runs did not reach final acceptance: the default Candidate test stack had no Storage container, then a reused stack exposed a stale synthetic tenant timezone. The final run used the dedicated local Candidate stack with Storage enabled and reapplied the fixture's declared timezone. Two strict Playwright locators were scoped to the history region and changed to tolerate repeated real interview events. The final 137/137 run completed and cleaned its synthetic Auth and application fixtures.

## Scope and release status

- New SQL was executed only in a disposable local Supabase stack. No hosted schema, production data, Auth entry, permission, or paid service changed.
- No GitHub push or deployment occurred.
- The canonical 1,047-story catalogue was not mapped in this slice; no story IDs or acceptance counts are inferred.
- Full email delivery, interview evaluation, employee conversion, app-wide Figma comparison, and overall recruitment acceptance remain open.
