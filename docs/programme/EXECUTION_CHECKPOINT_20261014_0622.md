# Execution checkpoint — Phase 18 learning locale parity

**Time:** 2026-10-14 06:22 Asia/Dhaka  
**Branch:** `codex/recovery-checkpoint-20261012`  
**Base commit:** `7ff0771cdfe33fb1a8d474666b1004eacc3aa296`  
**State:** implementation verified locally; isolated-suite replay is blocked by the test harness's existing-Auth safety guard. No push or deployment.

## Meaningful implementation checkpoint

Completed the Phase 18 EN/BN pass across the existing Learning workflow: employee catalog and enrollment history, skill self-service, manager program/session administration and roster, and manager request review. The workspace passes the active locale into all three learning pages. Labels, accessible names, form hints, status and empty states, confirmations, action feedback, and date/time formatting follow the selected locale. Learning navigation labels are translated through the existing workspace catalog. User-authored program titles, descriptions, categories, employee names, notes, and skill content remain as entered.

No SQL, RPC shape, RLS, tenant permission, authentication, route, or application-shell behavior changed. Existing loading, retry, validation, cancellation, focus handling, persistence, and responsive patterns were retained.

## Source changes

- `src/live/learning-locale.ts` — Bengali dictionary and placeholder interpolation for the Learning journeys.
- `src/live/MyLearning.tsx` — employee catalog, enrollment/history, action and skill-profile locale.
- `src/live/LearningProgramAdmin.tsx` — program/session forms, roster, status, error and date locale.
- `src/live/LearningRequests.tsx` — request queue, decisions, messages, accessible names and date locale.
- `src/live/LiveHrisWorkspace.tsx`, `src/live/project-locale.ts` — pass locale into the pages and translate learning navigation labels.
- `tests/contracts/learning-locale.test.mjs` and existing learning contracts — translation-key coverage and locale wiring.
- `tests/sql/isolated-auth/run-learning-browser.mjs` — real Auth/Postgres browser assertions for employee and manager language switching.

## Verification

- `npm run check`: TypeScript passed; **116/116 contract tests passed**; Vite build passed. Existing large-bundle advisory only.
- `npm run test:e2e`: **50/50 Chromium tests passed**, including desktop/mobile and existing project/review regressions.
- Disposable local Auth/Postgres run after correcting the Bengali queue assertion: learning tenant-scope and permission checks passed; real employee/manager learning browser flow and persisted program/enrollment case passed.
- Attempting to replay the complete isolated suite again stopped before changing or inspecting Auth rows: the runner requires an empty Auth service and refused because the current disposable service already contains users. No Auth records were inspected, changed, or removed. The suite's full overall count for this run is therefore **not claimed**.
- The previous checkpoint's complete isolated Auth/RLS suite was 206/206 at `EXECUTION_CHECKPOINT_20261014_0605.md`.
- No production or paid service used. No GitHub push or deployment.

## Story traceability and next work

The implementation now has verified page-level and browser acceptance evidence for the Learning locale journey. **0 of 1,047 canonical story IDs are newly mapped/accepted in this batch; 1,047 remain pending canonical traceability.** This is a story-linkage count, not a claim that the product has no implemented features. The owner-reported catalogue hash and story text were not reconstructed.

Phase 12 remains partial. Continue with the next unblocked, end-to-end business journey from the phase ledger. Keep manager expense decisions, service-request resolution, payroll calculations, employee conversion, and other policy-dependent actions gated on verified authority. Preserve the approved project/task/review permissions and overlap eligibility rules. Finish acceptance and verify a versioned Drive archive before any final GitHub push or deployment.
