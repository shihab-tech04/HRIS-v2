# WS05 cross-app hosted parity closure — verified gap inventory

Date: 2026-10-24. Scope: replacement HRIS Supabase `xfuxnljfrgvusbrpvxpa` ONLY. Original `oslgwxaqfbteqtwqvdzs` MUST NOT be changed.

Main `main`: `783bdd62663e6b9a4fb4290f60f7b20f8204c84a`.
Candidate `main`: `5236f84ccedd8c1224005b11561bf6810541199c`.

## Verified baseline (read-only)

- WS02 Phase B target preflight: **15 / 15 true** on replacement hosted project at this audit.
- Frontend contract name + role probe: **77** explicit callsites in 16 inspected Main/Candidate files, **38** have a same-named public RPC executable by authenticated, **39** have no same-named public RPC. The 38 are *not* guaranteed compatible signatures, JSON shapes, or security; the 39 can include intentionally deferred feature routes.
- A SQL catalog check confirmed these core project relations are **missing**: `public.projects`, `public.project_allocations`, `public.project_tasks`, `public.project_task_assignees`, `public.project_timesheet_reviews`.
- Candidate assessments/documents/jobs/interviews/offers/onboarding tables already **exist** on hosted; mere table existence does not imply RPC/RLS business readiness.
- The source migrations listed below are **already committed** on Main; do not author duplicate migrations or install all files indiscriminately. The restored clone uses distinct migration-history versions and some source migrations may already be reflected in equivalent hosted DDL.

## Exact source function → reviewed migration lookup

| Frontend RPC currently missing hosted | Existing source migration |
| --- | --- |
| `hris_get_recruitment_pipeline` | `20261013130829_hris_recruitment_pipeline_read.sql` |
| `hris_schedule_candidate_interview`, `hris_get_candidate_interview_responses` | `20261013221500_hris_candidate_interview_journey.sql` |
| `hris_issue_candidate_offer` | `20261013132335_hris_recruitment_offer_issue.sql` |
| `hris_assign_candidate_assessment`, `hris_get_candidate_assessments`, `hris_review_candidate_assessment` | `20261013170556_hris_candidate_assessment_journey.sql` |
| `candidate_get_my_preboarding_handoff`, `candidate_save_my_preboarding_step`, `hris_get_candidate_preboarding_queue` | `20261013190200_hris_candidate_preboarding_workflow.sql` |
| `hris_activate_candidate_employee` | `20261014070848_hris_candidate_employee_activation.sql` |
| `hris_update_candidate_application_stage` | `20261014012249_recruiter_application_stage_transition.sql` |
| `hris_get_tenant_payroll_register` | `20261014120000_hris_tenant_payroll_register_read.sql` |
| `hris_get_tenant_project_workspace`, `hris_create_tenant_project`, `hris_assign_tenant_project_allocation`, `hris_release_tenant_project_allocation` | `20261013090000_hris_projects_and_allocations_tenant_scope.sql` |
| `hris_get_my_attendance_period` | `20261013215431_employee_dashboard_attendance_period_read.sql` |

These are direct checks of `CREATE [OR REPLACE] FUNCTION` in committed migration text, NOT proof those migrations can be safely replayed on the replacement clone. The migration list is partial: remaining function-to-migration mappings still require inspection.

## Strict execution order — no destructive hosted shortcut

1. **WS02** diff hosted `pg_catalog` schema/ACL/policies against reviewed source and map all 39 missing names, their actual parameter lists, return JSON contract and precise table dependencies. Prefer an approved existing function in UI only if arguments, return shape and authority are identical; do not create weak public `SECURITY DEFINER` aliases.
2. **WS02 + WS05** prove all preconditions on the *actual* replacement environment; obtain encrypted off-GitHub hosted SQL/Auth/Storage/config backup and independent restore/rollback proof. Existing Git archives do **not** satisfy the hosted database backup requirement.
3. **WS02 isolated QA** verify source migrations and operational RLS on two independently authorized tenants, real Auth/JWT, Admin and Candidate, private Storage, cross-tenant negative tests and revoked sessions. Do not seed production with fake users, skip approval, or touch original project.
4. **WS07/WS03/WS06/WS08** reconcile exact frontend contracts and validate protected role workflow, status and EN/BN state/viewport screenshots without replacing solved Material shell.
5. **WS04** independently certify exact story IDs and critical Admin → SQL → Candidate workflows: job publish → discovery → application → screening → interview → assessment → offer → preboarding → authenticated employee record.
6. **WS05** only after all safety, backup, testing and protected-merge gates pass: apply reviewed parity changes to the replacement environment, confirm full signed-in acceptance, publish the guarded Main/Candidate release and verify production assets and backend state.

## Release verdict

**HOLD / NOT 100% SYNCHRONIZED / DO NOT DISPATCH MAIN PRODUCTION RELEASE.**

No hosted mutation was performed to gather this evidence.
