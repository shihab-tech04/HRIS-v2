# Phases 03–04 — Tenant lifecycle and Auth/RLS security readiness

> **19 October addendum:** The narrowly scoped legacy `public.notices` restrictive guard is now **live** as hosted migration `20261019013043` (`hris_notices_legacy_security_guard_20261019`). It restricts the old `notices_read` policy while preserving projected legacy administrator access; see [the live deployment record](PHASE04_LIVE_NOTICES_GUARD_2026-10-19.md). The full missing membership helper chain, all 25 parity checks and the Phase 03–04 acceptance gates remain **open**. The 18 October findings below remain a historical pre-repair snapshot.

**Phase 03 staged engineering: previously Auth/Postgres/browser tested; not released. Phase 04 source regression: PASS; hosted security certification: BLOCKED.** These are explicit checkpoints, **not completed release phases**.

## Phase 03: SaaS tenant lifecycle

- `src/live/platformTenantApi.ts` and `PlatformTenantWorkspace.tsx` are guarded by `VITE_ENABLE_PLATFORM_TENANTS=true`. All seven `platform_hris_*` endpoints used by the frontend are in `supabase/staging/phase2a` or `phase2b`; none is in versioned migrations. They are intentionally not in the live public UI.
- Staged SQL authorizes the active platform Super Admin server-side, requires an existing confirmed Auth account for the first tenant administrator (including email lookup), normalizes tenant data, audits the actor, blocks duplicate or incompatible membership assignment, and leaves every new tenant **inactive pending certification**.
- The last exact-head development branch ran the dedicated tenant provisioning disposable Auth/Postgres/browser workflow successfully (61 assertions, [Main Actions run 39147470469](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39147470469)). The 18 October local source regression suite also passed. This is **not** a hosted activation test.
- The current managed workspace lacks `docker`, `supabase` and `psql` CLIs, so it cannot safely instantiate the dedicated disposable stack. The purpose-built runner refuses non-disposable projects; it must never be redirected to the hosted production database as a workaround.

## Phase 04: current hosted read-only security evidence

Host: HRIS Supabase `oslgwxaqfbteqtwqvdzs`. Database catalogs and the Supabase security advisor were queried read-only on 18 October. No user records were extracted, no production permission changed.

| Finding | Verified significance | Decision |
| --- | --- | --- |
| Gate B exact SQL/API contract **0/25 PASS** | 14 source callable signatures absent, 1 trigger helper missing, 4 prerequisites absent, 4 obsolete profile overloads remain, 2 RLS predicate/policy gaps | Block source-compatible live release; reconcile real object dependencies before DDL |
| `has_tenant_permission(uuid,text)` and `hris_is_active_tenant_member(uuid)` absent | Main permission resolution and multiple newer restrictive policies depend on these helpers | Deploy/test dependency chain only after controlled migration provenance |
| `public.notices` retains permissive `notices_read` with `(active = true) OR has_permission('notices.manage')` | The predicate has no tenant condition, while the restrictive `hris_notices_membership_guard` migration is absent | **Security risk** requiring negative cross-tenant Auth/RLS tests and the staged restrictive fix before release; not yet a demonstrated exploit |
| Supabase security advisor: **24 RLS-enabled tables with no policies (INFO)** | These tables default-deny through RLS; the advisory by itself does not prove an information leak | Audit intended RPC-only vs direct table accessibility; do not open broad policies just to silence lint |
| Advisor: **1 anonymous-executable security-definer function (WARN)** | `candidate_public_jobs_source()` is intentionally public-facing and has a source-verified filter for active/published, unexpired Synesis vacancies; hidden salary bounds are nulled | Keep only if public access is intentional; test no draft/expired/foreign vacancy or confidential fields leak |
| Advisor: **211 signed-in-executable security-definer functions (WARN)** | Some are necessary sanctioned RPCs; the advisor is a review queue, not 211 proven vulnerabilities | Audit privileges, search path, identity/tenant checks, arguments and row impact individually |
| Hosted SQL migration history: 111 entries versus 98 local versioned files, zero timestamp-ID matches | Timestamps/names differ even when logic may be equivalent | Compare object-level definitions, dependencies and prior applied effects; do not replay all migrations or rewrite history |

The hosted catalog confirms expected basic types: `tenant_memberships.role` and `roles.id` are `text`; `role_permissions.role_id` is `text`; tenant and notice IDs are `uuid`. That removes one obvious type mismatch from the prospective helper migration, but does **not** verify all constraints, extension versions or function bodies.

## Controlled gate order

1. Freeze/read back the hosted schema-only inventory, policy/role grants, migration history and needed dependencies. Identify already-applied semantic equivalents; capture a recoverable pre-change backup during Phase 21 release planning.
2. Rehearse the precise missing tenant membership and permission helpers, roster notification prerequisites and profile-change API transitions on an **isolated disposable** Postgres/Auth stack. Re-run cross-tenant, anon, inactive-role, stale-session and direct-table negative tests; validate no accidental grants.
3. Re-run all 25 catalog checks in the disposable environment, then Main/Candidate authenticated browser→RPC→Postgres journeys, EN/BN and 375px/1280px. Test the `notices` policy under two tenants with real Auth accounts.
4. Assess all 212 warned security-definer executions for actual need and the 24 no-policy tables for deliberate deny-by-default intent. Treat user-data and policy changes as production-sensitive.
5. Only after passing story-level Phase 20 evidence and final Phase 21 security/backup sign-off, promote the reconciled and rehearsed changes using the controlled release process. Never silently activate newly created tenants.

**Phase 03/04 production acceptance remains open.** In this execution the code-only contracts pass, and new read-only risk classification replaces unqualified warning counts. There has been no hosted SQL, tenant, permission or application deployment change.
