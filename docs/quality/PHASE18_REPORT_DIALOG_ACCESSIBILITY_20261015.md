# Phase 18 — Team Report Detail Dialog Accessibility

## Change

- The Team Report detail dialog now contains keyboard focus, including when focus starts on its heading, and restores focus to the row action after Escape, Close, or backdrop dismissal.
- The existing report UI, API, authorization, layout, and data behavior are unchanged.

## Verification

- `npm run check`: PASS — TypeScript, 163/163 contract tests, and Vite production build.
- `HRIS_DASHBOARD_EVIDENCE_DIR=/private/tmp/hris-phase18-a11y-20261015 npx playwright test tests/browser/managerial-dashboard.spec.ts --project=chromium`: PASS — 3/3. Includes the 375px Bengali dialog journey, initial focus, Shift+Tab wrapping from the heading, focus containment, Escape, and return to the opening action.
- Browser acceptance used synthetic Auth and intercepted data; it does not certify persisted Auth/Postgres/RLS behavior.
- No SQL, production data, production permissions, `main`, or deployment changed. Existing Phase 16 and Phase 17 Auth/RLS integration remains pending the approved healthy isolated environment.
