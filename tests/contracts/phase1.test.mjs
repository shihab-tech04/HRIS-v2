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
  assert.match(sql, /'employee',v_employee_profile[\s\S]+?'dashboard_date',v_today/);
  assert.match(sql, /'corrections',coalesce\([\s\S]+?c\.employee_id=v_employee/);
  assert.match(sql, /'full_name',e\.full_name[\s\S]+?'employee_number',e\.employee_number[\s\S]+?'official_email',e\.official_email/);
  assert.match(sql, /LEFT JOIN public\.departments d ON d\.id=e\.department_id AND d\.tenant_id=e\.tenant_id[\s\S]+?LEFT JOIN public\.designations ds ON ds\.id=e\.designation_id AND ds\.tenant_id=e\.tenant_id/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.hris_get_my_dashboard_data\(uuid\) FROM PUBLIC, anon/);
});
test('employee leave history returns only the employee’s private evidence path', () => {
  const sql = source('supabase/migrations/20261013221700_employee_leave_history_private_evidence.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hris_get_my_dashboard_data\(p_tenant_id uuid\)[\s\S]+?SECURITY DEFINER/);
  assert.match(sql, /hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(sql, /'attachment_url',r\.attachment_url[\s\S]+?WHERE r\.tenant_id=p_tenant_id AND r\.employee_id=v_employee/);
  assert.doesNotMatch(sql, /CREATE POLICY|GRANT EXECUTE|REVOKE ALL/i);
});
test('all 20 legacy tenant-readable tables have membership reads and restrictive Auth/anon guards', () => {
  const membershipSql = source('supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql');
  const guardsSql = source('supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql');
  const allPolicies = `${membershipSql}\n${guardsSql}`;
  const tables = [
    'attendance_corrections', 'attendance_records', 'confirmation_reviews', 'designations',
    'employee_leave_balances', 'employee_referrals', 'grades', 'holidays', 'hr_policies',
    'manpower_requisitions', 'notices', 'org_locations', 'pay_periods', 'payslips',
    'performance_cycles', 'performance_goals', 'project_performance_reviews', 'service_requests',
    'shifts', 'teams',
  ];
  for (const table of tables) {
    assert.match(allPolicies, new RegExp(
      `CREATE POLICY hris_${table}_membership_read\\s+ON public\\.${table} AS PERMISSIVE FOR SELECT TO authenticated`,
    ), `${table} needs a membership-scoped permissive read policy`);
    assert.match(guardsSql, new RegExp(
      `CREATE POLICY hris_${table}_membership_guard\\s+ON public\\.${table} AS RESTRICTIVE FOR SELECT TO authenticated`,
    ), `${table} needs a restrictive tenant and anonymous guard`);
  }
  assert.match(guardsSql, /CREATE OR REPLACE FUNCTION public\.hris_is_active_tenant_member/);
  assert.match(guardsSql, /JOIN public\.roles r\s+ON r\.id = m\.role/i);
  assert.match(guardsSql, /public\.is_live_session\(\)/);
  assert.match(guardsSql, /auth\.uid\(\) IS NOT NULL/);
  assert.doesNotMatch(guardsSql, /\bDROP TABLE\b/i);
});
test('employee self-service and leave evidence stay inside the linked tenant', () => {
  const sql = source('supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql');
  assert.match(sql, /CREATE POLICY hris_attendance_records_own_read[\s\S]+?AS PERMISSIVE FOR SELECT TO authenticated/);
  assert.match(sql, /CREATE POLICY hris_employee_leave_balances_own_read[\s\S]+?AS PERMISSIVE FOR SELECT TO authenticated/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hris_employee_submit_leave_request\([\s\S]+?p_tenant_id uuid, p_payload jsonb/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hris_employee_submit_attendance_correction\([\s\S]+?p_tenant_id uuid, p_payload jsonb/);
  assert.match(sql, /hris_employee_submit_attendance_correction\([\s\S]+?hris_own_employee_for_tenant\(p_tenant_id\)[\s\S]+?attendance\.correction\.submitted/);
  assert.match(sql, /requires_document_proof[\s\S]+?attachment_url/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /CREATE POLICY hris_leave_evidence_tenant_read_guard\s+ON storage\.objects AS RESTRICTIVE FOR SELECT/);
  assert.match(sql, /CREATE POLICY hris_leave_evidence_upload_tenant_guard\s+ON storage\.objects AS RESTRICTIVE FOR INSERT/);
  assert.match(sql, /CREATE POLICY hris_leave_evidence_delete_tenant_guard\s+ON storage\.objects AS RESTRICTIVE FOR DELETE/);
  assert.match(sql, /hris_can_access_leave_evidence\(/);
});
test('manager dashboard aggregates only explicit tenant attendance and leave fields', () => {
  const sql = source('supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql');
  const dashboard = sql.match(/CREATE OR REPLACE FUNCTION public\.hris_get_tenant_dashboard_summary\(p_tenant_id uuid\)[\s\S]+?\$function\$;/)?.[0] || '';
  assert.match(dashboard, /has_tenant_permission\(p_tenant_id, 'dashboard\.view'\)/);
  for (const field of ['dashboard_date', 'present_today', 'absent_today', 'wfo_today', 'wfh_today', 'client_meeting_today', 'on_leave_today', 'late_today', 'attendance_last_30_days']) {
    assert.ok(dashboard.includes(`'${field}'`), `dashboard response missing ${field}`);
  }
  assert.match(dashboard, /lower\(btrim\(a\.status\)\)='late'/);
  assert.match(dashboard, /lower\(btrim\(a\.work_mode\)\)='client_meeting'/);
  assert.match(dashboard, /lower\(btrim\(r\.status\)\)='approved'[\s\S]+?r\.from_date<=v_today AND r\.to_date>=v_today/);
  assert.match(dashboard, /e\.employment_status NOT IN \('resigned','terminated'\)/);
  assert.match(dashboard, /SELECT t\.timezone INTO v_timezone FROM public\.tenants t[\s\S]+?v_today := \(now\(\) AT TIME ZONE v_timezone\)::date/);
  assert.doesNotMatch(dashboard, /check_in\s*[<>]=?/i);
});
test('real workspace uses membership-scoped admin access and linked employee identity', () => {
  const app = source('src/live/LiveApp.tsx');
  for (const name of ["from('tenant_memberships')", "from('employees')", "from('admin_users')"]) {
    assert.ok(app.includes(name), 'Missing ' + name);
  }
  assert.match(app, /rpc\('has_tenant_permission'/);
  assert.match(app, /employeeTenantIds\.includes\(tenantId\)/);
  assert.doesNotMatch(app, /rpc\('has_permission'/);
  assert.match(app, /canReadAdminDirectories\s*\?\s*supabase\.from\('employees'\)/);
  assert.ok(app.includes('workspacePermissions.recruitment'));
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
