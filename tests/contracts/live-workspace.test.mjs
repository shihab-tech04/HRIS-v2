import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');

test('authenticated Synesis admins enter the RPC-backed workspace instead of the generic table browser', () => {
  assert.match(app, /import \{ LiveHrisWorkspace \} from '\.\/LiveHrisWorkspace'/);
  assert.doesNotMatch(app, /LiveSystemWorkspace/);
  assert.match(app, /const opensAdminWorkspace = currentView === 'system' && canAdminSelectedTenant/);
  assert.match(app, /permissions=\{opensAdminWorkspace \? workspacePermissions : noWorkspacePermissions\}/);
});

test('employee summary access follows the active admin identity and fixed Synesis RPC contract', () => {
  assert.match(app, /const canUseEmployeeSummary = adminResult\.data\?\.active === true && Boolean\(/);
  assert.match(app, /ownedTenantIds\.includes\(legacyTenant\.data\.id\)/);
  assert.match(app, /const opensEmployeeWorkspace = currentView === 'employee'[\s\S]*?employeeRpcAllowed[\s\S]*?current\?\.slug === 'synesis-it'/);
  assert.match(app, /if \(current && \(opensAdminWorkspace \|\| opensEmployeeWorkspace\)\)/);
  assert.match(app, /isEmployee=\{current\.slug === 'synesis-it' && employeeRpcAllowed && employeeTenantIds\.includes\(tenantId\)\}/);
  assert.match(app, /isSuperAdmin=\{opensAdminWorkspace && isSuperAdmin\}/);
  assert.match(app, /permissions=\{opensAdminWorkspace \? workspacePermissions : noWorkspacePermissions\}/);
});

test('admin navigation follows checked permissions and stays scoped to the Synesis tenant', () => {
  for (const permission of ['dashboard.view', 'attendance.view', 'attendance.manage', 'reports.view', 'leave.view', 'leave.manage']) {
    assert.ok(app.includes(permission), `missing permission check: ${permission}`);
  }
  assert.match(app, /t\.slug === 'synesis-it'/);
  assert.match(workspace, /if \(permissions\.dashboard\)/);
  assert.match(workspace, /if \(permissions\.attendance\)/);
  assert.match(workspace, /if \(permissions\.leave\)/);
});

test('live HRIS pages use authorized RPC responses and omit the global candidate count', () => {
  for (const rpc of ['admin_get_dashboard_summary', 'admin_get_attendance', 'admin_get_attendance_report', 'admin_get_leave_data']) {
    assert.ok(workspace.includes(`supabase.rpc('${rpc}'`), `missing RPC: ${rpc}`);
  }
  assert.doesNotMatch(workspace, /candidate_accounts/);
});

test('leave decisions stay hidden until tenant-scope SQL and authorization tests are accepted', () => {
  assert.doesNotMatch(workspace, /AdminLeaveApprovals/);
  assert.match(workspace, /Approval actions are unavailable until tenant-scoped SQL and isolated authorization tests are accepted/);
});
