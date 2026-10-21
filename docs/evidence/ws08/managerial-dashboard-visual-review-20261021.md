# WS08 Managerial Dashboard checkpoint

## Approved screen reviewed

- Figma file: [Synesis HRIS](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9)
- Managerial Dashboard frame: `9:22640` (1920 × 1080)
- Daily Attendance Chart: `9:22784`
- This checkpoint implements the Managerial Dashboard composition. HOD, Admin, CEO, and Super Admin references are recorded in the node map, but their screens are not visually accepted or complete.

## Rendered evidence

The pre-sync browser captures are in exact-head Actions run [39644594475](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39644594475), artifact [12365998882](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39644594475/artifacts/12365998882), SHA-256 `fb5f9547457bd0efb46cecc110b490ed0cc0416f361b3dcd619f2c959b4cbeec`. That run predates the current WS01 #49 head `e645a18144ac0eb30e413140875d851b5c40c220`; use the fresh post-sync artifact linked from PR #44 for current comparisons. The previous artifact contains dashboard screenshots at 1920 × 1080, 1280 × 900, 768 × 1024, 375 × 812, and a 375 px full-page capture, plus Manager attendance information/report screenshots and Bengali attendance/report/leave filters.

The browser acceptance route uses the existing `signInSyntheticManager` test fixture and stubbed tenant RPC responses. Displayed values are test data for layout and interaction; they are not production metrics. No production data was read or written.

## Implemented visual differences

- Centered the manager content to the approved 1396 px canvas width and matched the heading and toolbar spacing.
- Added the approved Dashboard/date header, successful-refresh banner, and Personal/Managerial tabs; removed the extra “Needs attention” panel from the Figma dashboard composition.
- Matched the 48 px toolbar control height, local Figma toolbar icons, attendance summary container, 67 px summary tiles, and wide-screen divider between the first three and remaining five metrics.
- Matched the chart card proportions and grid treatment, and moved refresh into its heading row. The existing 7/30-day selector, metric search, report download, navigation, and tenant-scoped refresh remain functional.
- Kept the service's daily `records` values as counts. Figma node `9:22784` shows 0–100% labels, but no denominator/percentage source contract is approved; those semantics remain blocked. No percentage or fabricated metric was introduced.

## Verification

- Pre-sync exact-head Actions run `39644594475` passed 64/64 browser tests plus TypeScript/source contracts, build, and source-drift reporting on implementation head `bafda05579a3144f455620e635bec6e093b160c1`; this is not current-base evidence.
- Local `npm run lint`, Vite build, and focused management/workspace/attendance/SA06 contracts passed (39/39). The full local contract command reported 344/351 because seven existing Candidate checks require an absent sibling checkout; hosted Actions checked it out and the complete contract step passed.
- The post-sync browser checks compare the visible daily `<thead>` surface against toolbar top +56px after the 48px controls and 8px gap; target header is 59px and data rows are 80px. On the refreshed base, aggregate node `17:28321` uses the WS01-owned 17px pseudo-row gutter; the Manager test allows only 16–18px and checks 6px between data rows at 1920/1280.
- English/Bengali, responsive navigation, error/empty, Manager leave date overlap, and Bengali Manager filter visibility at 375/768 were included in hosted browser coverage.

## Review handoff

- **WS04 visual review:** compare the fresh post-sync exact-head artifact against nodes `9:22640`, `9:22784`, `17:28694`, and `17:28321`; the current run/artifact is linked from PR #44. The dashboard composition/header/banner/tabs now render; chart denominator/percentage semantics remain blocked, and this is not story certification until WS04 accepts it.
- **WS05 release review:** retain draft/hold status until its release gates are met. This change makes no production writes and does not authorize merge or deployment.
- SA06 global master-data writes and APIs remain disabled pending WS02 contract verification. Sole Super Admin, tenant permissions, and existing authorization behavior were not changed.
