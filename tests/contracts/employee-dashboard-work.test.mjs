import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));
const component = read('../../src/live/EmployeeDashboardWork.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const migration = read('../../supabase/migrations/20261016233237_employee_dashboard_official_phone.sql');
const identityMigration = read('../../supabase/migrations/20261017040000_hris_employee_dashboard_work_identity.sql');
const rls = read('../../supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql');
const locale = read('../../src/live/project-locale.ts');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs');

test('employee dashboard work story matches the byte-verified E01-07 source requirement', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const story = catalogue.stories.find(item => item.story_id === 'E01-07');
  assert.equal(story?.module_id, 'E01');
  assert.equal(story?.source_locator.line, 17);
  assert.equal(story?.verbatim_requirement, 'As an employee, I want to see assigned tasks, goals, and overdue actions.');
  assert.match(runner, /E01-07 assigned tasks, own goals, and overdue work/);
  assert.match(browser, /EMPLOYEE_DASHBOARD_WORK_BROWSER_ACCEPTANCE=PASS/);
});

test('employee work dashboard uses existing own-project RPC and employee-goal RLS', () => {
  assert.match(component, /hris_get_my_project_tasks/);
  assert.match(component, /\.eq\('tenant_id', requestedTenant\)[\s\S]*?\.eq\('employee_id', employeeId\)/);
  assert.match(component, /tenant_id === requestedTenant && goal\.employee_id === employeeId/);
  assert.match(rls, /employee_id = public\.hris_own_employee_for_tenant\(tenant_id\)[\s\S]*?public\.hris_admin_can_read_tenant/);
  assert.match(component, /task\.due_date < dashboardDate/);
  assert.match(component, /goal\.due_date < dashboardDate/);
  assert.doesNotMatch(component, /\.update\(|\.insert\(|\.delete\(|appraisal.*score|weighted/);
  assert.match(migration, /'official_phone',e\.official_phone/);
  assert.match(identityMigration, /'id',e\.id/);
  assert.match(identityMigration, /'official_phone',e\.official_phone/);
  assert.match(identityMigration, /hris_own_employee_for_tenant\(p_tenant_id\)/);
});

test('Employee Dashboard work supports recovery, existing route access, responsive layout, and EN/BN', () => {
  assert.match(workspace, /<EmployeeDashboardWork tenantId=\{tenantId\} employeeId=\{employeeId\} dashboardDate=\{today\}/);
  assert.match(workspace, /onOpenProjects=\{\(\) => navigate\('my-projects'\)\}\s+onOpenPerformance=\{\(\) => navigate\('my-performance'\)\}/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /Refresh assigned work/);
  assert.match(component, /Retry/);
  assert.match(browser, /Synthetic temporary project task outage\./);
  assert.match(browser, /failNextDashboardTaskRead = true;[\s\S]*?const dashboardTaskOutage = page\.waitForResponse[\s\S]*?await dashboardWork\.getByRole\('button', \{ name: 'Refresh assigned work', exact: true \}\)\.click\(\);\s+await dashboardTaskOutage;/,
    'the assigned-work outage must be injected by the explicit refresh action under test');
  assert.match(browser, /failNextUpcomingTrainingRead = true;\s+await upcomingTraining\.getByRole\('button', \{ name: 'Refresh upcoming training', exact: true \}\)\.click\(\)/,
    'the training outage must be injected by the explicit refresh action under test');
  assert.match(browser, /Open My Projects/);
  assert.match(browser, /View my goals/);
  assert.match(browser, /375px|setViewportSize/);
  assert.match(browser, /1280px|setViewportSize/);
  for (const phrase of ['My tasks and goals', 'Overdue', 'Goal', 'Task', 'Open My Projects', 'View my goals']) {
    assert.ok(locale.includes(`'${phrase}':`), `Missing Bengali translation for ${phrase}`);
  }
});
