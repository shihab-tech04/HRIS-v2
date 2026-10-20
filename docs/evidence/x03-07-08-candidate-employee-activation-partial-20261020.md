# X03-07 / X03-08 candidate-to-employee activation — partial evidence — 2026-10-20

**Canonical requirements:**

- **X03-07:** “Employee record is created/activated.”
- **X03-08:** “Candidate information is reused.”

**Result: PARTIAL_ACCEPTANCE in Main's disposable Auth/Postgres/browser journey.** The existing HR onboarding handoff activates an accepted-offer candidate and reuses the application name, email, and Auth identity. Earlier candidate/offer lifecycle steps, the full X03 journey, and hosted cross-system acceptance remain unverified.

## Exact runtime evidence

- Main runtime/test commit: `1f0bec2fc40f27e600685661a83c6815dd43cf08` on `development/hris-checkpoints`.
- Full disposable workflow: [GitHub Actions run 39425355049](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39425355049), passed.
- Suite totals: **350/350 contract tests**, **56/56 standalone browser regressions**, **386/386 local Auth/RLS assertions**, and Phase 04 SQL/API parity **26/26**. The Vite production build passed, and the disposable security advisor reported **No issues found**.
- Exact X03-07 runtime record: `X03-07 partial: HR activates the accepted-offer candidate as an active employee through the existing onboarding handoff`.
- Exact X03-08 runtime record: `X03-08 partial: HR activation reuses the candidate name, email, and Auth identity in the employee record`.
- Browser markers: `X03-07_PARTIAL_HR_ONBOARDING_ACTIVATION_BROWSER_PASS` and `X03-08_PARTIAL_CANDIDATE_DATA_REUSE_BROWSER_PASS`.

## Verified Main-side handoff

The disposable fixture starts with an accepted offer and a submitted four-section preboarding packet. An authenticated HR manager with active `employees.manage` access activates the candidate from the existing Onboarding queue. The runtime verifies an active employee is linked to the application's candidate Auth user, the application advances to `hired`, the handoff completes with HR verification, an audit event is recorded, the Employee membership is active, and retry returns the same employee ID.

For **X03-08**, the database compares the persisted employee's `full_name` with the application `full_name`, `official_email` with application `email`, and `user_id` with `candidate_user_id`. The browser checks the authenticated activation request and the existing “same sign-in identity” confirmation. The existing UI also passes its 375px and 1280px overflow checks; no UI or design changes were needed for this slice.

## Acceptance boundary

This evidence covers only the existing candidate-to-employee activation handoff. It does not test offer approval or candidate acceptance, candidate-side preboarding completion, effective-date access, or retention of all recruitment history. It does not certify other X03 IDs, the full X03 sequence, production APIs, or cross-system hosted behavior. The Candidate repository was not changed. All Auth, employee, membership, application, handoff, and audit fixtures were synthetic in a disposable local database; no production write, merge, or deployment occurred.
