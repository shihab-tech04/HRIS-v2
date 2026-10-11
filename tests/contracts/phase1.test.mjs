import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = (name) => fs.readFileSync(name, 'utf8');
test('additive RLS migration contains restrictive tenant guards for sensitive HRIS reads', () => {
  const sql = source('supabase/migrations/20261011_01_hris_phase1_tenant_read_guard.sql');
  for (const table of ['employees','departments','leave_requests','leave_types']) {
    assert.match(sql, new RegExp('CREATE POLICY hris_' + table + '_tenant_read_guard ON public\\.' + table + '[\\s\\S]+?AS RESTRICTIVE FOR SELECT TO authenticated'));
  }
  assert.match(sql, /p_tenant_id = public\.synesis_tenant_id\(\)/);
  assert.match(sql, /public\.has_permission\(p_permission_id\)/);
  assert.match(sql, /public\.is_live_session\(\)/);
  assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
});
test('real workspace uses membership, linked employee and legacy Synesis admin sources', () => {
  const app = source('src/live/LiveApp.tsx');
  for (const name of ["from('tenant_memberships')", "from('employees')", "from('admin_users')"]) {
    assert.ok(app.includes(name), 'Missing ' + name);
  }
  assert.match(app, /slug\s*===\s*'synesis-it'/);
  assert.match(app, /canAdminSelectedTenant\s*\?\s*supabase\.from\('employees'\)/);
  assert.match(app, /previewEnabled\s*&&/);
});
test('preview audit is explicitly not an authenticated database RLS certification', () => {
  const suite = source('src/tests/automatedSuite.ts');
  assert.match(suite, /PARTIALLY_COMPLETED_WITH_BLOCKERS/);
  assert.match(suite, /does not authenticate test identities/i);
  assert.doesNotMatch(suite, /verdict:\s*'PASS'[\s\S]{0,180}responsive/i);
});
test('production deployment uses Vite build artifact rather than source tree', () => {
  const action = source('.github/workflows/deploy-pages.yml');
  assert.match(action, /path: dist/);
  assert.match(action, /GITHUB_PAGES:\s*'true'/);
});

test('anonymous RPC grants are revoked in the tracked compensating migration', () => {
  const migration = source('supabase/migrations/20261011_02_hris_revoke_anon_helpers.sql');
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_own_employee_for_tenant\(uuid\) FROM anon;/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_admin_can_read_tenant\(uuid, text\) FROM anon;/);
});
