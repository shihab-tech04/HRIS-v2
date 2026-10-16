# Acceptance Evidence — Attendance Report Toolbar

Date: 2026-10-12 22:42 Asia/Dhaka  
Phase/module: Phase 08 — Attendance Report aggregate toolbar  
Main commit: 7fc4135bfe1a6d7d520bf089be2e4498e7522b12

## Implemented behavior and Figma alignment

The aggregate Attendance Report toolbar is ordered Search → Download Report → Filters. Desktop widths are 334px, 184px and 64px. The controls use local Figma assets; existing search submit, CSV export, filter open/close and permission gating are retained.

- Search asset from Figma node 17:28123: SHA-256 adf5fe979d56403d079ac9b996404fe4b7079c974b663636b9a500ca570d391b.
- Download asset from Figma node 17:28132: SHA-256 a42f6bc68f2d0bb32fa25d5c0b7b34c1d950f55533b6ed58c7c01937b58ef000.
- Filter asset from Figma node 17:28140: SHA-256 158fa6f72b551cf98ff5982aa7de0793a2d7efd02957889cc528d61e4a33e9ba.
- Prior Team sort asset from node 17:28334 remains local and unchanged.
- Browser assertions check control order, widths, image dimensions and local asset loading. No temporary Figma URLs are referenced by the application.

Evidence: tests/browser/attendance-information.spec.ts; tests/contracts/attendance-report.test.mjs; docs/evidence/attendance-report-desktop-20261012.png; docs/evidence/attendance-report-mobile-20261012.png.

## Verification results

- npm run check: TypeScript and Vite build PASS; 40/40 contracts PASS.
- Focused Attendance Report browser journey: 1/1 PASS.
- Full Chromium suite on isolated local port 4248: 38/38 PASS.
- Local disposable Auth/RLS suite: 65/65 PASS at 22:15. No security SQL or authorization code changed after this run. All five formerly failing tenant-security cases pass.

The first full-suite attempt used the default 4173 port and loaded a stale local Auth runtime, producing 31 failures, 3 interrupted and 4 not run. The correct isolated-port rerun passed 38/38. This environment error is recorded for transparency and is not a product failure.

## Canonical story status

User-reported catalogue: 1,047 stories / 153 modules, expected SHA-256 c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520. The mounted Project sources directory is empty; exact-name Drive search found no matrix. The repository skeleton remains empty and has SHA-256 456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996.

Canonical status is 0/1,047 mapped and fully tested against the source text; 1,047 pending. This status does not represent the number of existing product features. No IDs or requirement text have been inferred.

## Release boundaries

No production data, permissions, Auth settings or migrations changed. No paid Supabase service, GitHub push or deployment was used. Whole-page and product-wide Figma parity remain incomplete.
