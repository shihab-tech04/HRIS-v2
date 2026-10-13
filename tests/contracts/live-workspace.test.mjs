import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const teams = readFileSync(new URL('../../src/live/OrganizationTeams.tsx', import.meta.url), 'utf8');

test('authenticated Synesis admins enter the RPC-backed workspace instead of the generic table browser', () => {
  assert.match(app, /import \{ LiveHrisWorkspace \} from '\.\/LiveHrisWorkspace'/);
  assert.doesNotMatch(app, /LiveSystemWorkspace/);
  assert.match(app, /const opensAdminWorkspace = currentView === 'system' && canAdminSelectedTenant/);
  assert.match(app, /permissions=\{opensAdminWorkspace \? workspacePermissions : noWorkspacePermissions\}/);
});

test('ordinary linked employees enter a tenant-scoped personal workspace', () => {
  assert.match(app, /const opensEmployeeWorkspace = currentView === 'employee'[\s\S]*?employeeTenantIds\.includes\(tenantId\)/);
  assert.match(app, /if \(current && \(opensAdminWorkspace \|\| opensEmployeeWorkspace\)\)/);
  assert.match(app, /isEmployee=\{employeeTenantIds\.includes\(tenantId\)\}/);
  assert.match(app, /isSuperAdmin=\{opensAdminWorkspace && isSuperAdmin\}/);
  assert.match(app, /permissions=\{opensAdminWorkspace \? workspacePermissions : noWorkspacePermissions\}/);
  assert.match(workspace, /rpc\('hris_get_my_dashboard_data',[\s\S]*?p_tenant_id: tenantId/);
  assert.doesNotMatch(workspace, /rpc\('employee_get_my_attendance_v3'/);
  assert.doesNotMatch(workspace, /rpc\('employee_get_leave_context'/);
});

test('admin navigation uses permissions evaluated for each active tenant membership', () => {
  for (const permission of ['dashboard.view', 'attendance.view', 'attendance.manage', 'reports.view', 'leave.view', 'leave.manage', 'organization.view', 'organization.manage']) {
    assert.ok(app.includes(permission), `missing permission check: ${permission}`);
  }
  assert.match(app, /rpc\('has_tenant_permission'/);
  assert.match(app, /p_tenant_id: membership\.tenant_id/);
  assert.match(workspace, /if \(permissions\.dashboard\)/);
  assert.match(workspace, /if \(permissions\.attendance\)/);
  assert.match(workspace, /if \(permissions\.leave\)/);
  assert.match(app, /attendanceView: grants\.get\('attendance\.view'\) === true/);
  assert.match(workspace, /canView=\{permissions\.attendanceView\}/);
  assert.match(workspace, /const showDetails = canView \|\| canManage/);
});

test('organization team directory is permission-gated and queries tenant-filtered RLS tables without write paths', () => {
  assert.match(app, /organization: grants\.get\('organization\.view'\) === true \|\| grants\.get\('organization\.manage'\) === true/);
  assert.match(workspace, /if \(permissions\.organization\) items\.push\(\{ id: 'teams'/);
  assert.match(workspace, /page === 'teams' && permissions\.organization && <OrganizationTeams tenantId=\{tenantId\}/);
  assert.match(teams, /supabase\.from\('teams'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.match(teams, /supabase\.from\('departments'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.match(teams, /downloadCsv\(`organization-teams-/);
  assert.match(teams, /visibleTeams\.map\(team => \[team\.name, team\.code/);
  assert.doesNotMatch(teams, /\.insert\(|\.update\(|\.delete\(/);
});

test('live HRIS pages use tenant-checked RPC responses and omit the global candidate count', () => {
  for (const rpc of ['hris_get_tenant_dashboard_summary', 'hris_get_tenant_attendance_data', 'hris_get_tenant_leave_data']) {
    assert.ok(workspace.includes(`supabase.rpc('${rpc}'`), `missing RPC: ${rpc}`);
  }
  assert.doesNotMatch(workspace, /candidate_accounts/);
});

test('manager dashboard follows the Figma attendance summary and keeps its controls functional', () => {
  for (const label of ['Managerial Dashboard', 'Today’s Attendance Summary', 'Team Members', 'Present', 'Absent', 'WFO', 'WFH', 'Client Meeting', 'On Leave', 'Late']) {
    assert.ok(workspace.includes(label), `missing Figma dashboard label: ${label}`);
  }
  assert.match(workspace, /Search dashboard metrics/);
  assert.match(workspace, /aria-controls="dashboard-filters"/);
  assert.match(workspace, /Last 7 days[\s\S]+?Last 30 days/);
  assert.match(workspace, /downloadCsv\(`managerial-dashboard-/);
  assert.match(workspace, /Pending attendance corrections/);
  assert.match(workspace, /Pending leave requests/);
});

test('leave decisions remain permission-gated and call the scoped approval RPC', () => {
  assert.doesNotMatch(workspace, /AdminLeaveApprovals/);
  assert.match(workspace, /canManage &&/);
  assert.match(workspace, /rpc\('admin_resolve_leave_request'/);
  const leavePage = workspace.slice(workspace.indexOf('function LeaveWorkspace('), workspace.indexOf('function PersonalLeaveRequests('));
  assert.match(leavePage, /const filteredRequests = useMemo/);
  assert.match(leavePage, /Filter by status/);
  assert.match(leavePage, /employee_number, item\.leave_type_name, item\.leave_type_code/);
  assert.match(leavePage, /requestId !== requestSequence\.current/);
  assert.match(leavePage, /activeTenantId\.current !== actionTenantId/);
  assert.match(leavePage, /Organization holidays/);
  assert.match(leavePage, /visibleData\.holidays\.map/);
});

test('employee leave requests upload private evidence and submit through the tenant-scoped RPC', () => {
  assert.match(workspace, /Request for leave/);
  assert.match(workspace, /storage\.from\('leave-evidence'\)\.upload/);
  assert.match(workspace, /uploadedPath = `\$\{userId\}\/\$\{tenantId\}\/\$\{crypto\.randomUUID\(\)\}/);
  assert.match(workspace, /rpc\('hris_employee_submit_leave_request',[\s\S]+?p_tenant_id: tenantId/);
  assert.match(workspace, /requires_document_proof === true/);
  assert.match(workspace, /item\.reason/);
  assert.match(workspace, /onRefresh=\{\(\) => load\(false\)\}/);
});

test('employee timesheets use tenant-bound RPCs, row-level security, and accessible draft controls', () => {
  assert.match(workspace, /id: 'my-timesheets', label: 'My Timesheets'/);
  assert.match(workspace, /page === 'my-timesheets' && isEmployee && <EmployeeTimesheets tenantId=\{tenantId\}/);
  assert.match(workspace, /rpc\('hris_get_my_timesheet_context',[\s\S]*?p_tenant_id: requestedTenant/);
  assert.match(workspace, /rpc\('hris_save_my_timesheet',[\s\S]*?p_tenant_id: tenantId/);
  assert.match(workspace, /rpc\('hris_submit_my_timesheet',[\s\S]*?p_tenant_id: tenantId/);
  assert.match(workspace, /activeTenantId\.current !== requestedTenant/);
  assert.match(workspace, /A day cannot contain more than 24 total hours/);
  assert.match(workspace, /Submit timesheet/);
  assert.doesNotMatch(workspace, /rpc\('employee_get_timesheet_context'/);
  assert.doesNotMatch(workspace, /rpc\('employee_save_timesheet'/);
  assert.doesNotMatch(workspace, /rpc\('employee_submit_timesheet'/);
});
