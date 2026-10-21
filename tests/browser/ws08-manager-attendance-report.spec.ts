import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test.use({ timezoneId: 'Asia/Dhaka' });

const userId = 'f1111111-1111-4111-8111-111111111111';
const tenantId = 'f2222222-2222-4222-8222-222222222222';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: 'synthetic-ws08-manager@hris.test',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwt = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', email: user.email,
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic-signature',
].join('.');

async function signInReportManager(
  page: import('@playwright/test').Page,
  options: { reportAllowed?: boolean; detailAllowed?: boolean; reportState?: 'rows' | 'empty' | 'error'; delayReportMs?: number } = {},
) {
  const { reportAllowed = true, detailAllowed = false, reportState = 'rows', delayReportMs = 0 } = options;
  const calls: Record<string, unknown>[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost'
        || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return route.continue();
    await route.abort();
  });
  await page.route('**/auth/v1/**', async route => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
    } else if (requestPath.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    } else {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'No local test session' }) });
    }
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') {
      const permission = request.postDataJSON() as { p_permission_id?: string };
      const allowed = permission.p_permission_id === 'reports.view' ? reportAllowed
        : permission.p_permission_id === 'attendance.view' ? detailAllowed : false;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(allowed) });
      return;
    }
    if (endpoint === 'hris_get_tenant_attendance_data') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      calls.push(payload);
      if (delayReportMs) await new Promise(resolve => setTimeout(resolve, delayReportMs));
      if (reportState === 'error') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'WS08_SYNTHETIC_UNAVAILABLE', message: 'Unable to load attendance records.', details: '', hint: '',
        }) });
        return;
      }
      const rows = [
        { employee_id: 'f3333333-3333-4333-8333-333333333331', employee_number: 'WS08-001', employee_name: 'Synthetic Positive Employee',
          department_name: 'Product', designation_title: 'UX Designer', team_name: 'Design', attendance_days: 8, office_hours: 45, working_hours: 46.48, deviation: 1.48 },
        { employee_id: 'f3333333-3333-4333-8333-333333333332', employee_number: 'WS08-002', employee_name: 'Synthetic Negative Employee',
          department_name: 'Product', designation_title: 'Engineer', team_name: 'Engineering', attendance_days: 8, office_hours: 45, working_hours: 44.3, deviation: -0.7 },
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
        payload.p_report === true ? reportState === 'empty' ? [] : rows : {
          records: reportState === 'empty' ? [] : [
            { id: 'f4444444-4444-4444-8444-444444444441', employee_id: 'f3333333-3333-4333-8333-333333333331',
              employee_number: 'WS08-001', full_name: 'Synthetic Attendance Employee', department_name: 'Product',
              designation_title: 'UX Designer', team_name: 'Design', attendance_date: '2026-10-12',
              check_in: '2026-10-12T03:13:16.000Z', check_out: '2026-10-12T11:46:58.000Z',
              work_mode: 'office', status: 'present', work_hours: 8.56 },
            { id: 'f4444444-4444-4444-8444-444444444442', employee_id: 'f3333333-3333-4333-8333-333333333332',
              employee_number: 'WS08-002', full_name: 'Synthetic Late Employee', department_name: 'Product',
              designation_title: 'Engineer', team_name: 'Engineering', attendance_date: '2026-10-12',
              check_in: '2026-10-12T04:00:00.000Z', check_out: '2026-10-12T11:00:00.000Z',
              work_mode: 'home', status: 'late', work_hours: 7 },
          ].filter(row => payload.p_status ? row.status === payload.p_status : true), corrections: [],
        },
      ) });
      return;
    }
    if (endpoint === 'tenant_memberships') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ tenant_id: tenantId, role: 'qa_attendance_report_manager', status: 'active' }]) });
    } else if (endpoint === 'employees') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else if (endpoint === 'admin_users') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    } else if (endpoint === 'tenants') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: tenantId, name: 'Synthetic WS08 Tenant', slug: 'ws08-synthetic', timezone: 'Asia/Dhaka' }]) });
    } else if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  return calls;
}

test('Manager daily attendance information matches Figma node 17:28694 and stays responsive', async ({ page }) => {
  const attendanceCalls = await signInReportManager(page, { reportAllowed: false, detailAllowed: true });
  const attendanceNavigation = page.getByRole('navigation', { name: 'HRIS modules' });
  await expect(attendanceNavigation.getByRole('button', { name: 'Attendance', exact: true })).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Attendance Report', exact: true });
  const report = page.getByRole('table', { name: 'Attendance Information' });
  await expect(heading).toBeVisible();
  await expect(report).toBeVisible();
  await expect.poll(() => attendanceCalls.some(call => call.p_report === false)).toBe(true);
  expect(await report.getByRole('columnheader').allTextContents()).toEqual([
    'Name', 'Designation', 'Team Name', 'Department', 'From date', 'Work Location', 'In Time', 'Out Time', 'Status',
  ]);
  const row = report.getByRole('row', { name: /Synthetic Attendance Employee/ });
  await expect(row).toContainText('UX Designer');
  await expect(row).toContainText('Design');
  await expect(row).toContainText('Product');
  await expect(row).toContainText('12-10-2026');
  await expect(row).toContainText('Work from Office');
  await expect(row).toContainText('09:13:16am');
  await expect(row).toContainText('05:46:58pm');
  await expect(row).toContainText('present');
  await expect(row).not.toContainText('WS08-001');
  await expect(row).not.toContainText('8.56');
  const teamHeader = report.getByRole('columnheader', { name: 'Team Name' });
  await expect(teamHeader).toHaveAttribute('aria-sort', 'none');
  await page.getByRole('button', { name: 'Sort by Team Name descending' }).click();
  await expect(teamHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(report.getByRole('row').nth(1)).toContainText('Synthetic Late Employee');
  const toolbar = page.getByRole('form', { name: 'Attendance report controls' });
  const searchbox = toolbar.getByRole('searchbox', { name: 'Search employees' });
  const download = toolbar.getByRole('button', { name: 'Download Report', exact: true });
  const filter = toolbar.getByRole('button', { name: 'Filters', exact: true });
  for (const [control, width] of [[searchbox, 334], [download, 170], [filter, 62]] as const) {
    await expect(control).toHaveCSS('height', '48px');
    expect(Math.abs(((await control.boundingBox())?.width ?? 0) - width)).toBeLessThan(0.5);
  }
  const toolbarBounds = await toolbar.boundingBox();
  const tableRegion = page.getByRole('region', { name: 'Scrollable attendance report table' });
  const tableBounds = await tableRegion.boundingBox();
  expect(Math.abs((tableBounds?.y ?? 0) - ((toolbarBounds?.y ?? 0) + 56))).toBeLessThan(0.5);
  expect(await report.getByRole('columnheader', { name: 'Name', exact: true }).boundingBox()).toMatchObject({ height: 59 });

  const evidence = path.resolve(process.cwd(), 'docs/evidence/ws08');
  await mkdir(evidence, { recursive: true });
  for (const viewport of [
    { width: 1920, height: 1117 },
    { width: 1280, height: 900 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(async () => { await document.fonts.ready; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.width < 1383) expect(await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(evidence, `ws08-manager-attendance-information-${viewport.width}x${viewport.height}-20261021.png`) });
  }

  await page.setViewportSize({ width: 1920, height: 1117 });
  await filter.focus();
  await page.keyboard.press('Enter');
  await expect(filter).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('From date')).toBeVisible();
  await expect(page.getByLabel('Select Team')).toBeVisible();
  await expect(page.getByLabel('Status')).toBeVisible();
  await page.getByLabel('Select Team').selectOption('Design');
  await page.getByLabel('Status').selectOption('present');
  const detailCallCount = attendanceCalls.filter(call => call.p_report === false).length;
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect.poll(() => attendanceCalls.filter(call => call.p_report === false).length).toBeGreaterThan(detailCallCount);
  await expect(report.getByRole('row', { name: /Synthetic Attendance Employee/ })).toBeVisible();
  await expect(report.getByRole('row', { name: /Synthetic Late Employee/ })).toHaveCount(0);
  await filter.press('Enter');
  await expect(filter).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.getByRole('heading', { name: 'উপস্থিতি প্রতিবেদন', exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'উপস্থিতি প্রতিবেদন নিয়ন্ত্রণ' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'উপস্থিতির তথ্য' }).getByRole('columnheader', { name: 'প্রবেশের সময়' })).toBeVisible();
});

test('Manager report-only attendance screen matches Figma aggregate variant 17:28321 and stays responsive', async ({ page }) => {
  const attendanceCalls = await signInReportManager(page);
  await expect(page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'Attendance', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toHaveCount(0);
  const heading = page.getByRole('heading', { name: 'Attendance Report', exact: true });
  const report = page.getByRole('table');
  await expect(heading).toBeVisible();
  await expect(report).toBeVisible();
  await expect(report).toHaveAttribute('aria-label', 'Attendance summary by employee');
  await expect.poll(() => attendanceCalls.some(call => call.p_report === true)).toBe(true);
  expect(await report.getByRole('columnheader').allTextContents()).toEqual([
    'Name', 'Designation', 'Team Name', 'Department', 'From date', 'To date', 'Office Hour', 'Work Hour', 'Deviation',
  ]);
  const positive = report.getByRole('row', { name: /Synthetic Positive Employee/ });
  const negative = report.getByRole('row', { name: /Synthetic Negative Employee/ });
  await expect(positive).toContainText('45.00');
  await expect(positive).toContainText('46.48');
  await expect(positive).toContainText('+1.48');
  await expect(positive).not.toContainText('WS08-001');
  await expect(negative).toContainText('44.30');
  await expect(negative).toContainText('-0.70');
  expect(await report.getByRole('columnheader', { name: 'Name', exact: true }).boundingBox()).toMatchObject({ height: 59 });

  const toolbar = page.getByRole('form', { name: 'Attendance report controls' });
  const [searchbox, download, filter] = [
    toolbar.getByRole('searchbox', { name: 'Search employees' }),
    toolbar.getByRole('button', { name: 'Download Report', exact: true }),
    toolbar.getByRole('button', { name: 'Filters', exact: true }),
  ] as const;
  for (const [control, width] of [
    [searchbox, 334],
    [download, 184],
    [filter, 64],
  ] as const) {
    await expect(control).toHaveCSS('height', '48px');
    expect(Math.abs(((await control.boundingBox())?.width ?? 0) - width)).toBeLessThan(0.5);
  }
  const searchBounds = await searchbox.boundingBox();
  const downloadBounds = await download.boundingBox();
  const filterBounds = await filter.boundingBox();
  const tableRegionBounds = await page.getByRole('region', { name: 'Scrollable attendance report table' }).boundingBox();
  expect(Math.abs((downloadBounds?.x ?? 0) - ((searchBounds?.x ?? 0) + (searchBounds?.width ?? 0)) - 9)).toBeLessThan(0.5);
  expect(Math.abs((filterBounds?.x ?? 0) - ((downloadBounds?.x ?? 0) + (downloadBounds?.width ?? 0)) - 9)).toBeLessThan(0.5);
  expect(Math.abs((tableRegionBounds?.y ?? 0) - ((await toolbar.boundingBox())?.y ?? 0) - 48 - 18)).toBeLessThan(0.5);

  const evidence = path.resolve(process.cwd(), 'docs/evidence/ws08');
  await mkdir(evidence, { recursive: true });
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 900 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.width < 1383) {
      expect(await page.getByRole('region', { name: 'Scrollable attendance report table' }).evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: path.join(evidence, `ws08-manager-attendance-report-${viewport.width}x${viewport.height}-20261021.png`) });
  }

  const filters = toolbar.getByRole('button', { name: 'Filters', exact: true });
  await filters.focus();
  await page.keyboard.press('Enter');
  await expect(filters).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Select Team')).toBeVisible();
  await filters.press('Enter');
  await expect(filters).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.getByRole('heading', { name: 'উপস্থিতি প্রতিবেদন', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ফিল্টার', exact: true })).toBeVisible();
  await expect(report.getByRole('columnheader', { name: 'দলের নাম', exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'উপস্থিতি প্রতিবেদন নিয়ন্ত্রণ' })).toBeVisible();
  await expect(report).toHaveAttribute('aria-label', 'কর্মচারীভিত্তিক উপস্থিতি সারাংশ');
});

test('Manager daily attendance separates loading and empty states', async ({ page }) => {
  const calls = await signInReportManager(page, { reportAllowed: false, detailAllowed: true, reportState: 'empty', delayReportMs: 800 });
  await expect(page.getByRole('status')).toContainText('Loading attendance data…');
  await expect(page.getByText('No attendance records were returned for this date range.', { exact: true })).toBeVisible();
  expect(calls.some(call => call.p_report === false)).toBe(true);
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('Manager daily attendance shows a retryable error without an empty-state claim', async ({ page }) => {
  const calls = await signInReportManager(page, { reportAllowed: false, detailAllowed: true, reportState: 'error' });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Unable to load attendance records.');
  await expect(page.getByText('No attendance records were returned for this date range.', { exact: true })).toHaveCount(0);
  const beforeRetry = calls.length;
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(alert).toContainText('উপস্থিতির তথ্য লোড করা যায়নি।');
  await page.getByRole('button', { name: 'পুনরায় চেষ্টা করুন' }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(beforeRetry);
});

test('Manager attendance report keeps loading and empty states distinct', async ({ page }) => {
  const calls = await signInReportManager(page, { reportState: 'empty', delayReportMs: 800 });
  await expect(page.getByRole('status')).toContainText('Loading attendance data…');
  await expect(page.getByText('No attendance records were returned for this date range.', { exact: true })).toBeVisible();
  expect(calls.some(call => call.p_report === true)).toBe(true);
});

test('Manager attendance report gives a retryable Bengali error without claiming the range is empty', async ({ page }) => {
  const calls = await signInReportManager(page, { reportState: 'error' });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Unable to load attendance records.');
  await expect(page.getByText('No attendance records were returned for this date range.', { exact: true })).toHaveCount(0);
  const beforeRetry = calls.length;
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(alert).toContainText('উপস্থিতির তথ্য লোড করা যায়নি।');
  await page.getByRole('button', { name: 'পুনরায় চেষ্টা করুন' }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(beforeRetry);
});

test('attendance report navigation stays hidden without reports.view', async ({ page }) => {
  const attendanceCalls = await signInReportManager(page, { reportAllowed: false });
  await expect(page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'Attendance', exact: true })).toHaveCount(0);
  expect(attendanceCalls).toHaveLength(0);
});
