import { test, expect } from '@playwright/test';

const userId = 'e1111111-1111-4111-8111-111111111111';
const tenantId = 'e2222222-2222-4222-8222-222222222222';
const user = { id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-superadmin@example.org', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated',
  role: 'authenticated', email: user.email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

async function interceptAuth(page: import('@playwright/test').Page, teamTenantFilters: string[] = []) {
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ access_token: jwt, refresh_token: 'synthetic-refresh',
          token_type: 'bearer', expires_in: 3600, user }) });
      return;
    }
    if (path.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop() ?? '';
    if (endpoint === 'teams') teamTenantFilters.push(url.searchParams.get('tenant_id') || '');
    if (url.pathname.includes('/rpc/')) {
      const rpcData: Record<string, unknown> = {
        has_tenant_permission: true,
        hris_get_tenant_dashboard_summary: {
          team_members: 1, employees: 1, attendance_today: 1,
          present_today: 1, absent_today: 0, wfo_today: 1, wfh_today: 0,
          client_meeting_today: 0, on_leave_today: 0, late_today: 0,
          attendance_corrections_pending: 0, leave_pending: 0, approvals_pending: 0,
          attendance_last_7_days: [], attendance_last_30_days: [],
        },
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rpcData[endpoint] ?? {}) });
      return;
    }
    const requested = url.searchParams.get('select') || '';
    let data: unknown = [];
    if (endpoint === 'tenant_memberships') data = [{ tenant_id: tenantId, role: 'qa_tenant_superadmin', status: 'active' }];
    else if (endpoint === 'employees') {
      data = requested.includes('full_name')
        ? [{ id: 'emp-1', full_name: 'Synthetic Test Employee', employee_number: 'TEST-01', employment_status: 'active' }]
        : [];
    }
    else if (endpoint === 'admin_users') data = { active: true, is_super_admin: true };
    else if (endpoint === 'tenants') data = requested === 'id'
      ? { id: tenantId } : [{ id: tenantId, name: 'Synthetic Synesis', slug: 'synesis-it', timezone: 'Asia/Dhaka' }];
    else if (endpoint === 'departments') data = [
      { id: 'dept-1', name: 'Engineering' },
      { id: 'dept-2', name: 'Customer Success' },
    ];
    else if (endpoint === 'teams') data = [
      { id: 'team-1', name: 'Design Systems', code: 'DS', department_id: 'dept-1', active: true },
      { id: 'team-2', name: 'Client Operations', code: 'OPS', department_id: 'dept-2', active: false },
    ];
    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}

test('Super Admin with active tenant membership opens the authorized HRIS workspace', async ({ page }) => {
  await interceptAuth(page);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByText('synthetic-superadmin@example.org')).toBeVisible();
  await expect(page.getByText('Super Administrator')).toBeVisible();
  const moduleNav = page.getByRole('navigation', { name: 'HRIS modules' });
  await expect(moduleNav).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Managerial Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today’s Attendance Summary' })).toBeVisible();
  await expect(moduleNav.getByRole('button', { name: /Attendance/ })).toBeVisible();
  await expect(moduleNav.getByRole('button', { name: /Leave/ })).toBeVisible();
  await expect(page.getByText(/No schedule-based late marks or sample counts are substituted/)).toBeVisible();

  await moduleNav.getByRole('button', { name: /Leave/ }).click();
  await expect(page.getByRole('heading', { name: 'Leave Requests' })).toBeVisible();
});

test('organization Teams directory filters only the active tenant rows', async ({ page }) => {
  const teamTenantFilters: string[] = [];
  await interceptAuth(page, teamTenantFilters);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const moduleNav = page.getByRole('navigation', { name: 'HRIS modules' });
  const teamsNav = moduleNav.getByRole('button', { name: 'Teams', exact: true });
  await expect(teamsNav).toBeVisible();
  await teamsNav.click();
  await expect(page.getByRole('heading', { name: 'Teams', exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: 'Organization teams' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('Design Systems');
  await expect(table).not.toContainText('Client Operations');
  await expect(table).toContainText('Engineering');

  await page.getByLabel('Team status').selectOption('all');
  await page.getByLabel('Search teams').fill('Customer Success');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('Client Operations');
  await expect(table).not.toContainText('Design Systems');

  await page.getByLabel('Team status').selectOption('inactive');
  await expect(table).toContainText('Inactive');
  expect(teamTenantFilters.length).toBeGreaterThan(0);
  expect(teamTenantFilters.every(value => value === `eq.${tenantId}`)).toBe(true);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('heading', { name: 'Teams', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const tableRegion = page.getByRole('region', { name: 'Scrollable teams table' });
  expect(await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
});
