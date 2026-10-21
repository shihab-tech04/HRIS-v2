import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

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
  options: { reportAllowed?: boolean; reportState?: 'rows' | 'empty' | 'error'; delayReportMs?: number } = {},
) {
  const { reportAllowed = true, reportState = 'rows', delayReportMs = 0 } = options;
  const calls: Record<string, unknown>[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    await route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reportAllowed && permission.p_permission_id === 'reports.view') });
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
        payload.p_report === true ? reportState === 'empty' ? [] : rows : { records: [], corrections: [] },
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

test('Manager report-only attendance screen matches Figma node 17:28320 and stays responsive', async ({ page }) => {
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
  const firstColumnBounds = await report.getByRole('columnheader').first().boundingBox();
  expect(Math.abs((downloadBounds?.x ?? 0) - ((searchBounds?.x ?? 0) + (searchBounds?.width ?? 0)) - 9)).toBeLessThan(0.5);
  expect(Math.abs((filterBounds?.x ?? 0) - ((downloadBounds?.x ?? 0) + (downloadBounds?.width ?? 0)) - 9)).toBeLessThan(0.5);
  expect(Math.abs((firstColumnBounds?.y ?? 0) - ((await toolbar.boundingBox())?.y ?? 0) - 48 - 18)).toBeLessThan(0.5);

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
