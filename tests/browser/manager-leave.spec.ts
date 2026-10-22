import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

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
  let failNextLeaveDecision = false;
  let failNextEvidenceDownload = false;
  let failAbsenceUntilRetry = false;
  const decisions: Record<string, unknown>[] = [];
  const evidenceDownloads: string[] = [];
  const absenceWindows: Array<{ p_tenant_id?: string | null; p_start?: string | null; p_end?: string | null }> = [];
  const failedAbsenceWindows: string[] = [];
  const requests = [
    { id: 'e3333333-3333-4333-8333-333333333331', full_name: 'Amira Rahman', employee_number: 'QA-001', leave_type_name: 'Medical leave', leave_type_code: 'MED', from_date: '2026-10-20', to_date: '2026-10-20', requested_days: 1, status: 'pending', attachment_url: `${userId}/${tenantId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf` },
    { id: 'e3333333-3333-4333-8333-333333333332', full_name: 'Tanim Chowdhury', employee_number: 'QA-002', leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-10-21', to_date: '2026-10-22', requested_days: 2, status: 'pending' },
    { id: 'e3333333-3333-4333-8333-333333333333', full_name: 'Amira Rahman', employee_number: 'QA-001', leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-09-30', to_date: '2026-10-02', requested_days: 2, status: 'approved' },
    { id: 'e3333333-3333-4333-8333-333333333334', full_name: 'Nabil Hasan', employee_number: 'QA-003', leave_type_name: 'Annual leave', leave_type_code: 'ANN', from_date: '2026-08-17', to_date: '2026-08-17', requested_days: 1, status: 'rejected', resolution_note: 'Policy evidence was incomplete.' },
  ];

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    await route.abort();
  });
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
  await page.route('**/storage/v1/object/leave-evidence/**', async route => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname.split('/object/leave-evidence/')[1] || '');
    evidenceDownloads.push(path);
    if (failNextEvidenceDownload) {
      failNextEvidenceDownload = false;
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Storage access denied by policy.' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 synthetic private evidence') });
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
      const payload = request.method() === 'POST' ? request.postDataJSON() as { p_start?: string | null; p_end?: string | null } : {};
      if (payload.p_start || payload.p_end) absenceWindows.push(payload);
      if (payload.p_start === '2026-12-01' && failAbsenceUntilRetry) {
        failedAbsenceWindows.push(`${payload.p_start}/${payload.p_end}`);
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic absence calendar outage.' }) });
      }
      if (failNextLeaveLoad) {
        failNextLeaveLoad = false;
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic leave service unavailable.' }) });
      }
      const start = String(payload.p_start || '');
      const end = String(payload.p_end || '');
      const filteredRequests = requests.filter(item => (!start || item.to_date >= start) && (!end || item.from_date <= end));
      const holidays = [
        { id: 'e5555555-5555-4555-8555-555555555551', name: 'Synthetic holiday', start_date: '2026-10-03', end_date: '2026-10-03', active: true },
        { id: 'e5555555-5555-4555-8555-555555555552', name: 'December synthetic holiday', start_date: '2026-12-16', end_date: '2026-12-16', active: true },
      ]
        .filter(item => (!start || item.end_date >= start) && (!end || item.start_date <= end));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        requests: filteredRequests.map(item => ({ ...item })),
        leave_types: [{ id: 'e4444444-4444-4444-8444-444444444441', name: 'Annual leave' }, { id: 'e4444444-4444-4444-8444-444444444442', name: 'Medical leave' }],
        holidays,
      }) });
    }
    if (endpoint === 'admin_resolve_leave_request') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      decisions.push(payload);
      if (failNextLeaveDecision) {
        failNextLeaveDecision = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary decision outage.' }) });
      }
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
  await page.getByRole('button', { name: 'Attendance & Leave', exact: true }).click();
  await page.getByRole('button', { name: 'Leave Requests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leave Requests' })).toBeVisible();
  // Approved Figma now defaults to the request queue; calendar content lives behind More options.
  const leaveTable = page.getByRole('table', { name: 'Leave requests' });
  await expect(leaveTable).toBeVisible();
  await page.locator('button[aria-controls="leave-request-advanced-filters"]').click();
  await expect(page.locator('#leave-request-status')).toHaveValue('pending');
  await expect(leaveTable.locator('tbody tr')).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));

  const shellEvidenceDir = path.resolve(process.cwd(), 'docs/evidence/ws01-shell');
  await mkdir(shellEvidenceDir, { recursive: true });
  for (const width of [1920, 1280, 768, 375]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1117 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: path.join(shellEvidenceDir, `leave-en-${width}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.getByRole('heading', { name: 'ছুটির আবেদনসমূহ' })).toBeVisible();
  for (const width of [1920, 1280, 768, 375]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1117 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: path.join(shellEvidenceDir, `leave-bn-${width}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Switch language to English' }).click();

  await page.getByRole('button', { name: 'More options', exact: true }).click();
  const leaveSections = page.getByRole('navigation', { name: 'Leave management sections' });
  await leaveSections.getByRole('button', { name: 'Absence calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organization holidays', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Organization holidays' }).getByRole('row', { name: /December synthetic holiday/ })).toContainText('2026-12-16');
  const calendarMonth = page.getByLabel('Month', { exact: true });
  await calendarMonth.fill('2026-11');
  await expect(page.getByRole('region', { name: 'Absence calendar November 2026' })).toBeVisible();
  const absenceWindowsBeforeDecember = absenceWindows.length;
  failAbsenceUntilRetry = true;
  await calendarMonth.fill('2026-12');
  await expect.poll(() => absenceWindows.length > absenceWindowsBeforeDecember).toBe(true);
  await expect.poll(() => failedAbsenceWindows.length > 0).toBe(true);
  const calendarError = page.getByRole('alert').filter({ hasText: 'Unable to load the absence calendar.' });
  await expect(calendarError).toBeVisible();
  failAbsenceUntilRetry = false;
  await calendarError.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('region', { name: 'Absence calendar December 2026' })).toBeVisible();
  await calendarMonth.fill('2026-10');
  const octoberCalendar = page.getByRole('region', { name: 'Absence calendar October 2026' });
  await expect(octoberCalendar).toBeVisible();
  await expect(octoberCalendar.getByRole('button', { name: /October 1, 2026, 1 people on leave/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Approved absences on/ }).locator('..')).toContainText('Amira Rahman');
  await octoberCalendar.getByRole('button', { name: /October 3, 2026.*Synthetic holiday/ }).click();
  await expect(page.getByRole('heading', { name: /Organization holidays on/ }).locator('..')).toContainText('Synthetic holiday');
  expect(absenceWindows).toContainEqual({ p_tenant_id: tenantId, p_start: '2026-10-01', p_end: '2026-10-31' });
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.locator('#leave-absence-calendar-heading')).toBeVisible();
  await expect(page.getByRole('button', { name: 'আগের মাস' })).toBeVisible();
  // Request-only date filters are asserted after returning to the requests tab below.
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const width of [1920, 1280, 768, 375]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1117 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: path.join(shellEvidenceDir, `leave-bn-${width}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  failAbsenceUntilRetry = true;
  await page.locator('#leave-absence-month').fill('2026-12');
  const bengaliCalendarError = page.getByRole('alert').filter({ hasText: 'অনুপস্থিতির ক্যালেন্ডার লোড করা যায়নি।' });
  await expect(bengaliCalendarError).toBeVisible();
  failAbsenceUntilRetry = false;
  await bengaliCalendarError.getByRole('button', { name: 'আবার চেষ্টা করুন' }).click();
  await expect(page.getByRole('region', { name: /অনুপস্থিতির ক্যালেন্ডার.*ডিসেম্বর/ })).toBeVisible();
  await page.getByRole('navigation', { name: 'ছুটি ব্যবস্থাপনার বিভাগসমূহ' })
    .getByRole('button', { name: 'ছুটির আবেদনসমূহ', exact: true }).click();
  const table = page.getByRole('table', { name: 'Leave requests' });
  const requestFrom = page.locator('#leave-request-from');
  const requestTo = page.locator('#leave-request-to');
  const statusFilter = page.locator('#leave-request-status');
  await expect(page.getByLabel('শুরুর তারিখ', { exact: true })).toBeVisible();
  await expect(page.getByLabel('শেষ তারিখ', { exact: true })).toBeVisible();
  await expect(page.getByLabel('অবস্থা অনুযায়ী ফিল্টার', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'তারিখের সীমা প্রয়োগ করুন', exact: true })).toBeVisible();
  await expect(statusFilter).toHaveValue('pending');
  await statusFilter.selectOption('all');
  await requestFrom.fill('2026-10-01');
  await requestTo.fill('2026-10-01');
  await page.getByRole('button', { name: 'তারিখের সীমা প্রয়োগ করুন', exact: true }).click();
  await expect(page.getByLabel('শুরুর তারিখ', { exact: true })).toBeVisible();
  await expect(page.getByLabel('শেষ তারিখ', { exact: true })).toBeVisible();
  await expect(statusFilter).toHaveValue('all');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('row', { name: /Amira Rahman.*Annual leave/ })).toContainText('approved');
  expect(absenceWindows).toContainEqual({ p_tenant_id: tenantId, p_start: '2026-10-01', p_end: '2026-10-01' });

  const managerEvidence = path.resolve(process.cwd(), 'docs/evidence/ws08');
  await mkdir(managerEvidence, { recursive: true });
  for (const viewport of [{ width: 768, height: 1024 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    await expect(page.getByLabel('শুরুর তারিখ', { exact: true })).toBeVisible();
    await expect(page.getByLabel('শেষ তারিখ', { exact: true })).toBeVisible();
    await expect(page.getByLabel('অবস্থা অনুযায়ী ফিল্টার', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'তারিখের সীমা প্রয়োগ করুন', exact: true })).toBeVisible();
    await expect(statusFilter).toHaveValue('all');
    await page.screenshot({ path: path.join(managerEvidence, `ws08-manager-leave-filters-bn-${viewport.width}x${viewport.height}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await expect(statusFilter).toHaveValue('all');

  await requestFrom.fill('2026-10-22');
  await requestTo.fill('2026-10-21');
  await page.getByRole('button', { name: 'Apply date range', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The end date must be on or after the start date.');
  await expect(table.locator('tbody tr')).toHaveCount(1);

  await requestFrom.fill('2026-10-20');
  await requestTo.fill('2026-10-22');
  await page.getByRole('button', { name: 'Apply date range', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: 'Showing 2 of 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await expect(table.getByRole('row', { name: /Nabil Hasan/ })).toContainText('Policy evidence was incomplete.');
  const evidenceDownload = page.waitForEvent('download');
  await table.getByRole('button', { name: 'Download evidence for Amira Rahman’s Medical leave leave request' }).click();
  expect((await evidenceDownload).suggestedFilename()).toBe('leave-evidence-e3333333.pdf');
  expect(evidenceDownloads).toEqual([`${userId}/${tenantId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`]);
  await expect(page.getByRole('status').filter({ hasText: 'Evidence downloaded.' })).toBeVisible();
  failNextEvidenceDownload = true;
  await table.getByRole('button', { name: 'Download evidence for Amira Rahman’s Medical leave leave request' }).click();
  await expect(page.getByRole('alert')).toContainText('Storage access denied by policy.');
  expect(evidenceDownloads).toHaveLength(2);
  await page.getByLabel('Filter by status').selectOption('pending');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('Search requests').fill('Tanim');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('row', { name: /Tanim Chowdhury/ })).toContainText('Annual leave');

  await page.getByLabel('Search requests').fill('');
  await page.getByLabel('Search requests').fill('Amira');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  failNextLeaveDecision = true;
  await table.getByRole('button', { name: 'Approve' }).click();
  const decisionAlert = page.getByRole('alert').filter({ hasText: 'Unable to resolve this leave request.' });
  await expect(decisionAlert).toBeVisible();
  await expect(decisionAlert.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(table.getByRole('row', { name: /Amira Rahman.*Medical leave/ })).toContainText('pending');
  expect(decisions).toHaveLength(1);
  await table.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Leave request approved.')).toBeVisible();
  await page.getByLabel('Filter by status').selectOption('all');
  await expect(table.getByRole('row', { name: /Amira Rahman.*Medical leave/ })).toContainText('approved');
  expect(decisions[1]).toEqual({ p_id: 'e3333333-3333-4333-8333-333333333331', p_decision: 'approved', p_note: null });

  await page.getByLabel('Filter by status').selectOption('pending');
  await page.getByLabel('Search requests').fill('');
  await page.getByLabel('Search requests').fill('Tanim');
  await table.getByRole('button', { name: 'Reject' }).click();
  const rejectionDialog = page.getByRole('dialog', { name: 'Reject leave request' });
  await expect(rejectionDialog).toBeVisible();
  await expect(rejectionDialog).toContainText('Tanim Chowdhury');
  await rejectionDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(rejectionDialog).toBeHidden();
  expect(decisions).toHaveLength(2);

  await table.getByRole('button', { name: 'Reject' }).click();
  const escapedRejection = page.getByRole('dialog', { name: 'Reject leave request' });
  await page.keyboard.press('Escape');
  await expect(escapedRejection).toBeHidden();
  await expect(table.getByRole('button', { name: 'Reject' })).toBeFocused();
  expect(decisions).toHaveLength(2);

  await table.getByRole('button', { name: 'Reject' }).click();
  const confirmedRejection = page.getByRole('dialog', { name: 'Reject leave request' });
  await confirmedRejection.getByLabel('Decision note (optional)').fill('Please correct the requested dates before resubmitting.');
  await confirmedRejection.getByRole('button', { name: 'Reject request' }).click();
  await expect(page.getByText('Leave request rejected.')).toBeVisible();
  await page.getByLabel('Filter by status').selectOption('all');
  await expect(table.getByRole('row', { name: /Tanim Chowdhury/ })).toContainText('rejected');
  await expect(table.getByRole('row', { name: /Tanim Chowdhury/ })).toContainText('Please correct the requested dates before resubmitting.');
  expect(decisions[2]).toEqual({ p_id: 'e3333333-3333-4333-8333-333333333332', p_decision: 'rejected', p_note: 'Please correct the requested dates before resubmitting.' });

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
  await expect(page.getByLabel('From date', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
});
