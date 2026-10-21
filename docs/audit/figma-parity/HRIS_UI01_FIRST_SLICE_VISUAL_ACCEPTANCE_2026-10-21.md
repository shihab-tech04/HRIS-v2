# WS04 independent acceptance of first Figma-first UI slice — 21 October 2026

Approved Figma `XEXLe9J1oATlITS9I5u1P9`: desktop attendance frame `17:28320` (1920×1117) and leave `17:31769` (1920×1080). Direct rendered Figma inspection: 110px left navigation, white top bar, heading **Attendance & Leave Application Management**, four tabs **Attendance Information / Attendance Requests / Leave Requests / Personal Leave Application History**, pale workspace background. On-screen heading inside attendance is **Attendance Report**; do not confuse frame-layer name with displayed text.

Implementation to review: [Main PR #49](https://github.com/shihab-tech04/HRIS-v2/pull/49), original dev source `2a5fe5f`. Changes visible heading and current/available route tabs in `src/live/LiveHrisWorkspace.tsx`, preserves working reports and Auth/permission checks, and does not invent request API/counter data.

## Acceptance still required — NO PASS claimed
- CI lint, build, TS/contracts, generated Pages assets, and exact PR head.
- Compare signed-in role `attendance` 1920x1117 screenshot to Figma `17:28320`, and `leave` 1920x1080 to `17:31769`; then 1280/768/375 and focus/keyboard/EN-BN.
- Figma request states `17:29937 / 17:30342 / 17:30766 / 17:31148`, leave bulk/approve/reject `17:32168 / 17:32584 / 17:32957` remain **UNVERIFIED**. Do not equate a visible tab with a completed journey.
- Preserve role/tenant isolation and existing leave calendar, policies, corrections and other modules.
- Do not insert fictitious badge counters, mock employees or success responses.
- Primary Figma `#08558B` versus app `#085587` requires canonical decision, no silent recolor.

Disposition: CODE SUBMITTED FOR REVIEW, Figma 1:1 NOT CERTIFIED, production RELEASE HOLD. WS05 sole merge/deploy.
