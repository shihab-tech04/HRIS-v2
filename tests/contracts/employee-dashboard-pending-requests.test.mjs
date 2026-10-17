import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261017060000_hris_employee_dashboard_pending_requests.sql');
const component = read('../../src/live/EmployeeDashboardPendingRequests.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs');

test('E01-04 pending request summary is owner-bound, tenant-bound and limited to existing open statuses', () => {
  assert.match(migration, /IF NOT public\.is_live_session\(\)/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  for (const table of ['leave_requests', 'attendance_corrections', 'expense_claims', 'travel_requests', 'service_requests', 'learning_enrollments']) {
    assert.match(migration, new RegExp(`FROM public\\.${table} r[\\s\\S]*?r\\.tenant_id=p_tenant_id AND r\\.employee_id=v_employee_id`));
  }
  for (const status of ["r.status='pending'", "r.status='submitted'", "r.status IN ('pending','in_progress')", "r.status='requested'"]) {
    assert.ok(migration.includes(status), `missing existing open status ${status}`);
  }
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_my_pending_requests\(uuid\) FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_pending_requests\(uuid\) TO authenticated,service_role/);
});

test('E01-04 dashboard avoids duplicating sensitive request fields and links to established employee histories', () => {
  assert.match(migration, /'id',q\.id,'kind',q\.kind,'status',q\.status,'requested_at',q\.requested_at/);
  assert.doesNotMatch(migration, /'description'|'reason'|'amount'|'resolution_note'|'attachment_url'/);
  assert.match(component, /supabase\.rpc\('hris_get_my_pending_requests'/);
  assert.match(component, /response\.tenant_id !== requestedTenant \|\| response\.employee_id !== employeeId/);
  assert.match(component, /Unable to load your pending requests/);
  assert.match(component, /No pending requests\./);
  assert.match(workspace, /onOpenPendingRequest=\{kind => navigate\(/);
  for (const label of ['Pending requests','Refresh pending requests','View history','Leave','Attendance','Expense','Travel','Service','Learning']) {
    assert.ok(locale.includes(`'${label}':`), `missing Bengali translation for ${label}`);
  }
});

test('E01-04 disposable Auth/Postgres and browser suites assert isolation, retry, history navigation and responsive locale behavior', () => {
  assert.match(runner, /20261017060000_hris_employee_dashboard_pending_requests\.sql/);
  assert.match(runner, /pendingRequestCrossTenant/);
  assert.match(runner, /pendingRequestAnonymous/);
  assert.match(runner, /hris_get_my_pending_requests\(uuid\)/);
  assert.match(runner, /EMPLOYEE_DASHBOARD_PENDING_REQUESTS_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /failNextDashboardPendingRead = true;\s+await pendingRequests\.getByRole\('button', \{ name: 'Refresh pending requests', exact: true \}\)\.click\(\)/,
    'the pending-request outage must be injected by the explicit refresh action under test');
  assert.match(browser, /My Service Requests/);
  assert.match(browser, /Employee pending requests mobile/);
  assert.match(browser, /Employee pending requests desktop/);
  assert.match(browser, /অপেক্ষমাণ অনুরোধসমূহ/);
});

test('dashboard acceptance fixture parses its synthetic pending-request ID from an object-shaped JSON result', () => {
  assert.match(runner, /SELECT jsonb_build_object\('ids',coalesce\(jsonb_agg\(id ORDER BY submitted_at,id\),'\[\]'::jsonb\)\)/);
  assert.match(runner, /\)\.ids \|\| \[\];\s*if \(dashboardPendingServiceIds\.length === 0\)/);
});
