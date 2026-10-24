# WS02 Phase 05-A — HR01 contact RPC forward-only reconciliation
Date: 2026-10-20 (Asia/Dhaka)
Status: SOURCE-BACKED PROPOSAL ONLY; NOT MIGRATED, NOT HOSTED-CERTIFIED
Owner: WS02 API/security; approval/release: WS05 only
Scope: HR01 contact detail read/update dependencies for WS01. No production database writes or grants in this checkpoint.

## Read-only hosted evidence
- Hosted HRIS project: `oslgwxaqfbteqtwqvdzs`.
- `to_regprocedure('public.hris_get_tenant_employee_contact_details(uuid,uuid)')`: **absent**.
- `to_regprocedure('public.hris_update_tenant_employee_contact_details(uuid,uuid,jsonb)')`: **absent**.
- Dependencies `public.has_tenant_permission(uuid,text)`, `public.admin_audit_logs`, `public.employees`, and `public.tenants`: present (object existence only, not functional/authorization certification).
- `supabase_migrations.schema_migrations` has `20261020044145` but lacks original source version `20261014171952`. The deployed later head does **not** prove the earlier source migration was applied.
- Evidence was obtained from read-only SQL; no test tenant was created and no user or production row was changed.

## Frozen source contract
Source file: `supabase/migrations/20261014171952_employee_contact_details_editing.sql` on `development/hris-checkpoints` (blob SHA `17994a63a8b7ae17a6bc12bbbb7165dd3254e093`).

- Read: `public.hris_get_tenant_employee_contact_details(p_tenant_id uuid, p_employee_id uuid) RETURNS jsonb`.
- Write: `public.hris_update_tenant_employee_contact_details(p_tenant_id uuid, p_employee_id uuid, p_contact_details jsonb) RETURNS jsonb`.
- Both are `SECURITY DEFINER` with explicit `search_path = ''`. Both require valid IDs, an active tenant, `employees.manage` for that tenant, and an employee belonging to that tenant.
- The write contract allows **exactly** nine string-or-null fields: `official_email`, `personal_email`, `phone`, `official_phone`, `address`, `mailing_address`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relation`. Reject extras, missing keys, wrong types, duplicate official email, and invalid lengths per canonical source.
- Update obtains an employee row lock and audits **changed field names only**, never contact values.
- Source function ACL explicitly revokes `PUBLIC`, `anon`, and `service_role` EXECUTE, grants `authenticated` EXECUTE. The `SECURITY DEFINER` exposure and every effective grant must undergo separate review; do not use blanket grants or service-role bypasses.

## Smallest safe remediation candidate
1. WS02/WS01 compare the original migration body with current deployed column definitions, trigger/policy behavior, owner and effective ACLs and with PR #48's integration changes. Use read-only checks in hosted and synthetic databases. Never assume dependencies are compatible just because objects exist.
2. Prepare a **new forward-only, uniquely versioned migration proposal** that implements the canonical two signatures and the documented ACL/tenant checks if source-backed compatible. Preserve the original 20261014171952 file and history; do not retroactively insert history or blindly replay its old version.
3. In disposable two-tenant Auth/Postgres, test authenticated authorized in-tenant HR/Admin manager, denied inactive/unauthorized/anonymous user, denied different-tenant employee, nonmember despite a nominal role, and a user lacking `employees.manage`. Assert error codes and zero cross-tenant reads or writes.
4. Test nine-field normalization/validation, extra/missing/wrong-type rejection, official-email conflict, changed-field-name-only audit, and unchanged row on failure. Confirm no direct client table update is needed. Confirm the read and update paths match existing UX, including scope of employee-self-service requests (which are a separate permission contract; this RPC does not automatically authorize E02 self-service).
5. Require WS04 independent exact-story evidence, WS05 protected review, backup checksum, read-back and tested restore, migration-order verification, exact-head CI and approved release plan **before** any hosted application. After guarded release, perform authenticated hosted HR/Admin and negative cross-tenant checks and log deployed head.

## Dependencies, decisions, and explicit non-results
- PR #39: WS02 evidence (this file); PR #48: integration/security review (not evidence of these functions existing in production). WS01 owns HR01 implementation and exact story-ID tests, WS06 owns E02, WS05 alone owns protected merges/deployments.
- **Undecided / blocked:** compatible forward migration, approved owner and grants, independent signed-in role sessions, tenant membership for System Administrator, hosted negative tests, backup/restore proof. These are NOT silently passed.
- **No claim:** neither RPC was created; no schema was migrated; no case/HR01 story was certified; no production or user data was touched.
