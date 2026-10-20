# HR03-01 — legal entity management contract gap

**Status: BLOCKED ON AN ABSENT OR UNAPPROVED CONTRACT.**

## Read-only evidence

- Production Supabase migration head: `20261020044145`.
- The read-only catalog inventory found `public.tenants` columns `id`, `slug`, `code`, `name`, `is_active`, `created_at`, `updated_at`, `timezone`, and `default_locale`.
- The deployed schema has no `legal_entities` relation and no `legal_entity_name` tenant column.
- The application source contains only the static tenant settings view (`src/views/admin/TenantSettings.tsx`) and mock contract data (`MOD-010` in `src/sql/contracts.ts`) for legal entities; no live tenant-scoped legal entity API/RPC or tested SQL contract is present.

## Missing contract

The story “As HR, I want to manage legal entities” does not specify whether a tenant can own multiple legal entities, required attributes and uniqueness, which HR roles can create/update/deactivate them, or how an entity is related to employees and preserved in employment history. Those choices affect tenant data, authorization, employee records, and the API/SQL contract. They cannot be inferred safely from the current `tenants.name` field.

The application workstream is not authorized to change production schema or migration history, and no legal-entity contract or schema/API approval is present. Therefore HR03-01 cannot advance to implementation or acceptance at this checkpoint. Resume after the legal-entity model, permissions, and migration/API ownership are approved; keep subsequent Phase 05 stories in order.

No production data, schema, permissions, migration history, or deployment was changed.
