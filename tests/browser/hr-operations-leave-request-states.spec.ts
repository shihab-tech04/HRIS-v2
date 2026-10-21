import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ timezoneId: 'Asia/Dhaka' });

const userId = 'e1111111-1111-4111-8111-111111111111';
const tenantId = 'e2222222-2222-4222-8222-222222222222';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: 'synthetic-hr-operations@example.org',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z',
};
const jwt = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated',
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1', email: user.email,
    exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic-signature',
].join('.');

test('HR leave requests match Figma normal, selected, approved, rejected, and responsive states', async ({ page }) => {
  let authenticated = false;
  let holdInitialQueueLoad = true;
  let releaseInitialQueueLoad = () => {};
  const initialQueueWait = new Promise<void>(resolve => { releaseInitialQueueLoad = resolve; });
  let initialQueueHeld = false;
  let failNextQueueLoad = false;
  let managerPermissionEnabled = true;
  const decisionCalls: Record<string, unknown>[] = [];
  const leaveCalls: Record<string, unknown>[] = [];
  const requests: Record<string, unknown>[] = [
    { id: 'e3333333-3333-4333-8333-333333333331', full_name: 'Synthetic Pending Employee', employee_number: 'HR-001',
      leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-10-20', to_date: '2026-10-21', requested_days: 2,
      submitted_at: '2026-10-12T03:00:00.000Z', reason: 'Synthetic pending leave reason', status: 'pending' },
    { id: 'e3333333-3333-4333-8333-333333333332', full_name: 'Synthetic Approved Employee', employee_number: 'HR-002',
      leave_type_name: 'Medical leave', leave_type_code: 'MED', from_date: '2026-10-22', to_date: '2026-10-22', requested_days: 1,
      submitted_at: '2026-10-13T03:00:00.000Z', reason: 'Synthetic approved leave reason', status: 'approved' },
    { id: 'e3333333-3333-4333-8333-333333333333', full_name: 'Synthetic Rejected Employee', employee_number: 'HR-003',
      leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-10-23', to_date: '2026-10-23', requested_days: 1,
      submitted_at: '2026-10-14T03:00:00.000Z', reason: 'Synthetic rejected leave reason', status: 'rejected',
      resolution_note: 'Synthetic decision note.' },
  ];

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    await route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/auth/v1/**', async route => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint.endsWith('/token')) {
      authenticated = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
    }
    if (endpoint.endsWith('/user') && authenticated) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'No local test session' }) });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') {
      const payload = request.postDataJSON() as { p_permission_id?: string };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload.p_permission_id !== 'leave.manage' || managerPermissionEnabled) });
    }
    if (endpoint === 'hris_get_tenant_dashboard_summary') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      dashboard_date: '2026-10-21', employees: 3, team_members: 3, leave_pending: requests.filter(row => row.status === 'pending').length,
      attendance_last_7_days: [], attendance_last_30_days: [],
    }) });
    if (endpoint === 'hris_get_tenant_leave_data') {
      const payload = request.postDataJSON() as { p_start?: string | null; p_end?: string | null };
      leaveCalls.push(payload);
      if (!payload.p_start && !payload.p_end && holdInitialQueueLoad) {
        holdInitialQueueLoad = false;
        initialQueueHeld = true;
        await initialQueueWait;
      }
      if (!payload.p_start && !payload.p_end && failNextQueueLoad) {
        failNextQueueLoad = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unable to load leave data.' }) });
      }
      const start = String(payload.p_start || '');
      const end = String(payload.p_end || '');
      const visibleRequests = requests.filter(row => (!start || String(row.to_date) >= start) && (!end || String(row.from_date) <= end));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        requests: visibleRequests.map(row => ({ ...row })),
        leave_types: [{ id: 'e4444444-4444-4444-8444-444444444441', name: 'Annual leave' }, { id: 'e4444444-4444-4444-8444-444444444442', name: 'Medical leave' }],
        holidays: [],
      }) });
    }
    if (endpoint === 'admin_resolve_leave_request') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      decisionCalls.push(payload);
      const row = requests.find(item => item.id === payload.p_id);
      if (row) {
        row.status = String(payload.p_decision);
        row.resolution_note = typeof payload.p_note === 'string' ? payload.p_note : undefined;
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
    }
    if (endpoint === 'tenant_memberships') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { tenant_id: tenantId, role: 'synthetic_hr_operations_admin', status: 'active' },
    ]) });
    if (endpoint === 'employees') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (endpoint === 'admin_users') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    if (endpoint === 'tenants') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: tenantId, name: 'Synthetic HR Organization', slug: 'synthetic-hr', timezone: 'Asia/Dhaka' },
    ]) });
    if (request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByText('Loading authorized leave records…')).toBeVisible();
  await page.evaluate(() => { window.location.hash = 'leave-requests'; });
  await expect.poll(() => initialQueueHeld).toBe(true);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-loading-1920x1080.png'), fullPage: true });
  releaseInitialQueueLoad();
  const table = page.getByRole('table', { name: 'Leave requests' });
  await expect(table).toBeVisible();
  for (const label of ['Name', 'Applicable From', 'Applicable To', 'Leave Type', 'Applying Date', 'Remarks', 'Action']) {
    await expect(table.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
  }
  await expect(table.getByRole('row', { name: /Synthetic Pending Employee/ })).toContainText('Synthetic pending leave reason');
  await expect(table.getByRole('row', { name: /Synthetic Pending Employee/ })).toContainText('12-10-2026');
  await expect(table.getByRole('row', { name: /Synthetic Approved Employee/ })).toHaveCount(0);
  await expect(table.getByRole('row', { name: /Synthetic Rejected Employee/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /Absence calendar/ })).toHaveCount(0);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-normal-1920x1080.png') });
  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.screenshot({ path: path.resolve(process.cwd(), `docs/evidence/ws07-leave-requests-normal-en-${width}-20261021.png`), fullPage: true });
  }

  const bulkApprove = page.getByRole('button', { name: 'Approve selected leave requests (unavailable)' });
  const bulkReject = page.getByRole('button', { name: 'Reject selected leave requests (unavailable)' });
  await expect(bulkApprove).toHaveCount(0);
  await expect(bulkReject).toHaveCount(0);
  await page.getByLabel('Select all pending leave requests').check();
  await expect(bulkApprove).toBeDisabled();
  await expect(bulkReject).toBeDisabled();
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-selected-1920x1080.png') });
  expect(decisionCalls).toHaveLength(0);

  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Filter by status', { exact: true }).selectOption('approved');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Leave Requests' })).toBeVisible();
  await expect(page.getByLabel('Select all pending leave requests')).toHaveCount(0);
  await expect(table.getByRole('row', { name: /Synthetic Approved Employee/ })).toBeVisible();
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-approved-1920x1080.png') });
  await page.getByLabel('Filter by status', { exact: true }).selectOption('rejected');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('row', { name: /Synthetic Rejected Employee/ })).toContainText('Synthetic decision note.');
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-rejected-1920x1080.png') });

  await page.getByLabel('Filter by status', { exact: true }).selectOption('pending');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Search requests', { exact: true }).fill('No matching request');
  await expect(page.getByText('No requests match these filters.')).toBeVisible();
  await page.getByLabel('Search requests', { exact: true }).fill('');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.getByLabel('অবস্থা অনুযায়ী ফিল্টার', { exact: true })).toBeVisible();
  const bengaliTable = page.getByRole('table', { name: 'ছুটির আবেদন' });
  await expect(bengaliTable.getByRole('columnheader', { name: 'মন্তব্য', exact: true })).toBeVisible();
  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: path.resolve(process.cwd(), `docs/evidence/ws07-leave-requests-normal-bn-${width}-20261021.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.getByLabel('From date', { exact: true }).fill('2026-10-20');
  await page.getByLabel('To date', { exact: true }).fill('2026-10-21');
  await page.getByRole('button', { name: 'Apply date range' }).click();
  await expect.poll(() => leaveCalls.some(call => call.p_start === '2026-10-20' && call.p_end === '2026-10-21')).toBe(true);
  await expect(table.getByRole('row', { name: /Synthetic Pending Employee/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear dates' }).click();
  await expect(table.getByRole('row', { name: /Synthetic Pending Employee/ })).toBeVisible();

  await page.getByRole('row', { name: /Synthetic Pending Employee/ }).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(table.getByRole('row', { name: /Synthetic Pending Employee/ })).toHaveCount(0);
  expect(decisionCalls).toEqual([{ p_id: requests[0].id, p_decision: 'approved', p_note: null }]);
  await page.getByLabel('Filter by status', { exact: true }).selectOption('approved');
  await expect(table.getByRole('row', { name: /Synthetic Pending Employee/ }).locator('td').last()).toContainText('Approved');
  await expect(page.getByRole('button', { name: 'Leave Requests' })).toBeVisible();
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-approved-1920x1080.png') });
  await page.getByLabel('Filter by status', { exact: true }).selectOption('all');

  failNextQueueLoad = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to load leave data.');
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-error-1920x1080.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(3);

  const rejectionRequest = { id: 'e3333333-3333-4333-8333-333333333334', full_name: 'Synthetic Rejection Employee', employee_number: 'HR-004',
    leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-10-24', to_date: '2026-10-24', requested_days: 1,
    submitted_at: '2026-10-15T03:00:00.000Z', reason: 'Synthetic leave request to reject', status: 'pending' };
  requests.push(rejectionRequest);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const rejectionRow = table.getByRole('row', { name: /Synthetic Rejection Employee/ });
  await expect(rejectionRow).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await rejectionRow.getByRole('button', { name: 'Reject', exact: true }).click();
  const leaveRejectionDialog = page.getByRole('dialog', { name: 'Reject leave request' });
  await expect(leaveRejectionDialog).toContainText('Synthetic Rejection Employee');
  const mobileLeaveDialogBounds = await leaveRejectionDialog.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, right: bounds.right };
  });
  expect(mobileLeaveDialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(mobileLeaveDialogBounds.right).toBeLessThanOrEqual(376);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await leaveRejectionDialog.getByLabel(/Decision note/).fill('Rejected with a source-backed test note.');
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-rejection-dialog-mobile-20261021.png'), fullPage: true });
  await leaveRejectionDialog.getByRole('button', { name: 'Reject request', exact: true }).click();
  await expect(rejectionRow.locator('td').last()).toContainText('Rejected');
  expect(decisionCalls).toEqual([
    { p_id: requests[0].id, p_decision: 'approved', p_note: null },
    { p_id: rejectionRequest.id, p_decision: 'rejected', p_note: 'Rejected with a source-backed test note.' },
  ]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByLabel('Filter by status', { exact: true }).selectOption('rejected');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.getByRole('row', { name: /Synthetic Rejection Employee/ })).toContainText('Rejected with a source-backed test note.');
  await expect(page.getByLabel('Select all pending leave requests')).toHaveCount(0);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-rejected-action-1920x1080.png'), fullPage: true });
  await page.getByLabel('Filter by status', { exact: true }).selectOption('all');

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('region', { name: 'Leave request results' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  const tableRegion = page.getByRole('region', { name: 'Leave request results' });
  expect(await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-mobile-375x812.png') });

  expect(leaveCalls.length).toBeGreaterThan(0);
  expect(leaveCalls.every(call => call.p_tenant_id === tenantId)).toBe(true);
  await page.evaluate(() => { window.location.hash = 'leave-calendar'; });
  await expect(page.getByRole('heading', { level: 2, name: 'Absence calendar' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Absence calendar/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Leave requests' })).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = 'leave-policy'; });
  await expect(page.getByRole('heading', { level: 2, name: 'Leave policy' })).toBeVisible();
  await expect(page.getByText('Leave types', { exact: true })).toBeVisible();

  managerPermissionEnabled = false;
  await page.evaluate(() => { window.location.hash = ''; });
  await page.reload();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Filter by status', { exact: true }).selectOption('all');
  await expect(page.getByRole('table', { name: 'Leave requests' })).toBeVisible();
  await expect(page.getByLabel('Select all pending leave requests')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = 'leave-policy'; });
  await expect(page.getByRole('alert')).toContainText('You do not have permission to manage leave policy.');
  requests.splice(0, requests.length);
  await page.evaluate(() => { window.location.hash = ''; });
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('No leave requests were returned for this tenant.')).toBeVisible();
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/ws07-leave-requests-empty-1920x1080.png'), fullPage: true });
});
