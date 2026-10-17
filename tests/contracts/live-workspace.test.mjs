import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const teams = readFileSync(new URL('../../src/live/OrganizationTeams.tsx', import.meta.url), 'utf8');
const projects = readFileSync(new URL('../../src/live/OrganizationProjects.tsx', import.meta.url), 'utf8');
const myProjects = readFileSync(new URL('../../src/live/MyProjects.tsx', import.meta.url), 'utf8');
const projectPermissionMigration = readFileSync(new URL('../../supabase/migrations/20261013100000_hris_project_superadmin_and_project_manager_permissions.sql', import.meta.url), 'utf8');
const projectDataMigration = readFileSync(new URL('../../supabase/migrations/20261013090000_hris_projects_and_allocations_tenant_scope.sql', import.meta.url), 'utf8');
const projectTimesheetMigration = readFileSync(new URL('../../supabase/migrations/20261016033936_hris_project_scoped_timesheet_review.sql', import.meta.url), 'utf8');
const dashboardTeamReportMigration = readFileSync(new URL('../../supabase/migrations/20261014030722_hris_dashboard_team_report.sql', import.meta.url), 'utf8');
const dashboardTeamReportBrowser = readFileSync(new URL('../sql/isolated-auth/run-dashboard-team-report-browser.mjs', import.meta.url), 'utf8');
const isolatedRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('authenticated Synesis admins enter the RPC-backed workspace instead of the generic table browser', () => {
  assert.match(app, /import \{ LiveHrisWorkspace \} from '\.\/LiveHrisWorkspace'/);
  assert.doesNotMatch(app, /LiveSystemWorkspace/);
  assert.match(app, /const opensAdminWorkspace = currentView === 'system' && canAdminSelectedTenant/);
  assert.match(app, /workspacePermissions\.leave\s*\|\|\s*workspacePermissions\.organization/);
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
  assert.match(workspace, /if \(permissions\.organization \|\| isSuperAdmin\) \{[\s\S]*?items\.push\(\{ id: 'projects'[\s\S]*?if \(permissions\.organization\) items\.push\(\{ id: 'teams'/);
  assert.match(workspace, /page === 'teams' && permissions\.organization && <OrganizationTeams tenantId=\{tenantId\}/);
  assert.match(teams, /supabase\.from\('teams'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.match(teams, /supabase\.from\('departments'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.match(teams, /downloadCsv\(`organization-teams-/);
  assert.match(teams, /visibleTeams\.map\(team => \[team\.name, team\.code/);
  assert.doesNotMatch(teams, /\.insert\(|\.update\(|\.delete\(/);
});

test('project workspace and employee allocations use tenant-bound audited RPCs', () => {
  assert.match(app, /organizationManage: grants\.get\('organization\.manage'\) === true/);
  assert.match(workspace, /page === 'projects' && \(permissions\.organization \|\| isSuperAdmin \|\| isEmployee\) && <>\s*<OrganizationProjects tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(workspace, /<ProjectTimesheetReviewQueue tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(workspace, /page === 'my-projects' && isEmployee && <>[\s\S]*?<ProjectTimesheetReviewQueue/);
  assert.match(workspace, /else if \(isEmployee\) items\.push\(\{ id: 'projects', label: 'Project Workspace'/);
  assert.match(workspace, /page === 'my-projects' && isEmployee && <>\s*<MyProjects tenantId=\{tenantId\} locale=\{locale\}/);
  assert.match(workspace, /synesis-hris-locale/);
  assert.match(workspace, /Switch language to Bengali/);
  assert.match(workspace, /document\.documentElement\.lang = locale/);
  for (const rpc of ['hris_get_tenant_project_workspace', 'hris_create_tenant_project', 'hris_assign_tenant_project_allocation', 'hris_release_tenant_project_allocation']) {
    assert.ok(projects.includes(`supabase.rpc('${rpc}'`), `missing project RPC: ${rpc}`);
  }
  assert.match(projects, /project_lead_id|leadId/);
  assert.match(projects, /workspace\.can_create/);
  assert.match(projects, /project\.can_manage/);
  assert.match(projects, /Project Manager/);
  assert.match(projects, /Allocation %/);
  assert.match(projects, /window\.confirm\(`Release \$\{allocation\.employee_name\} from this project\?/);
  assert.match(projects, /employment status will not change/);
  assert.match(myProjects, /hris_get_my_projects/);
  assert.match(myProjects, /tx\('My Projects & Allocations'\)/);
  assert.match(myProjects, /does not change your employment record/);
  assert.doesNotMatch(projects, /\.from\('projects'\)\.(?:insert|update|delete)/);
});

test('project permissions come from the server workspace capability fields, never organization.manage', () => {
  assert.match(app, /isSuperAdmin \|\| workspacePermissions\.dashboard/);
  assert.match(app, /const activeSuperAdmin = adminResult\.data\?\.active === true && adminResult\.data\?\.is_super_admin === true/);
  assert.match(workspace, /if \(isSuperAdmin && !permissions\.dashboard && !permissions\.attendance && !permissions\.leave/);
  assert.doesNotMatch(projects, /canManage/);
});

test('only Super Admin can create and appoint a Project Manager; only the assigned Project Manager manages membership', () => {
  const createProject = projectPermissionMigration.slice(
    projectPermissionMigration.indexOf('CREATE OR REPLACE FUNCTION public.hris_create_tenant_project'),
    projectPermissionMigration.indexOf('CREATE OR REPLACE FUNCTION public.hris_assign_tenant_project_allocation'),
  );
  const assignMember = projectPermissionMigration.slice(
    projectPermissionMigration.indexOf('CREATE OR REPLACE FUNCTION public.hris_assign_tenant_project_allocation'),
    projectPermissionMigration.indexOf('CREATE OR REPLACE FUNCTION public.hris_release_tenant_project_allocation'),
  );
  const releaseMember = projectPermissionMigration.slice(
    projectPermissionMigration.indexOf('CREATE OR REPLACE FUNCTION public.hris_release_tenant_project_allocation'),
  );
  assert.match(createProject, /IF NOT public\.hris_is_project_super_admin\(\) THEN/);
  assert.match(createProject, /Only an active Super Admin can create projects and appoint Project Managers/);
  assert.match(projectPermissionMigration, /'can_create', v_is_super_admin/);
  assert.match(projectPermissionMigration, /'can_manage', \(v_employee_id IS NOT NULL AND p\.project_lead_id = v_employee_id\)/);
  for (const functionBody of [assignMember, releaseMember]) {
    assert.match(functionBody, /IF NOT EXISTS \([\s\S]*p\.project_lead_id = public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
    assert.doesNotMatch(functionBody, /hris_is_project_super_admin/);
  }
  assert.match(projectDataMigration, /CREATE POLICY hris_projects_tenant_read ON public\.projects\s+FOR SELECT TO authenticated/);
  assert.match(projectDataMigration, /CREATE POLICY hris_project_allocations_tenant_read ON public\.project_allocations\s+FOR SELECT TO authenticated/);
  assert.match(projectDataMigration, /REVOKE ALL ON TABLE public\.projects, public\.project_allocations FROM PUBLIC, anon, authenticated;\s+GRANT SELECT ON TABLE public\.projects, public\.project_allocations TO authenticated;/);
  assert.doesNotMatch(projectDataMigration, /CREATE POLICY hris_(?:projects|project_allocations).*FOR (?:INSERT|UPDATE|DELETE)/);
});

test('live HRIS pages use tenant-checked RPC responses and omit the global candidate count', () => {
  for (const rpc of ['hris_get_tenant_dashboard_summary', 'hris_get_tenant_dashboard_team_report', 'hris_get_tenant_attendance_data', 'hris_get_tenant_leave_data']) {
    assert.ok(workspace.includes(`supabase.rpc('${rpc}'`), `missing RPC: ${rpc}`);
  }
  assert.doesNotMatch(workspace, /candidate_accounts/);
});

test('manager dashboard follows the Figma attendance summary and keeps its controls functional', () => {
  for (const label of ['Managerial Dashboard', 'Today’s Attendance Summary', 'Team Members', 'Present', 'Absent', 'Work from Office', 'Work From Home', 'Client Meeting', 'On Leave', 'Late', 'Daily Attendance Chart']) {
    assert.ok(workspace.includes(label), `missing Figma dashboard label: ${label}`);
  }
  assert.match(workspace, /Search dashboard metrics/);
  assert.match(workspace, /aria-controls="dashboard-filters"/);
  assert.match(workspace, /Last 7 days[\s\S]+?Last 30 days/);
  assert.match(workspace, /downloadCsv\(`managerial-dashboard-/);
  assert.match(workspace, /xl:grid-cols-8/);
  assert.match(workspace, /attendance-trend-area/);
  assert.match(workspace, /Pending attendance corrections/);
  assert.match(workspace, /Pending leave requests/);
  assert.match(workspace, /<header id="manager-dashboard-header" className="[^\"]*min-h-\[67px\][^\"]*bg-\[#EFF7F8\]/);
  assert.match(workspace, /<h2 id="live-dashboard-heading" className="text-lg font-bold text-\[#353535\]"/);
  assert.match(workspace, /xl:grid-cols-\[334px_184px_64px\]/);
  assert.match(workspace, /rounded-xl border border-\[#DEE0E3\] bg-white px-\[21px\] py-\[18px\]/);
  assert.match(workspace, /text-sm font-bold text-\[#49454F\]/);
  assert.match(workspace, /min-h-\[68px\] rounded-\[4px\] border border-\[#E6EEF3\]/);
});

test('manager dashboard team report is permission-gated, tenant-scoped, searchable and exportable', () => {
  assert.match(workspace, /function LiveDashboard\(\{ tenantId, onOpen, canReport, locale \}/);
  assert.match(workspace, /canReport && <section aria-labelledby="dashboard-team-report-heading"/);
  assert.match(workspace, /Search team report/);
  assert.match(workspace, /min-w-\[790px\]/);
  assert.match(workspace, /downloadCsv\(`managerial-dashboard-team-report-/);
  for (const label of ['Team Report', 'Team Name', 'Present Member', 'Absent Member', 'Total Member', 'Work from office', 'Work from Home', 'Client meeting']) {
    assert.ok(workspace.includes(label), `missing team report label: ${label}`);
  }
  assert.match(dashboardTeamReportMigration, /has_tenant_permission\(p_tenant_id, 'dashboard\.view'\)/);
  assert.match(dashboardTeamReportMigration, /has_tenant_permission\(p_tenant_id, 'reports\.view'\)/);
  assert.match(dashboardTeamReportMigration, /LEFT JOIN public\.teams t\s+ON t\.id = e\.team_id AND t\.tenant_id = e\.tenant_id/);
  assert.match(dashboardTeamReportMigration, /LEFT JOIN public\.attendance_records a\s+ON a\.tenant_id = e\.tenant_id/);
  assert.match(dashboardTeamReportMigration, /REVOKE ALL ON FUNCTION public\.hris_get_tenant_dashboard_team_report\(uuid\) FROM PUBLIC, anon/);
  assert.doesNotMatch(dashboardTeamReportMigration, /'employee_name'|'employee_id'/);
  assert.match(isolatedRunner, /run-dashboard-team-report-browser\.mjs/);
  assert.match(dashboardTeamReportBrowser, /injected Team Report outage/);
  assert.match(dashboardTeamReportBrowser, /hris_get_tenant_dashboard_team_report/);
  assert.match(dashboardTeamReportBrowser, /setViewportSize\(\{ width: 1280, height: 900 \}\)/);
  assert.match(dashboardTeamReportBrowser, /createReadStream/);
  assert.match(dashboardTeamReportBrowser, /directTableReads.length/);
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
  assert.match(workspace, /project_allocation_id: entry\.project_allocation_id/);
  assert.match(workspace, /p_expected_version: editingVersion/);
  assert.match(workspace, /hris_resubmit_rejected_project_timesheet/);
  assert.match(workspace, /Project review status/);
  assert.match(workspace, /activeTenantId\.current !== requestedTenant/);
  assert.match(workspace, /A day cannot contain more than 24 total hours/);
  assert.match(workspace, /Submit timesheet/);
  assert.doesNotMatch(workspace, /rpc\('employee_get_timesheet_context'/);
  assert.doesNotMatch(workspace, /rpc\('employee_save_timesheet'/);
  assert.doesNotMatch(workspace, /rpc\('employee_submit_timesheet'/);
});

test('project-scoped timesheet review enforces allocation ownership, project-manager authority, scoped correction, and audit history', () => {
  assert.match(projectTimesheetMigration, /ADD COLUMN IF NOT EXISTS project_allocation_id uuid/);
  assert.match(projectTimesheetMigration, /ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1/);
  assert.match(projectTimesheetMigration, /CREATE TABLE IF NOT EXISTS public\.timesheet_project_reviews/);
  assert.match(projectTimesheetMigration, /CREATE TABLE IF NOT EXISTS public\.timesheet_project_review_events/);
  assert.match(projectTimesheetMigration, /ALTER TABLE public\.timesheet_project_reviews ENABLE ROW LEVEL SECURITY/);
  assert.match(projectTimesheetMigration, /REVOKE ALL ON public\.timesheet_project_reviews, public\.timesheet_project_review_events\s+FROM PUBLIC, anon, authenticated/);
  assert.match(projectTimesheetMigration, /REVOKE ALL ON public\.timesheets, public\.timesheet_entries FROM PUBLIC, anon, authenticated/);
  assert.match(projectTimesheetMigration, /a\.employee_id=v_employee_id\s+AND a\.assigned_date <= v_work_date/);
  assert.match(projectTimesheetMigration, /p\.project_lead_id=v_employee_id/);
  assert.match(projectTimesheetMigration, /p_decision='rejected'[\s\S]*?A rejection reason is required/);
  assert.match(projectTimesheetMigration, /v_review\.revision <> p_expected_revision/);
  assert.match(projectTimesheetMigration, /e\.timesheet_id=p_timesheet_id AND \(a\.project_id IS NULL OR a\.project_id<>p_project_id\)/);
  assert.match(projectTimesheetMigration, /timesheet\.project\.corrected_resubmitted/);
  assert.match(projectTimesheetMigration, /e\.project_allocation_id IS NULL\) THEN 'submitted'/);
  assert.match(workspace, /Choose an allocation that covers this employee and work date\./);
  assert.match(workspace, /Project allocation \(required\)/);
  assert.match(workspace, /Project allocation \(optional\)/);
  assert.match(isolatedRunner, /Concurrent project approval attempts commit one decision, one history event, and one audit record/);
  for (const rpc of ['hris_get_my_project_timesheet_reviews', 'hris_resolve_project_timesheet', 'hris_resubmit_rejected_project_timesheet']) {
    assert.match(projectTimesheetMigration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}\\(`));
    assert.match(projectTimesheetMigration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\(`));
  }
});
