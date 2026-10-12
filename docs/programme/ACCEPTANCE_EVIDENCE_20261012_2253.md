# Acceptance Evidence — Attendance Report, Accessible Filters and CSV Safety

Date: 2026-10-12 22:53 Asia/Dhaka  
Phase/module: Phase 08 — Attendance Report and shared CSV writer  
Main implementation commit: f64623bc7123feeed94b70e9531703acb19e8ebf.

## Implemented behavior

- The Figma aggregate toolbar is Search → Download Report → Filters, sized 334px/184px/64px on desktop, using local Figma assets.
- The Filters button's aria-controls target remains present while hidden; aria-expanded synchronizes with panel visibility.
- Shared CSV export prefixes text whose first non-whitespace character is =, +, - or @ with an apostrophe so spreadsheet apps treat formula-like user data as text.
- Finite numeric values and simple numeric strings remain numeric, including negative values such as -0.7.
- This shared writer is used by Managerial Dashboard, Attendance, Shift Roster and Personal Leave exports. Existing filenames, headers, sorting and filtering remain unchanged.

## Verification results

- npm run check: TypeScript/build PASS; 42/42 contracts PASS.
- Focused Attendance browser journey: 1/1 PASS. It downloads a synthetic =HYPERLINK employee-number cell and asserts that the CSV contains the apostrophe prefix, then verifies a numeric -0.7 deviation is unchanged.
- Full Chromium suite on isolated local port 4248: 38/38 PASS.
- Local disposable Auth/RLS suite: 65/65 PASS at 22:15. No SQL or authorization code changed after the run; all five previously failing tenant-security cases pass.

No production calls, data, permissions or paid services were used. Browser Auth/RPC calls are synthetic and external requests are blocked. The previous large-bundle advisory remains.

## Canonical story status

User-reported catalogue: 1,047 stories / 153 modules, expected SHA-256 c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520. The mounted Project sources directory is empty, and exact-name Drive search returns no matrix. The repository tracking skeleton remains empty at SHA-256 456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996.

Canonical story status is 0/1,047 mapped and tested against authoritative text; 1,047 pending. This does not count product features. No IDs or requirement text were inferred.

## Release boundary

No GitHub push, deployment, production modification, or complete source archive upload occurred. The existing source archive predates current changes and remains untouched.
