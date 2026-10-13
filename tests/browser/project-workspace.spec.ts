import { test, expect } from '@playwright/test';

const tenantId = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const managerId = 'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const employeeId = 'fccccccc-cccc-4ccc-8ccc-cccccccccccc';
const projectManagerId = 'fccccccc-cccc-4ccc-8ccc-cccccccccccd';
const projectId = 'fddddddd-dddd-4ddd-8ddd-dddddddddddd';
const allocationId = 'feeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const newAllocationId = 'f1111111-1111-4111-8111-111111111111';
const collaboratorId = 'f2222222-2222-4222-8222-222222222222';
const collaboratorAllocationId = 'f3333333-3333-4333-8333-333333333333';
const taskId = 'f4444444-4444-4444-8444-444444444444';
const taskMemberId = 'f5555555-5555-4555-8555-555555555555';
const collaboratorTaskMemberId = 'f6666666-6666-4666-8666-666666666666';
const reviewId = 'f7777777-7777-4777-8777-777777777777';
type Mode = 'ordinary-admin' | 'ordinary-manager' | 'super-admin' | 'project-manager' | 'employee';
type BrowserAllocation = {
  id: string; employee_id: string; employee_name: string; employee_number: string;
  role_on_project: string; allocation_percentage: number; assigned_date: string;
  release_date: string | null; status: string;
};
type BrowserProject = {
  id: string; tenant_id: string; code: string; name: string; client_name: string | null;
  description: string | null; project_lead_id: string; project_lead_name: string;
  start_date: string; target_end_date: string | null; status: string;
  can_manage: boolean; allocations: BrowserAllocation[];
};
type BrowserTaskMember = { id: string; project_allocation_id: string; employee_id: string; employee_name: string; released_at: string | null };
type BrowserTask = { id: string; project_id: string; title: string; description: string; due_date: string | null; status: string; feedback_pending: number; members: BrowserTaskMember[] };
type BrowserEmployeeTask = { task_id: string; project_name: string; project_code: string; title: string; description: string; due_date: string | null; status: string; feedback_pending: number; members: BrowserTaskMember[] };
type BrowserReview = { id: string; task_title: string; project_name: string; reviewer_employee_id: string; reviewer_name: string; reviewee_employee_id: string; reviewee_name: string; status: 'pending' | 'submitted'; quality_of_work_score: number | null; quality_of_work_not_observed: boolean; collaboration_teamwork_score: number | null; collaboration_teamwork_not_observed: boolean; delivery_reliability_score: number | null; delivery_reliability_not_observed: boolean; ownership_communication_score: number | null; ownership_communication_not_observed: boolean; comments: string };

function authFixture(userId: string, email: string) {
  const user = {
    id: userId, aud: 'authenticated', role: 'authenticated', email,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const token = [
    Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', email,
      iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
      exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    'synthetic-signature',
  ].join('.');
  return { user, token };
}

async function openWorkspace(page: import('@playwright/test').Page, mode: Mode) {
  const userId = mode === 'ordinary-admin' ? managerId
    : mode === 'ordinary-manager' ? 'faaaaaac-aaaa-4aaa-8aaa-aaaaaaaaaaac'
    : mode === 'super-admin' ? 'faaaaaab-aaaa-4aaa-8aaa-aaaaaaaaaaab'
    : mode === 'project-manager' ? projectManagerId : employeeId;
  const email = mode === 'ordinary-admin' ? 'ordinary-admin@hris.test'
    : mode === 'ordinary-manager' ? 'ordinary-manager@hris.test'
    : mode === 'super-admin' ? 'super-admin@hris.test'
    : mode === 'project-manager' ? 'assigned-project-manager@hris.test' : 'project-employee@hris.test';
  const { user, token } = authFixture(userId, email);
  const project: BrowserProject = {
    id: projectId, tenant_id: tenantId, code: 'PRJ-001', name: 'Design Platform',
    client_name: 'QA Client', description: 'Synthetic end-to-end project.',
    project_lead_id: projectManagerId, project_lead_name: 'Assigned Project Manager',
    start_date: '2026-10-01', target_end_date: '2026-12-31', status: 'active',
    can_manage: mode === 'project-manager',
    allocations: [{ id: allocationId, employee_id: employeeId, employee_name: 'Synthetic Employee',
      employee_number: 'QA-001', role_on_project: 'Designer', allocation_percentage: 60,
      assigned_date: '2026-10-01', release_date: null, status: 'active' },
      { id: collaboratorAllocationId, employee_id: collaboratorId, employee_name: 'Collaborator Employee',
        employee_number: 'QA-002', role_on_project: 'Researcher', allocation_percentage: 40,
        assigned_date: '2026-10-01', release_date: null, status: 'active' }],
  };
  const employees = [
    { id: employeeId, employee_number: 'QA-001', full_name: 'Synthetic Employee' },
    { id: collaboratorId, employee_number: 'QA-002', full_name: 'Collaborator Employee' },
    { id: projectManagerId, employee_number: 'QA-PM-001', full_name: 'Assigned Project Manager' },
  ];
  const projects = [project];
  let nextProjectNumber = 2;
  const projectRpcTenants: string[] = [];
  const projectCreateBodies: Record<string, unknown>[] = [];
  const allocationRpcBodies: Record<string, unknown>[] = [];
  const taskRpcBodies: { name: string; body: Record<string, unknown> }[] = [];
  const peerReviewRpcBodies: Record<string, unknown>[] = [];
  const taskRows: BrowserTask[] = [];
  const peerReviews: BrowserReview[] = mode === 'employee' ? [{
    id: reviewId, task_title: 'Prepare release checklist', project_name: 'Design Platform',
    reviewer_employee_id: employeeId, reviewer_name: 'Synthetic Employee',
    reviewee_employee_id: collaboratorId, reviewee_name: 'Collaborator Employee', status: 'pending',
    quality_of_work_score: null, quality_of_work_not_observed: false,
    collaboration_teamwork_score: null, collaboration_teamwork_not_observed: false,
    delivery_reliability_score: null, delivery_reliability_not_observed: false,
    ownership_communication_score: null, ownership_communication_not_observed: false, comments: '',
  }] : [];
  let failFirstReviewSubmission = mode === 'employee';
  const employeeTask: BrowserEmployeeTask = {
    task_id: taskId, project_name: 'Design Platform', project_code: 'PRJ-001',
    title: 'Prepare release checklist', description: 'Coordinate the checklist with collaborators.',
    due_date: null, status: 'completed', feedback_pending: 1,
    members: [
      { id: taskMemberId, project_allocation_id: allocationId, employee_id: employeeId, employee_name: 'Synthetic Employee', released_at: null },
      { id: collaboratorTaskMemberId, project_allocation_id: collaboratorAllocationId, employee_id: collaboratorId, employee_name: 'Collaborator Employee', released_at: null },
    ],
  };

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    return route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user }) });
    if (path.endsWith('/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') {
      const permission = (request.postDataJSON() as { p_permission_id?: string } | null)?.p_permission_id;
      const granted = ['ordinary-admin', 'ordinary-manager'].includes(mode)
        && (permission === 'organization.view' || permission === 'organization.manage');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(granted) });
    }
    if (endpoint === 'hris_get_tenant_project_workspace') {
      const body = request.postDataJSON() as { p_tenant_id?: string };
      projectRpcTenants.push(body.p_tenant_id || '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        projects, employees,
        can_create: mode === 'super-admin',
      }) });
    }
    if (endpoint === 'hris_get_my_projects') {
      const body = request.postDataJSON() as { p_tenant_id?: string };
      projectRpcTenants.push(body.p_tenant_id || '');
      const mine = mode === 'employee' ? [{ allocation_id: allocationId, project_id: projectId,
        project_code: 'PRJ-001', project_name: 'Design Platform', client_name: 'QA Client',
        project_lead_name: 'Assigned Project Manager', project_status: 'active', role_on_project: 'Designer',
        allocation_percentage: 60, assigned_date: '2026-10-01', release_date: null, status: 'active' }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: mine }) });
    }
    if (endpoint === 'hris_get_project_task_workspace') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: taskRows, can_manage: mode === 'project-manager' }) });
    }
    if (endpoint === 'hris_get_my_project_tasks') {
      const tasks = mode === 'employee' ? [employeeTask] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks }) });
    }
    if (endpoint === 'hris_get_my_project_peer_reviews') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reviews: peerReviews }) });
    }
    if (endpoint === 'hris_create_project_task') {
      const body = request.postDataJSON() as Record<string, unknown>;
      taskRpcBodies.push({ name: endpoint, body });
      const ids = body.p_project_allocation_ids as string[];
      const members = ids.map((allocation, index) => {
        const projectMember = project.allocations.find(row => row.id === allocation)!;
        return { id: index === 0 ? taskMemberId : collaboratorTaskMemberId,
          project_allocation_id: allocation, employee_id: projectMember.employee_id,
          employee_name: projectMember.employee_name, released_at: null };
      });
      taskRows.unshift({ id: taskId, project_id: projectId, title: String(body.p_title),
        description: String(body.p_description || ''), due_date: body.p_due_date as string | null,
        status: 'open', feedback_pending: 0, members });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: taskId }) });
    }
    if (endpoint === 'hris_assign_project_task_member') {
      const body = request.postDataJSON() as Record<string, unknown>;
      taskRpcBodies.push({ name: endpoint, body });
      const projectMember = project.allocations.find(row => row.id === body.p_project_allocation_id)!;
      taskRows[0]?.members.push({ id: collaboratorTaskMemberId, project_allocation_id: projectMember.id,
        employee_id: projectMember.employee_id, employee_name: projectMember.employee_name, released_at: null });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: collaboratorTaskMemberId }) });
    }
    if (['hris_start_project_task', 'hris_release_project_task_member', 'hris_complete_project_task'].includes(endpoint)) {
      const body = request.postDataJSON() as Record<string, unknown>;
      taskRpcBodies.push({ name: endpoint, body });
      const task = taskRows[0];
      if (endpoint === 'hris_start_project_task' && task) task.status = 'in_progress';
      if (endpoint === 'hris_release_project_task_member' && task) {
        const member = task.members.find(row => row.id === body.p_task_assignment_id);
        if (member) member.released_at = '2026-10-13T12:00:00Z';
        task.feedback_pending = 1;
      }
      if (endpoint === 'hris_complete_project_task' && task) {
        task.status = 'completed'; task.feedback_pending = 2;
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ feedback_pending: task?.feedback_pending || 0 }) });
    }
    if (endpoint === 'hris_submit_project_peer_review') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (failFirstReviewSubmission) {
        failFirstReviewSubmission = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary review service interruption.' }) });
      }
      peerReviewRpcBodies.push(body);
      peerReviews[0].status = 'submitted';
      peerReviews[0].quality_of_work_score = (body.p_scores as Record<string, number | null>).quality_of_work;
      peerReviews[0].quality_of_work_not_observed = (body.p_not_observed as string[]).includes('quality_of_work');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: reviewId, status: 'submitted' }) });
    }
    if (endpoint === 'hris_create_tenant_project') {
      const body = request.postDataJSON() as Record<string, unknown>;
      projectCreateBodies.push(body);
      const created: BrowserProject = { ...project, id: `project-${nextProjectNumber}`, code: String(body.p_code),
        name: String(body.p_name), client_name: body.p_client_name as string | null,
        description: body.p_description as string | null, project_lead_id: String(body.p_project_lead_id),
        project_lead_name: employees.find(employee => employee.id === body.p_project_lead_id)?.full_name || 'Synthetic Employee',
        start_date: String(body.p_start_date), target_end_date: body.p_target_end_date as string | null,
        status: String(body.p_status), can_manage: mode === 'project-manager', allocations: [] };
      nextProjectNumber += 1;
      projects.push(created);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) });
    }
    if (endpoint === 'hris_assign_tenant_project_allocation') {
      const body = request.postDataJSON() as Record<string, unknown>;
      allocationRpcBodies.push(body);
      const target = projects.find(row => row.id === body.p_project_id);
      if (target) target.allocations.push({ id: newAllocationId, employee_id: employeeId,
        employee_name: 'Synthetic Employee', employee_number: 'QA-001',
        role_on_project: String(body.p_role_on_project), allocation_percentage: Number(body.p_allocation_percentage),
        assigned_date: String(body.p_assigned_date), release_date: body.p_release_date as string | null,
        status: 'active' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: newAllocationId, status: 'active' }) });
    }
    if (endpoint === 'hris_release_tenant_project_allocation') {
      const body = request.postDataJSON() as Record<string, unknown>;
      allocationRpcBodies.push(body);
      for (const row of projects) for (const allocation of row.allocations) {
        if (allocation.id === body.p_allocation_id) allocation.status = 'released';
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: allocationId, status: 'released' }) });
    }
    if (endpoint === 'hris_get_my_dashboard_data') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      employee: { full_name: 'Synthetic Employee', employee_number: 'QA-001', official_email: email,
        designation_title: 'Designer', department_name: 'Product' }, dashboard_date: '2026-10-13',
      attendance: { records: [], corrections: [] }, balances: [], requests: [], leave_types: [], holidays: [], weekly_off_days: [0, 6],
    }) });
    if (endpoint === 'tenant_memberships') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(['ordinary-admin', 'ordinary-manager'].includes(mode) ? [{ tenant_id: tenantId, role: mode === 'ordinary-admin' ? 'qa_tenant_admin' : 'qa_tenant_manager', status: 'active' }] : []) });
    if (endpoint === 'employees') {
      const select = url.searchParams.get('select') || '';
      const linkedEmployee = ['project-manager', 'employee'].includes(mode) && select.includes('employment_status');
      const adminEmployeeList = ['ordinary-admin', 'ordinary-manager', 'super-admin'].includes(mode) && select.includes('full_name');
      const data = linkedEmployee ? [{ tenant_id: tenantId, employment_status: 'active' }]
        : adminEmployeeList ? employees.map(employee => ({ ...employee, employment_status: 'active' })) : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (endpoint === 'admin_users') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: mode === 'super-admin', is_super_admin: mode === 'super-admin' }) });
    if (endpoint === 'tenants') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: tenantId, name: 'Synthetic Organization', slug: 'synthetic', timezone: 'Asia/Dhaka' }]) });
    if (endpoint === 'leave_requests' || endpoint === 'leave_types' || endpoint === 'departments') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (['ordinary-admin', 'ordinary-manager', 'super-admin'].includes(mode)) await expect(page.getByRole('heading', { name: 'Projects & Resource Allocation' })).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'Personal Dashboard' })).toBeVisible();
  return { projectRpcTenants, projectCreateBodies, allocationRpcBodies, taskRpcBodies, peerReviewRpcBodies };
}

test('Super Admin creates a project and appoints its Project Manager', async ({ page }) => {
  const { projectRpcTenants, projectCreateBodies } = await openWorkspace(page, 'super-admin');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project code').fill('PRJ-002');
  await page.getByLabel('Project name').fill('People Operations Refresh');
  await page.getByLabel('Project Manager').selectOption(projectManagerId);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'People Operations Refresh' })).toBeVisible();
  expect(projectCreateBodies).toHaveLength(1);
  expect(projectCreateBodies[0].p_tenant_id).toBe(tenantId);
  expect(projectCreateBodies[0].p_project_lead_id).toBe(projectManagerId);
  expect(projectRpcTenants.every(id => id === tenantId)).toBe(true);
  await expect(page.getByRole('button', { name: 'Assign employee' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Release' })).toHaveCount(0);
});

test('ordinary Admin cannot create projects or manage project membership in the UI', async ({ page }) => {
  await openWorkspace(page, 'ordinary-admin');
  await expect(page.getByRole('heading', { name: 'Design Platform' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assign employee' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Release' })).toHaveCount(0);
});

test('ordinary Manager cannot create projects or manage project membership in the UI', async ({ page }) => {
  await openWorkspace(page, 'ordinary-manager');
  await expect(page.getByRole('heading', { name: 'Design Platform' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assign employee' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Release' })).toHaveCount(0);
});

test('assigned Project Manager can add and remove a member from their project', async ({ page }) => {
  const { projectRpcTenants, allocationRpcBodies } = await openWorkspace(page, 'project-manager');
  await page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'Project Workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Design Platform' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0);
  const projectCard = page.locator('article').filter({ hasText: 'PRJ-001' }).first();
  await projectCard.getByRole('button', { name: 'Assign employee' }).click();
  await page.getByLabel('Employee', { exact: true }).selectOption(employeeId);
  await page.getByLabel('Project role', { exact: true }).fill('Designer');
  await page.getByLabel('Allocation %', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Save allocation' }).click();
  expect(allocationRpcBodies[0].p_tenant_id).toBe(tenantId);
  page.on('dialog', dialog => dialog.accept());
  await projectCard.getByRole('button', { name: 'Release' }).first().click();
  await expect(page.getByText(/Synthetic Employee was released from the project\. Employment status is unchanged\./)).toBeVisible();
  expect(allocationRpcBodies).toHaveLength(2);
  expect(projectRpcTenants.every(id => id === tenantId)).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('assigned Project Manager creates, starts, releases, and completes a task without waiting for reviews', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { taskRpcBodies } = await openWorkspace(page, 'project-manager');
  await page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'Project Workspace', exact: true }).click();
  const manager = page.getByRole('region', { name: 'Project task management' });
  await expect(manager.getByRole('heading', { name: 'Project tasks' })).toBeVisible();
  await manager.getByRole('button', { name: 'New task' }).click();
  await manager.getByLabel('Task title *').fill('Prepare release checklist');
  await manager.locator('fieldset label').filter({ hasText: 'Synthetic Employee' }).getByRole('checkbox').check();
  await manager.getByRole('button', { name: 'Create task' }).click();

  const task = manager.locator('article').filter({ hasText: 'Prepare release checklist' });
  await expect(task).toContainText('Synthetic Employee');
  await task.getByLabel('Add member to Prepare release checklist').selectOption(collaboratorAllocationId);
  await task.getByRole('button', { name: 'Add member', exact: true }).click();
  await expect(task).toContainText('Collaborator Employee');
  await task.getByRole('button', { name: 'Start task' }).click();
  await expect(task).toContainText('in progress');

  page.once('dialog', dialog => dialog.accept());
  await task.getByRole('button', { name: 'Release Collaborator Employee from Prepare release checklist' }).click();
  await expect(task).toContainText('Feedback Pending · 1 required reviews');
  page.once('dialog', dialog => dialog.accept());
  await task.getByRole('button', { name: 'Mark complete' }).click();
  await expect(manager.getByRole('status').filter({ hasText: 'Task completed. Peer reviews remain separately tracked as Feedback Pending.' })).toBeVisible();
  await expect(task).toContainText('Feedback Pending · 2 required reviews');
  expect(taskRpcBodies.map(call => call.name)).toEqual([
    'hris_create_project_task', 'hris_assign_project_task_member', 'hris_start_project_task',
    'hris_release_project_task_member', 'hris_complete_project_task',
  ]);
  expect(taskRpcBodies.every(call => call.body.p_tenant_id === tenantId)).toBe(true);
  expect(taskRpcBodies[0].body.p_project_allocation_ids).toEqual([allocationId]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('employee submits required peer feedback with Not Observed and recovers from a temporary server error', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { peerReviewRpcBodies } = await openWorkspace(page, 'employee');
  await page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'My Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My project work' })).toBeVisible();
  await expect(page.getByText('Prepare release checklist').first()).toBeVisible();
  await expect(page.getByText('Review Collaborator Employee')).toBeVisible();
  await page.getByLabel('Quality of Work').selectOption('not_observed');
  await page.getByLabel('Collaboration & Teamwork').selectOption('5');
  await page.getByLabel('Delivery & Reliability').selectOption('4');
  await page.getByLabel('Ownership & Communication').selectOption('3');
  await page.getByLabel('Comments (optional)').fill('Collaborated during the release window.');
  const reviewCard = page.locator('article').filter({ hasText: 'Review Collaborator Employee' });
  await reviewCard.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByRole('alert')).toContainText('Temporary review service interruption.');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Review Collaborator Employee')).toBeVisible();
  await reviewCard.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByText('Review for Collaborator Employee submitted.')).toBeVisible();
  await expect(page.getByText('No peer reviews are waiting for you.')).toBeVisible();
  expect(peerReviewRpcBodies).toHaveLength(1);
  expect(peerReviewRpcBodies[0].p_tenant_id).toBe(tenantId);
  expect(peerReviewRpcBodies[0].p_review_id).toBe(reviewId);
  expect(peerReviewRpcBodies[0].p_scores).toEqual({
    quality_of_work: null, collaboration_teamwork: 5, delivery_reliability: 4, ownership_communication: 3,
  });
  expect(peerReviewRpcBodies[0].p_not_observed).toEqual(['quality_of_work']);
  expect(peerReviewRpcBodies[0].p_comments).toBe('Collaborated during the release window.');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('employee sees personal project allocations with no management actions', async ({ page }) => {
  const { projectRpcTenants } = await openWorkspace(page, 'employee');
  await page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'My Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My Projects & Allocations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Design Platform' })).toBeVisible();
  await expect(page.getByText('Designer', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign employee' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Release' })).toHaveCount(0);
  expect(projectRpcTenants).toEqual([tenantId]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
