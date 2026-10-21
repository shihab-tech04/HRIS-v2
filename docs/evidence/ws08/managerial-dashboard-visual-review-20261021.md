# WS08 Managerial Dashboard checkpoint

## Approved screen reviewed

- Figma file: [Synesis HRIS](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)
- Managerial Dashboard frame: `9:22640` (1920 × 1080)
- Daily Attendance Chart: `9:22784`
- This checkpoint covers the Managerial Dashboard only. HOD, Admin, CEO, and Super Admin nodes remain to be mapped and reviewed.

## Rendered evidence

The screenshots are browser captures of the local Managerial Dashboard at these viewport sizes:

- [1920 × 1080](ws08-managerial-dashboard-1920x1080-20261021.png)
- [1280 × 900](ws08-managerial-dashboard-1280x900-20261021.png)
- [768 × 1024](ws08-managerial-dashboard-768x1024-20261021.png)
- [375 × 812](ws08-managerial-dashboard-375x812-20261021.png)
- [375 px full-page view](ws08-managerial-dashboard-375x812-full-page-20261021.png)

The browser acceptance route uses the existing `signInSyntheticManager` test fixture and stubbed tenant RPC responses. The displayed values are test data for exercising layout and interaction; they are not production metrics. No production data was read or written.

## Implemented visual differences

- Centered the manager content to the approved 1396 px canvas width and matched the heading and toolbar spacing.
- Matched the 48 px toolbar control height, local Figma toolbar icons, attendance summary container, 67 px summary tiles, and wide-screen divider between the first three and remaining five metrics.
- Matched the chart card proportions and grid treatment, and moved refresh into its heading row. The existing 7/30-day selector, metric search, report download, navigation, and tenant-scoped refresh remain functional.
- Kept the service's daily `records` values as counts. The chart has no percentage axis, ratio, inferred denominator, fabricated metric, or changed backend contract.

## Verification

- `npm run lint`: passed.
- Focused Manager dashboard and Team Report contracts: 22/22 passed.
- Full contract suite: 356/356 passed.
- Manager browser suite: 6/6 passed, including 1920, 1280, 768, and 375 px overflow/grid checks, the 111 px desktop sidebar, and mobile navigation open/close.
- `npx vite build`: passed. Vite reports the existing application JavaScript bundle exceeds its 500 kB advisory threshold.
- Browser checks used the installed Playwright Chromium headless shell (revision 1187) through a temporary local config because the linked Playwright package expects revision 1248, which is not installed in this environment.

## Review handoff

- **WS04 visual review:** compare the five captures with nodes `9:22640` and `9:22784`, including the 768 px navigation state and the horizontally scrollable chart at 375 px. Treat this as independent evidence for review, not as story certification.
- **WS05 release review:** retain draft/hold status until its release gates are met. This change makes no production writes and does not authorize merge or deployment.
- SA06 global master-data writes and APIs remain disabled pending WS02 contract verification. Sole Super Admin, tenant permissions, and existing authorization behavior were not changed.
