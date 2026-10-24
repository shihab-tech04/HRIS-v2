# HRIS Phase 11 source-controlled activation — October 24, 2026

## Basis
- Main source at staging: `33557f9a4d2a48345e9648e356db6ccc1145ae5e`.
- Replacement Supabase: `xfuxnljfrgvusbrpvxpa`; original `oslgwxaqfbteqtwqvdzs` NEVER MODIFY.
- Phase 10 Projects schema and guarded Super Admin tenant membership already hosted; do not repeat.
- Historical Auth import waived; preserve all historical data and references. Qualified encrypted isolated backup available.
- No frontend, route, UX or Candidate changes in this PR.

## Canonical source mappings
1. `20261024183501_hris_project_tasks_forward_port.sql` is comment-header + exact body of `20261013100001_hris_project_tasks_and_peer_reviews.sql` (source blob `e2c8fac2fce106417cebd60d37c2fbed9382fc93`).
2. `20261024183502_hris_peer_review_eligibility_forward_port.sql` is comment-header + exact body of `20261013184000_hris_peer_review_eligibility_enforcement.sql` (source blob `62020c815cef79ad969360a1e87b3eb418b0d71b`).
3. `20261024183503_hris_peer_review_notifications_forward_port.sql` is comment-header + exact body of `20261013222433_hris_peer_review_in_app_notifications.sql` (source blob `beebc20ef789b03c8555255814752bab19d995dd`).
4. `20261024183504_hris_project_task_edit_forward_port.sql` is comment-header + exact body of `20261013224251_hris_project_task_edit_workflow.sql` (source blob `c7ffda78acee27039522e55c1556a6f49f786543`).
5. `20261024183505_hris_project_manager_portfolio_forward_port.sql` is comment-header + exact body of `20261013225608_hris_project_manager_task_portfolio.sql` (source blob `ad15063d9596bfb1167bf7137565c63991ffdb6e`).

## Deployment order and checks
1. Protected Main merge only after review/current-head CI and source-body parity.
2. Automatic **isolated** PG17 workflow uses pinned encrypted backup, replays Phase 10 then all five Phase 11 SQL files, verifies tables, RLS, grants and RPC signatures. This proof does NOT apply hosted DDL.
3. Before each hosted migration, independently verify current replacement migration journal and table/RPC absence, fresh restorable backup coverage, no unintended source drift, and migration dependency/permissions.
4. Apply the five forward-only files **in order** via version-recording Supabase migration API, replacement project only.
5. Verify per-file migration entries, table constraints and RLS, anonymous/direct-write denial, authenticated tenant/project manager positive/negative flows, notifications, peer-review editing and rejection/errors.
6. Project-scoped timesheets require a separate, reviewed migration because canonical source changes existing timesheet functions and current behavior. Never claim Timesheets released from this PR.
7. Record outcomes in issue #91, including actual failures and remaining release gates.

**STATUS:** staging-only source artifacts. Not certified for hosted execution until the isolation and acceptance gates pass.
