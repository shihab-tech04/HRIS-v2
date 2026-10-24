# WS04 independent Figma UI-01 visual review — 21 October 2026

## Scope and evidence provenance
**Approved Figma:** `XEXLe9J1oATlITS9I5u1P9`, attendance-information desktop frame `17:28320` (1920x1117). Frame was directly rendered through Figma and visually inspected.

**Implemented source:** Main [PR #49](https://github.com/shihab-tech04/HRIS-v2/pull/49), `src/live/LiveHrisWorkspace.tsx` and `src/live/project-locale.ts`, viewed at exact test head `ed400c05397faca0ff4c568927871a6813071238` plus source-only CI harness. [UI browser workflow 39550584330](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39550584330) **PASS**. Its `main-figma-ui-browser-evidence` artifact contains real browser screenshots from a **synthetic authorized tenant session**, including `docs/evidence/attendance-report-desktop-20261016.png` (1920 view) and `docs/evidence/attendance-report-mobile-20261016.png` (375 view). Screenshots demonstrate rendered UI in isolation; **not** real hosted identity/tenant production acceptance.

## Independent visual comparison results
| Section | Figma target `17:28320` | Current rendered Main UI | Disposition |
| --- | --- | --- | --- |
| Attendance/Leave management heading | White band, `Attendance & Leave Application Management` | Heading implemented and visible in page content | **IMPLEMENTED / structure visible**; verify font/position at matching dimensions |
| Section tabs | Attendance Information, Attendance Requests, Leave Requests, Personal Leave Application History | All four labels rendered; existing authorized attendance & leave navigation links work; unsupported attendance-request state unavailable | **PARTIAL**, not a completed request-state screen |
| Report heading & controls | Attendance Report, search, Download Report, filter | Matching visible headings/controls, documented control geometry under tested report case | **PARTIAL GEOMETRY**, actual Figma pixel comparison pending |
| Attendance report table | Name, Designation, Team Name, Department, date/hours/deviation, styled rows | Source-backed aggregate report with comparable columns and styled rows | **PARTIAL GEOMETRY**; Figma eight sample rows vs two synthetic fixture rows are **different data**, not automatically a defect |
| Global header and side navigation | Approved Synesis IT logo and complete role-specific icon/section navigation | Existing production-auth header uses text `SYNESIS HRIS 360°`; sidebar only shows permission-authorized routes in the synthetic sample | **UNMATCHED VISUAL SYSTEM / AUTH-SCOPED**; do not fabricate permissions to fill Figma |
| Primary color | Figma `#08558B` | Current approved code baseline includes `#085587`; some local widgets use Figma `#08558B` | **TOKEN DECISION OPEN**, no silent global recolor |
| Mobile 375 | No approved exact corresponding Figma target validated | Rendered screenshot shows single-column controls, horizontal scrolling table and tabs; no document-level overflow in browser test | **RESPONSIVE BEHAVIOR PASS**, not 1:1 Figma mobile |

## Disposition and next small packets
**UI-01 first screen structure implemented with passing synthetic CI. Full Figma 1:1 parity: NOT CERTIFIED; production: HOLD.** Keep the prior 61-row audit classification until every comparison gets explicit change-level evidence; do not increment full PASS counts for partial geometry.

1. WS01: continue Figma header/sidebar identity design *only after* reconciling live authenticated multi-role shell and accepted logo asset. Preserve all existing verified auth, navigation, EN/BN, sign-out, SQL sync.
2. WS07/WS08: map attendance request normal/bulk/approved/rejected `17:29937/30342/30766/31148` and leave requests `17:31769/32168/32584/32957` to real permission and APIs. Unavailable controls stay visibly disabled, not simulated.
3. WS06: next independent employee profile view and approved contact field layout.
4. WS03 Candidate: live public/jobs screenshot and source contract pending; approved Candidate frame pairing still UNKNOWN.
5. WS05: production release only after exact merged UI source with synchronized Pages assets, independent non-GitHub source and DB backup/readback/restore, hosted cross-tenant signed-in negative tests, protected approvals, live deployed version verification.

No source functionality, release branch, permissions, production SQL or public deployment were modified by this report.
