import { test, expect } from '@playwright/test';

const userId = 'e1111111-1111-4111-8111-111111111111';
const tenantId = 'e2222222-2222-4222-8222-222222222222';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: 'synthetic-leave-manager@hris.test',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwt = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated',
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1', email: user.email,
    exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic-signature',
].join('.');

test('manager filters the leave queue and completes approval and rejection actions', async ({ page }) => {
  let authenticated = false;
  let failNextLeaveLoad = false;
  const decisions: Record<string, unknown>[] = [];
  const requests = [
    { id: 'e3333333-3333-4333-8333-333333333331', full_name: 'Amira Rahman', employee_number: 'QA-001', leave_type_name: 'Medical leave', leave_type_code: 'MED', from_date: '2026-10-20', to_date: '2026-10-20', requested_days: 1, status: 'pending' },
    { id: 'e3333333-3333-4333-8333-333333333332', full_name: 'Tanim Chowdhury', employee_number: 'QA-002', leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-10-21', to_date: '2026-10-22', requested_days: 2, status: 'pending' },
    { id: 'e3333333-3333-4333-8333-333333333333', full_name: 'Amira Rahman', employee_number: 'QA-001', leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-09-02', to_date: '2026-09-03', requested_days: 2, status: 'approved' },
    { id: 'e3333333-3333-4333-8333-333333333334', full_name: 'Nabil Hasan', employee_number: 'QA-003', leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-08-17', to_date: '2026-08-17', requested_days: 1, status: 'rejected', resolution_note: 'Policy evidence was incomplete.' },
  ];

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    await route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      authenticated = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
    }
    if (path.endsWith('/user') && authenticated) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'No local test session' }) });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const endpoint = path.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
    if (endpoint === 'hris_get_tenant_dashboard_summary') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      team_members: 5, employees: 5, present_today: 3, absent_today: 0, wfo_today: 2, wfh_today: 1,
      client_meeting_today: 0, on_leave_today: 0, late_today: 0, attendance_corrections_pending: 0,
      leave_pending: requests.filter(item => item.status === 'pending').length,
      attendance_last_7_days: [],
    }) });
    if (endpoint === 'hris_get_tenant_leave_data') {
      if (failNextLeaveLoad) {
        failNextLeaveLoad = false;
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic leave service unavailable.' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        requests: requests.map(item => ({ ...item })),
        leave_types: [{ id: 'e4444444-4444-4444-8444-444444444441', name: 'Annual leave' }, { id: 'e4444444-4444-4444-8444-444444444442', name: 'Medical leave' }],
        holidays: [{ id: 'e5555555-5555-4555-8555-555555555551', name: 'Synthetic holiday', start_date: '2026-12-16', end_date: '2026-12-16', active: true }],
      }) });
    }
    if (endpoint === 'admin_resolve_leave_request') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      decisions.push(payload);
      const row = requests.find(item => item.id === payload.p_id);
      if (row) {
        row.status = String(payload.p_decision);
        row.resolution_note = typeof payload.p_note === 'string' ? payload.p_note : undefined;
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
    }
    if (endpoint === 'tenant_memberships') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { tenant_id: tenantId, role: 'synthetic_hr_manager', status: 'active' },
    ]) });
    if (endpoint === 'employees') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (endpoint === 'admin_users') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    if (endpoint === 'tenants') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: tenantId, name: 'Synthetic Organization', slug: 'synthetic', timezone: 'Asia/Dhaka' },
    ]) });
    if (request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Managerial Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leave Requests' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Organization holidays' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Organization holidays' }).getByRole('row', { name: /Synthetic holiday/ })).toContainText('2026-12-16');

  const table = page.getByRole('table', { name: 'Leave requests' });
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await expect(table.getByRole('row', { name: /Nabil Hasan/ })).toContainText('Decision note: Policy evidence was incomplete.');
  await page.getByLabel('Filter by status').selectOption('pending');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('Search requests').fill('Tanim');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('row', { name: /Tanim Chowdhury/ })).toContainText('Annual leave');

  await page.getByLabel('Search requests').fill('');
  await page.getByLabel('Search requests').fill('Amira');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Leave request approved.')).toBeVisible();
  await page.getByLabel('Filter by status').selectOption('all');
  await expect(table.getByRole('row', { name: /Amira Rahman.*Medical leave/ })).toContainText('approved');
  expect(decisions[0]).toEqual({ p_id: 'e3333333-3333-4333-8333-333333333331', p_decision: 'approved', p_note: null });

  await page.getByLabel('Filter by status').selectOption('pending');
  await page.getByLabel('Search requests').fill('');
  await page.getByLabel('Search requests').fill('Tanim');
  await table.getByRole('button', { name: 'Reject' }).click();
  const rejectionDialog = page.getByRole('dialog', { name: 'Reject leave request' });
  await expect(rejectionDialog).toBeVisible();
  await expect(rejectionDialog).toContainText('Tanim Chowdhury');
  await rejectionDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(rejectionDialog).toBeHidden();
  expect(decisions).toHaveLength(1);

  await table.getByRole('button', { name: 'Reject' }).click();
  const escapedRejection = page.getByRole('dialog', { name: 'Reject leave request' });
  await page.keyboard.press('Escape');
  await expect(escapedRejection).toBeHidden();
  await expect(table.getByRole('button', { name: 'Reject' })).toBeFocused();
  expect(decisions).toHaveLength(1);

  await table.getByRole('button', { name: 'Reject' }).click();
  const confirmedRejection = page.getByRole('dialog', { name: 'Reject leave request' });
  await confirmedRejection.getByLabel('Decision note (optional)').fill('Please correct the requested dates before resubmitting.');
  await confirmedRejection.getByRole('button', { name: 'Reject request' }).click();
  await expect(page.getByText('Leave request rejected.')).toBeVisible();
  await page.getByLabel('Filter by status').selectOption('all');
  await expect(table.getByRole('row', { name: /Tanim Chowdhury/ })).toContainText('rejected');
  await expect(table.getByRole('row', { name: /Tanim Chowdhury/ })).toContainText('Decision note: Please correct the requested dates before resubmitting.');
  expect(decisions[1]).toEqual({ p_id: 'e3333333-3333-4333-8333-333333333332', p_decision: 'rejected', p_note: 'Please correct the requested dates before resubmitting.' });

  await page.getByLabel('Search requests').fill('No matching employee');
  await expect(page.getByText('No requests match these filters.')).toBeVisible();
  await page.getByLabel('Search requests').fill('');
  await page.getByLabel('Filter by status').selectOption('all');
  failNextLeaveLoad = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to load leave data.');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('region', { name: 'Leave request results' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
});
