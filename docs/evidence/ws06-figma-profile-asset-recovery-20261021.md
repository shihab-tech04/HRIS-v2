# Employee profile Figma asset recovery — 21 October 2026

## Scope
Asset-only recovery for the approved Employee profile screen **Figma file `XEXLe9J1oATlITS9I5u1P9`, node `66:72042`** (1920 × 2063). These files are extracted directly from the original nodes using the authorized **Figma Plugin API `exportAsync({ format: "SVG" })`** and saved through the connected GitHub integration as permanent reviewable source files. No temporary Figma asset URLs, generated screenshots, substituted iconography, API writes, new fields or schema changes.

| Local file | Approved Figma node | Original grouping |
| --- | --- | --- |
| `src/assets/employee-figma/address-book.svg` | `109:40976` | address-book 1 |
| `src/assets/employee-figma/edit-pen.svg` | `109:40981` | uil:pen |
| `src/assets/employee-figma/document-check.svg` | `I109:41052;66:53832` | memo-circle-check |
| `src/assets/employee-figma/view-eye.svg` | `I109:41052;66:53838` | eye (5) 1 |
| `src/assets/employee-figma/graduation-cap.svg` | `66:72193` | graduation-cap 1 |
| `src/assets/employee-figma/pdf-document-icon.svg` | `370:37443` | pdf 3 image fill, exported as original Figma-rendered SVG container |

### Use/limitations
1. These are **exact Figma exports**, not stylistic approximations. Validate the final use site geometry, root viewBox, font/size and whether an existing source asset is already exactly identical before import.
2. Do **not** hardcode the sample Employee portrait (`female 1`, Figma node `66:72048`) as a real employee image. The visible photo must come from approved user-owned profile data or a previously approved empty state with correct privacy.
3. Remaining Figma vectors and source images can be exported with the same Figma Plugin API route. The earlier blocked `www.figma.com/api/mcp/asset/*` proxy downloads are **not required** for these six assets. For each additional asset, use the actual node ID and `exportAsync`, not screenshots or redraws.
4. For final 1:1 screen parity, WS06 must still implement and test the verified fields, controls and disabled states, using reviewed local assets. Original PR #42 remains separate and unmerged; WS06 owns the Employee feature code.
5. Independent QA by WS04 and production release by WS05 remain required; this branch is not a deployment or 1:1 approval.
