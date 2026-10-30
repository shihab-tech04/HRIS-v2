# WS09 Figma acceptance reference register — 2026-10-31

| Surface | File key / source | Frame/node | Source status | Validation performed | Story-level pixel parity |
|---|---|---|---|---|---|
| Main Employee Profile | [Figma Main](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=66-72042) | `66:72042`, `profile _main`; `1920 × 2063` | **Approved Main reference reported in repo** (see `docs/evidence/ws06-figma-profile-asset-recovery-20261021.md`) | **Live Figma metadata read succeeded 2026-10-31**. Structure includes profile header, personal details, contact/verification/education content. | **DESIGN UNVERIFIED** for individual E02 flows: no exact same-viewport authenticated application capture and interactive comparison in this pass |
| Main Employee vector assets | [Figma same file](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9) | `109:40976`, `109:40981`, `I109:41052;66:53832`, `I109:41052;66:53838`, `66:72193`, `370:37443` | Approved asset-source identifiers reported by original 21 Oct asset audit | Repo audit records Figma SVG exports; WS09 did not re-export or edit | Use-site spacing, icon size, interactions and exact UI parity NOT VERIFIED |
| Main other role-specific screens | Approved Main file referenced historically | Exact per-story frame not enumerated by current WS09 work | **DESIGN UNVERIFIED** per story | No file-wide frame approval inventory made; do not infer approval for every module from one Main profile frame | NOT VERIFIED |
| Candidate private & public | Candidate-specific approved file/frame **NOT ESTABLISHED** | None verified | **DESIGN UNVERIFIED** (21 Oct accessible audit found none; current source code search found no newly verified file key) | Functional QA can use existing Candidate patterns; **cannot** call Candidate pixels '1:1 approved' | NOT VERIFIED |
| Shared modal focus | [Main Figma reference](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9) | No keyboard-focus design node | Visual source does not establish behavior | PR #140 browser tests are necessary for focus trap/return and accessible labels; branch CI had failure at WS09 observation | NOT VERIFIED |

## Explicit interpretation

1. The Main Figma file is accessible and the Employee Profile root node is real; Figma metadata independently showed `1920 × 2063`, exact node names and nested geometry. This **does not** mean the web application was compared at that viewport.
2. A document's statement that a frame is approved is **recorded provenance**, not proof that every node in that file was independently approved as a product requirement.
3. The Candidate-specific approved Figma source remains unknown. Do **not** create approval IDs, node coordinates, or screenshots as substitutes.
4. Evaluate form order, mandatory fields, validation, modal actions, accessible focus, desktop/mobile layout, EN/BN expansion, screenshot geometry and scroll behavior only against exact approved nodes where available, plus observed functionality otherwise.
5. Never use the example portrait embedded in the Figma frame as a real employee identity. Actual production profile photos require signed-in record ownership and private asset access.
6. Outstanding Figma tasks should return **actual verified file/frame/node**, screenshot viewport, browser state, theme and locale, observed discrepancy with evidence, and WS04 verdict per E02/CA story. Until then use `DESIGN UNVERIFIED`.

## No side effects
This register is evidence-only. No Figma nodes, assets, product source, SQL, authorization or production environment were changed.
