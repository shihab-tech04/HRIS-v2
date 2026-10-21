import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261021084635_leave_types_authenticated_read_only_acl.sql');
const sourceContract = read('../../supabase/migrations/20261016142000_hris_leave_type_policy_management.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const overgrant = read('../sql/isolated-auth/overgrant-leave-types-for-hosted-parity.sql');
const workflow = read('../../.github/workflows/disposable-auth-postgres-acceptance.yml');

test('leave_types client ACL is read-only while retaining the authenticated RLS SELECT path', () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.leave_types\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.leave_types TO authenticated/);
  assert.doesNotMatch(migration, /FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sourceContract, /REVOKE INSERT, UPDATE, DELETE ON public\.leave_types FROM PUBLIC, anon, authenticated/);
  assert.match(sourceContract, /GRANT SELECT ON public\.leave_types TO authenticated/);
  assert.match(sourceContract, /REVOKE ALL ON FUNCTION public\.hris_save_leave_type\(uuid,uuid,jsonb,jsonb\) FROM PUBLIC, anon/);
  assert.match(sourceContract, /GRANT EXECUTE ON FUNCTION public\.hris_save_leave_type\(uuid,uuid,jsonb,jsonb\) TO authenticated, service_role/);
});

test('the two-tenant real-Auth runner reproduces hosted overgrants before the ACL fix', () => {
  assert.match(overgrant, /GRANT ALL PRIVILEGES ON TABLE public\.leave_types TO PUBLIC, anon, authenticated/);
  assert.ok(runner.includes('overgrant-leave-types-for-hosted-parity.sql'));
  assert.ok(runner.includes('20261021084635_leave_types_authenticated_read_only_acl.sql'));
  assert.match(runner, /Leave policy writes require active same-tenant leave\.manage and cannot bypass the RPC/);
  assert.match(runner, /Tenant leave managers can configure existing leave policy fields with idempotent create, optimistic edits, audit, and employee visibility/);
  assert.match(runner, /policyStaleUpdate\.error\?\.code === '40001'/);
  assert.match(runner, /policyCrossTenant\.error\?\.code === '42501'/);
});

test('the exact WS02 branch runs the disposable Auth and RLS acceptance workflow', () => {
  assert.match(workflow, /work\/ws02-production-view-security-20261021/);
  assert.match(workflow, /Run real local Auth\/RLS and workflow acceptance/);
  assert.match(workflow, /Start disposable local Auth, Postgres and Storage/i);
  assert.doesNotMatch(workflow, /supabase db push|apply_migration|merge_branch/i);
});
