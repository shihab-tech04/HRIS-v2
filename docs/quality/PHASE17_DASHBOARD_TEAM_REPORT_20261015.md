# Phase 17 — Manager Dashboard Team Report

**Checkpoint date:** 2026-10-15

**Base development checkpoint:** `6541c4fb387f0d02f07fc823905e6dd2624ee845`
**Production:** unchanged; no deployment performed.

## Delivered in this batch

- Added a tenant-scoped report-date parameter to the Team Report RPC. Omitting the date preserves tenant-local “today.”
- Added a team-detail RPC that requires both `dashboard.view` and `reports.view`, an active tenant, and exactly one same-tenant team or Unassigned scope. The response excludes salaries, contacts, raw attendance remarks, client names, tenant IDs, and employee IDs.
- Connected the dashboard date picker to the report RPC; search filters the visible team rows.
- Added totals derived from the same filtered rows used by CSV. CSV includes the selected date and matching filtered total row.
- Added retryable, tenant-bound detail access using aggregate fields already used by the attendance report. Details load only for the selected team on the selected date.
- Localized Team Report controls, states, totals, CSV headers, and details in English and Bengali. Kept the existing application shell and dashboard layout.
- Clarified that team membership totals reflect current active employee records while attendance counts reflect the selected date; historical membership is not available from the current contract.

## Verification

- `npm run check`: passed — TypeScript, 163/163 contract tests, Vite production build.
- Manager Dashboard / Team Report Playwright: 3/3 passed — desktop filters and CSV parity; 375px mobile; injected report/detail outages and retries; delayed loading states; Bengali labels; detail scope.
- `node --check` passed for the isolated SQL/Auth runner and Team Report browser runner.
- `git diff --check` passed.
- UI browser checks use synthetic Auth and intercepted API responses. They verify the browser journey only; they do not certify Postgres, Auth, RLS, or production integration.

## Explicitly pending

- Isolated Auth/Postgres/RLS acceptance for the new migration and detail RPC. No healthy local test runtime is available: `colima list` reports `Broken` for `hris-acceptance`, `hris-candidate-e2e-20261014`, `hris-contact-acceptance-20261015-free`, `hris-scratch`, and `taxpay-supabase-local-20261011`; the HRIS Docker socket is unavailable. No profile was restarted or rebuilt.
- Phase 16 Auth/RLS integration remains pending for the same environment reason.
- No production SQL, data, permissions, GitHub `main`, or live deployment was changed.

## Figma-aligned Team Report follow-up — 2026-10-15

- Used the Managerial Dashboard source frame `9:22640` and Team Report design context `9:23134` to align the report heading, 48px controls, desktop table width, header height, and row density while preserving date selection, filtered totals, detail access, and CSV behavior.
- Kept the existing 790px mobile table width, enabled the 980px desktop layout at the small breakpoint, and made the horizontally scrollable report region keyboard-focusable with an EN/BN accessible name. The table header uses `#64748B` instead of the lower-contrast Figma gray to keep the small labels readable.
- Updated screenshots were captured by synthetic browser checks at 1440px desktop and 375px mobile. These remain UI-only checks; they do not certify live Auth, Postgres, RLS, or data persistence.
- Verification after the refinement: `npm run check` passed (TypeScript, 163/163 contracts, Vite build); Managerial Dashboard Playwright passed 3/3.
- The Figma API returned 1×1 exports for the Team Report subframe and its table children. High-fidelity design context was available, but a pixel-level visual comparison for this subframe is **not verified**. The root frame screenshot does not show the scrolled Team Report region.
- Auth/Postgres/RLS acceptance remains pending for the broken local runtime recorded above. No production SQL or deployment occurred.
