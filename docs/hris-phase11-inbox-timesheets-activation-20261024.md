# HRIS source parity — unified notifications and project-scoped timesheet review

Base: `414d8854335ab629a51cc8054837a2bc32f0a5a4`. Target replacement Supabase: `xfuxnljfrgvusbrpvxpa` only.

Canonical SQL body provenance:
- `20261024190001_hris_system_notifications_forward_port.sql` copies `20261014160002_hris_system_notifications_inbox.sql` (Git blob `5122036a51618d0d16050c83ad850fd24e022d19`) without functional changes.
- `20261024190002_hris_project_timesheet_review_forward_port.sql` copies `20261016033936_hris_project_scoped_timesheet_review.sql` (Git blob `fcc6cc9742b0afd863b5dad263585852de73644e`) without functional changes.

Scope: one unified notification read RPC and project-scoped timesheet review tables, RLS, RPCs. The timesheet migration changes existing `hris_save_my_timesheet` and related function behavior and grants, so this requires an isolated PG17 workflow, existing-timesheet contract regression, authorized browser acceptance and a fresh replacement DB backup/recovery checkpoint before hosted migration.

This PR is **source-only staging**; no hosted DDL, new users, frontend redesign or production release. Preserve successful tasks and approved design systems. Do not bypass historical Auth FK exception controls or tenant isolation. Original Supabase remains immutable.

Release order: reviewed PR -> protected Main merge -> isolated PG17 replay PASS -> post-Phase11 fresh backup/recovery -> guarded versioned hosted migration in sequence -> RLS, tenant-positive/negative, and authenticated timesheet browser regression PASS -> issue #91 evidence.