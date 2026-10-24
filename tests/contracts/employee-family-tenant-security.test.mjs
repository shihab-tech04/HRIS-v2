import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261016171104_employee_family_tenant_scoped_read.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/employee-family-postgres.yml', import.meta.url), 'utf8');

test('family-record administrator access resolves permission through an active tenant membership', () => {
  assert.match(migration, /JOIN public\.tenant_memberships tm[\s\S]*tm\.tenant_id = e\.tenant_id[\s\S]*tm\.user_id = auth\.uid\(\)[\s\S]*tm\.status = 'active'/);
  assert.match(migration, /JOIN public\.roles r[\s\S]*r\.id = tm\.role[\s\S]*r\.active = true/);
  assert.match(migration, /JOIN public\.role_permissions rp[\s\S]*rp\.role_id = r\.id[\s\S]*rp\.permission_id IN \('employees\.view', 'employees\.manage'\)/);
  assert.match(migration, /JOIN public\.tenants t[\s\S]*t\.id = e\.tenant_id[\s\S]*t\.is_active = true/);
  assert.doesNotMatch(migration, /public\.(?:has_permission|hris_admin_can_read_tenant|synesis_tenant_id)\s*\(/);
});

test('family rows remain owner-scoped and admin membership is bounded by restrictive RLS', () => {
  assert.match(migration, /e\.user_id = auth\.uid\(\)/);
  assert.match(migration, /CREATE POLICY employee_family_tenant_guard[\s\S]*AS RESTRICTIVE[\s\S]*FOR SELECT TO authenticated/);
  assert.match(migration, /employee_family_admin_read[\s\S]*USING \(public\.hris_employee_family_admin_can_read\(employee_id\)\)/);
  assert.match(migration, /employee_family_members_self_read[\s\S]*USING \(public\.hris_employee_family_own_row\(employee_id\)\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});

test('family records grant authenticated reads only and run isolated acceptance on approved runner', () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.employee_family_members FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.employee_family_members TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_employee_family_admin_can_read\(uuid\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated, service_role/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /release\/hris-stable-20261017/);
  assert.match(workflow, /synthetic_test_only/);
  assert.doesNotMatch(workflow, /SUPABASE_URL|SERVICE_ROLE_KEY|service_role_key/i);
});
