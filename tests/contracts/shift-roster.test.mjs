import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql', import.meta.url), 'utf8');

test('shift roster is exposed only to attendance view or manage memberships', () => {
  assert.match(workspace, /permissions\.attendanceView \|\| permissions\.attendanceManage[\s\S]+?label: 'Roster'/);
  assert.match(workspace, /page === 'shift-roster' && \(permissions\.attendanceView \|\| permissions\.attendanceManage\)/);
  assert.match(workspace, /rpc\('hris_get_tenant_shift_roster_data'/);
  assert.doesNotMatch(workspace, /from\('employee_shift_assignments'\)/);
});

test('roster RPC binds assignments, employees, shifts, and departments to the requested tenant', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id, 'attendance\.view'\)/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id, 'attendance\.manage'\)/);
  assert.match(migration, /a\.tenant_id=p_tenant_id/);
  assert.match(migration, /e\.tenant_id=p_tenant_id/);
  assert.match(migration, /s\.tenant_id=p_tenant_id/);
  assert.match(migration, /d\.tenant_id=p_tenant_id/);
  assert.match(migration, /FROM PUBLIC, anon/);
  assert.match(migration, /TO authenticated, service_role/);
});
