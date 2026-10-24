# Phase 02 — Figma design-system and UX foundation

**Foundation/source guard gate: PASS (10/10). Formal per-route Figma pixel parity: OPEN.** The source design foundation is established and preserved; this does not accept every Figma screen or override missing references.

## Reference source inspected directly

Figma file: [Synesis HRMIS design](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9). Its single page was queried in the connected Figma app on 18 October 2026. The four known Main frames were read/visually inspected, and older checked-in actual-screen captures were inspected.

| Reference frame | Actual local screenshot evidence | Observed alignment | Formal parity |
| --- | --- | --- | --- |
| `3:39433` Employee personal dashboard | `docs/evidence/employee-dashboard-desktop-20261012.png` | Identity card, personal attendance/working-hours content, leave balance/action, upcoming holidays. Current HRIS adds verified own status, requests and real-data empty states; header, sidebar, arrangement and chart geometry differ from source frame | OPEN |
| `9:22640` Managerial dashboard | `docs/evidence/managerial-dashboard-desktop-20261015.png` | Eight attendance/team metrics, search/export, daily chart. Current workspace also includes pending-work and team report with real tenant data; Figma's fixed demo dates/metric numbers must not be copied as live figures | OPEN |
| `17:28320` Attendance information | `docs/evidence/attendance-information-desktop-20261016.png` | Employee-level table, team/department, date/time/status, search/export/filter. Existing exact local Figma sort glyph is present; display and columns depend on effective permission | OPEN |
| `3:39880` Personal leave | `docs/evidence/personal-leave-desktop-20261012.png` | Leave action, breakdown, year selector, history/status rows and CSV export. Current real leave types/balances supersede the illustrative Figma category values; shell/card sizes and arrangement differ | OPEN |

The source screenshot of `17:28320` returned **sparse** code/metadata because of frame size; it must be drilled into by child frame before any pixel-level implementation on that screen. Similarly, `9:22640` returned sparse metadata. No current implementation was modified using a sparse response.

The complete Figma page metadata has **no dedicated Candidate portal or platform Super Admin frame** (Candidate appears only in employee-referral text). These references cannot be treated as recovered or guessed. This is a known source gap for final parity, not a reason to replace the existing approved Candidate or Super Admin UI with unrequested concepts.

## Preserved foundation contract

`node scripts/phase02-design-foundation.mjs` and the contract test verify:

- Main and Candidate retain Poppins, the approved brand blue `#085587` and Bengali font fallback where applicable. The Figma file includes a closely related `#08558B` token; **the programme-approved `#085587` remains authoritative** until a specifically authorized design change.
- Main still mounts the authenticated `LiveApp` and keeps preview opt-in. Candidate retains its explicit public-only production release gate. No demo state becomes real HR data.
- The checked-in sort asset and four existing PNG captures have intact file format/dimensions; capture existence does **not** mean today's branch has passed a pixel comparison.
- Existing shell, sidebar/header, cards, keyboard and mobile conventions are preserved. No broad visual rewrite was performed merely to make the screens imitate sample data.

## Remaining visual acceptance before Phase 21

1. Run a fresh viewport-matched 1920px/1280px/375px browser capture from the current branch for each authorized role/screen, with controlled realistic data; compare side by side with Figma at equivalent crop/scale. Test height-dependent stacking, typography, spacing, cards, nav and overflow. Mark precise deviations by node/route and resolve without weakening role permissions or data accuracy.
2. Recover any additional approved Figma reference files for Candidate and Super Admin if such files exist; otherwise request explicit visual acceptance of their existing interfaces. Do not invent unavailable Figma screens.
3. Certify applicable keyboard/focus, contrast, readable EN/BN labels, translated layout/overflow, mobile touch targets and accessible error/empty/loading states on the live authenticated journeys.
4. Track the final exact visual delta/approval with Phase 18/20 story coverage and Phase 21 release sign-off; old PNG captures and synthetic browser fixtures are not sufficient by themselves.

The Phase 02 **design foundation is complete**; full visual parity remains a distinct outstanding acceptance condition. Source and contracts only changed in this phase. No UI, deployed site or backend was mutated.
