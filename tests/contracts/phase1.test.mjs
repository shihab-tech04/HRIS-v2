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
test('release candidate scopes tenant permissions through active membership role IDs', () => {
  const sql = source('supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql');
  assert.match(sql, /JOIN public\.tenant_memberships m[\s\S]+?JOIN public\.roles r\s+ON r\.id = m\.role/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.has_permission\(p_permission_id text\)[\s\S]+?has_tenant_permission\(public\.synesis_tenant_id\(\), p_permission_id\)/);
  assert.match(sql, /lower\(m\.status\) = 'active'/i);
  assert.match(sql, /public\.is_live_session\(\)/);
  assert.match(sql, /hris_attendance_records_tenant_read_guard[\s\S]+?AS RESTRICTIVE FOR SELECT/);
  assert.match(sql, /hris_employee_leave_balances_tenant_read_guard[\s\S]+?AS RESTRICTIVE FOR SELECT/);
  assert.doesNotMatch(sql, /p_tenant_id\s*=\s*public\.synesis_tenant_id\(\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hris_get_my_dashboard_data\(p_tenant_id uuid\)[\s\S]+?hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.hris_get_my_dashboard_data\(uuid\) FROM PUBLIC, anon/);
});
test('employee self-service and leave evidence stay inside the linked tenant', () => {
  const sql = source('supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql');
  assert.match(sql, /CREATE POLICY hris_attendance_records_own_read[\s\S]+?AS PERMISSIVE FOR SELECT TO authenticated/);
  assert.match(sql, /CREATE POLICY hris_employee_leave_balances_own_read[\s\S]+?AS PERMISSIVE FOR SELECT TO authenticated/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hris_employee_submit_leave_request\([\s\S]+?p_tenant_id uuid, p_payload jsonb/);
  assert.match(sql, /requires_document_proof[\s\S]+?attachment_url/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /CREATE POLICY hris_leave_evidence_tenant_read_guard\s+ON storage\.objects AS RESTRICTIVE FOR SELECT/);
  assert.match(sql, /CREATE POLICY hris_leave_evidence_upload_tenant_guard\s+ON storage\.objects AS RESTRICTIVE FOR INSERT/);
  assert.match(sql, /CREATE POLICY hris_leave_evidence_delete_tenant_guard\s+ON storage\.objects AS RESTRICTIVE FOR DELETE/);
  assert.match(sql, /hris_can_access_leave_evidence\(/);
});
test('real workspace uses membership-scoped admin access and linked employee identity', () => {
  const app = source('src/live/LiveApp.tsx');
  for (const name of ["from('tenant_memberships')", "from('employees')", "from('admin_users')"]) {
    assert.ok(app.includes(name), 'Missing ' + name);
  }
  assert.match(app, /rpc\('has_tenant_permission'/);
  assert.match(app, /employeeTenantIds\.includes\(tenantId\)/);
  assert.doesNotMatch(app, /rpc\('has_permission'/);
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
