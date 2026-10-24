import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261014133000_harden_public_foundation_tables.sql', import.meta.url), 'utf8');
const liveApp = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

const tables = [
  'employee_shift_assignments', 'tenants', 'admin_users', 'roles', 'permissions',
  'role_permissions', 'user_roles', 'tenant_memberships', 'admin_audit_logs',
];

test('advisor-flagged public foundation tables enable RLS and revoke broad direct grants', () => {
  for (const table of tables) assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  const revoke = migration.match(/REVOKE ALL PRIVILEGES ON TABLE([\s\S]*?)FROM PUBLIC, anon, authenticated/);
  assert.ok(revoke, 'all advisor-flagged tables must be covered by the direct-grant revocation');
  for (const table of tables) assert.match(revoke[1], new RegExp(`public\\.${table}`));
  assert.doesNotMatch(migration, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)\s+ON\s+TABLE/i);
});

test('only the existing identity and tenant-list projections retain row-limited reads', () => {
  assert.match(migration, /GRANT SELECT ON TABLE public\.tenant_memberships, public\.admin_users TO authenticated/);
  assert.match(migration, /user_id = \(SELECT auth\.uid\(\)\) AND \(SELECT public\.is_live_session\(\)\)/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.tenants TO authenticated/);
  assert.match(migration, /public\.hris_is_active_tenant_member\(id\)/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(id\) IS NOT NULL/);
  assert.match(migration, /a\.is_super_admin IS TRUE/);
  assert.match(liveApp, /from\('tenant_memberships'\)/);
  assert.match(liveApp, /from\('admin_users'\)/);
  assert.match(liveApp, /from\('tenants'\)/);
  assert.match(runner, /Foundation tables deny anonymous access and default-deny direct reads/);
  assert.match(runner, /LiveApp foundation reads are restricted to own membership\/admin row/);
  assert.match(runner, /Foundation table direct mutations are denied/);
});
