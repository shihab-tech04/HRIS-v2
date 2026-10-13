import { test, expect } from '@playwright/test';

const tenantId = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const managerId = 'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const employeeId = 'fccccccc-cccc-4ccc-8ccc-cccccccccccc';
const projectId = 'fddddddd-dddd-4ddd-8ddd-dddddddddddd';
const allocationId = 'feeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
type BrowserAllocation = {
  id: string; employee_id: string; employee_name: string; employee_number: string;
  role_on_project: string; allocation_percentage: number; assigned_date: string;
  release_date: string | null; status: string;
};
type BrowserProject = {
  id: string; tenant_id: string; code: string; name: string; client_name: string | null;
  description: string | null; project_lead_id: string; project_lead_name: string;
  start_date: string; target_end_date: string | null; status: string;
  allocations: BrowserAllocation[];
};

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

async function openWorkspace(page: import('@playwright/test').Page, mode: 'manager' | 'employee') {
  const userId = mode === 'manager' ? managerId : employeeId;
  const email = mode === 'manager' ? 'project-manager@hris.test' : 'project-employee@hris.test';
  const { user, token } = authFixture(userId, email);
  const project: BrowserProject = {
    id: projectId, tenant_id: tenantId, code: 'PRJ-001', name: 'Design Platform',
    client_name: 'QA Client', description: 'Synthetic end-to-end project.',
    project_lead_id: employeeId, project_lead_name: 'Synthetic Employee',
    start_date: '2026-10-01', target_end_date: '2026-12-31', status: 'active', allocations: [],
  };
  const employees = [{ id: employeeId, employee_number: 'QA-001', full_name: 'Synthetic Employee' }];
  const projects = [project];
  let nextProjectNumber = 2;
  const projectRpcTenants: string[] = [];
  const allocationRpcBodies: Record<string, unknown>[] = [];

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
      const granted = mode === 'manager' && (permission === 'organization.view' || permission === 'organization.manage');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(granted) });
    }
    if (endpoint === 'hris_get_tenant_project_workspace') {
      const body = request.postDataJSON() as { p_tenant_id?: string };
      projectRpcTenants.push(body.p_tenant_id || '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects, employees }) });
    }
    if (endpoint === 'hris_get_my_projects') {
      const body = request.postDataJSON() as { p_tenant_id?: string };
      projectRpcTenants.push(body.p_tenant_id || '');
      const mine = mode === 'employee' ? [{ allocation_id: allocationId, project_id: projectId,
        project_code: 'PRJ-001', project_name: 'Design Platform', client_name: 'QA Client',
        project_lead_name: 'Project Lead', project_status: 'active', role_on_project: 'Designer',
        allocation_percentage: 60, assigned_date: '2026-10-01', release_date: null, status: 'active' }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: mine }) });
    }
    if (endpoint === 'hris_create_tenant_project') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const created = { ...project, id: `project-${nextProjectNumber}`, code: String(body.p_code),
        name: String(body.p_name), client_name: body.p_client_name as string | null,
        description: body.p_description as string | null, project_lead_id: String(body.p_project_lead_id),
        project_lead_name: 'Synthetic Employee', start_date: String(body.p_start_date),
        target_end_date: body.p_target_end_date as string | null, status: String(body.p_status), allocations: [] };
      nextProjectNumber += 1;
      projects.push(created);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) });
    }
    if (endpoint === 'hris_assign_tenant_project_allocation') {
      const body = request.postDataJSON() as Record<string, unknown>;
      allocationRpcBodies.push(body);
      const target = projects.find(row => row.id === body.p_project_id);
      if (target) target.allocations.push({ id: allocationId, employee_id: employeeId,
        employee_name: 'Synthetic Employee', employee_number: 'QA-001',
        role_on_project: String(body.p_role_on_project), allocation_percentage: Number(body.p_allocation_percentage),
        assigned_date: String(body.p_assigned_date), release_date: body.p_release_date as string | null,
        status: 'active' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: allocationId, status: 'active' }) });
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
    if (endpoint === 'tenant_memberships') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'manager' ? [{ tenant_id: tenantId, role: 'qa_tenant_manager', status: 'active' }] : []) });
    if (endpoint === 'employees') {
      const select = url.searchParams.get('select') || '';
      const linkedEmployee = mode === 'employee' && select.includes('employment_status');
      const adminEmployeeList = mode === 'manager' && select.includes('full_name');
      const data = linkedEmployee ? [{ tenant_id: tenantId, employment_status: 'active' }]
        : adminEmployeeList ? [{ id: employeeId, full_name: 'Synthetic Employee', employee_number: 'QA-001', employment_status: 'active' }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (endpoint === 'admin_users') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    if (endpoint === 'tenants') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: tenantId, name: 'Synthetic Organization', slug: 'synthetic', timezone: 'Asia/Dhaka' }]) });
    if (endpoint === 'leave_requests' || endpoint === 'leave_types' || endpoint === 'departments') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (mode === 'manager') await expect(page.getByRole('heading', { name: 'Projects & Resource Allocation' })).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'Personal Dashboard' })).toBeVisible();

  return { projectRpcTenants, allocationRpcBodies };
}

test('organization manager creates a project, assigns a resource, and releases the allocation', async ({ page }) => {
  const { projectRpcTenants, allocationRpcBodies } = await openWorkspace(page, 'manager');
  await expect(page.getByRole('heading', { name: 'Design Platform' })).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project code').fill('PRJ-002');
  await page.getByLabel('Project name').fill('People Operations Refresh');
  await page.getByLabel('Project lead').selectOption(employeeId);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'People Operations Refresh' })).toBeVisible();

  const projectCard = page.locator('article').filter({ hasText: 'PRJ-001' }).first();
  await projectCard.getByRole('button', { name: 'Assign employee' }).click();
  await page.getByLabel('Employee', { exact: true }).selectOption(employeeId);
  await page.getByLabel('Project role', { exact: true }).fill('Designer');
  await page.getByLabel('Allocation %', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Save allocation' }).click();
  const allocationRow = projectCard.getByRole('row').filter({ hasText: 'QA-001' });
  await expect(allocationRow).toContainText('Synthetic Employee');
  await expect(allocationRow).toContainText('60%');

  page.on('dialog', dialog => dialog.accept());
  await projectCard.getByRole('button', { name: 'Release' }).click();
  await expect(projectCard.getByText('released', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Employment status is unchanged');
  expect(projectRpcTenants.length).toBeGreaterThan(1);
  expect(projectRpcTenants.every(id => id === tenantId)).toBe(true);
  expect(allocationRpcBodies.map(body => body.p_tenant_id)).toEqual([tenantId, tenantId]);

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('employee sees only their personal project allocations and no management actions', async ({ page }) => {
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
