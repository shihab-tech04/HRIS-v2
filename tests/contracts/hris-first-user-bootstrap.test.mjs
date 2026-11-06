import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/20261106090000_hris_new_workforce_account.sql',import.meta.url),'utf8');
const edge = readFileSync(new URL('../../supabase/functions/admin-create-user/index.ts',import.meta.url),'utf8');
const client = readFileSync(new URL('../../src/live/realUserProvisioningApi.ts',import.meta.url),'utf8');
const ui = readFileSync(new URL('../../src/live/RealUserProvisioningReadiness.tsx',import.meta.url),'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/disposable-auth-postgres-acceptance.yml',import.meta.url),'utf8');

test('HRIS supports administrator creation of the first login without an existing employee', () => {
  assert.match(ui, /newEmployee: 'Create new employee'/);
  assert.match(ui, /hris-new-user-name/);
  assert.match(ui, /currentValue\.assignableRoles\.length \? \(/);
  assert.match(ui, /employeeId === 'new'/);
  assert.match(client, /createNewEmployee = input\.employeeId === 'new'/);
  assert.match(client, /createNewEmployee,\s*displayName/);
  assert.match(edge, /createNewEmployee \? "admin_finalize_new_workforce_user" : "admin_finalize_system_user"/);
  assert.match(edge, /finalized\?\.tenant_id !== tenantId/);
  assert.match(edge, /finalized\?\.role_id !== roleId/);
  assert.match(edge, /adminClient\.auth\.admin\.deleteUser\(created\.user\.id\)/);
});
test('new user/employee records commit atomically and only within authorized active tenant', () => {
  assert.match(sql,/CREATE FUNCTION public\.admin_finalize_new_workforce_user/);
  assert.match(sql,/current_setting\('role',true\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql,/m\.tenant_id=p_tenant_id/);
  assert.match(sql,/rp\.permission_id='admin_users\.manage'/);
  assert.match(sql,/r\.id=p_role_id AND r\.active=TRUE AND r\.is_system=FALSE/);
  assert.match(sql,/requested\.role_id=p_role_id/);
  assert.match(sql,/INSERT INTO public\.admin_users/);
  assert.match(sql,/INSERT INTO public\.user_roles/);
  assert.match(sql,/INSERT INTO public\.tenant_memberships/);
  assert.match(sql,/INSERT INTO public\.employees/);
  assert.match(sql,/INSERT INTO public\.admin_audit_logs/);
  assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*?TO service_role/);
  assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE|DELETE FROM auth\.users/i);
});
test('SQL acceptance runs in an isolated PG17 transaction that is rolled back', () => {
  assert.match(workflow,/hris-first-user-migration-check\.mjs/);
  const source = readFileSync(new URL('../sql/isolated-auth/hris-first-user-migration-check.mjs',import.meta.url),'utf8');
  assert.match(source,/synesis-local-hris-test/);
  assert.match(source,/'BEGIN;'/);
  assert.match(source,/'ROLLBACK;'/);
  assert.match(source,/has_function_privilege\('authenticated'/);
});
