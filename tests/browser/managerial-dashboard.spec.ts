import { test, expect } from '@playwright/test';
import path from 'path';

const userId = 'd1111111-1111-4111-8111-111111111111';
const tenantId = 'd2222222-2222-4222-8222-222222222222';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-manager@example.org',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated',
  role: 'authenticated', email: user.email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

async function signInSyntheticManager(page: import('@playwright/test').Page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/auth/v1/**', async route => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user }) });
      return;
    }
    if (requestPath.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/**', async route => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath.endsWith('/rpc/has_tenant_permission')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }
    if (requestPath.endsWith('/rpc/hris_get_tenant_dashboard_summary')) {
      const trend = Array.from({ length: 30 }, (_, index) => {
        const date = new Date(Date.now() - (29 - index) * 86_400_000).toISOString().slice(0, 10);
        return { date, records: index + 1 };
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        team_members: 8, employees: 8, attendance_today: 6,
        present_today: 3, absent_today: 1, wfo_today: 2, wfh_today: 1,
        client_meeting_today: 1, on_leave_today: 1, late_today: 0,
        attendance_corrections_pending: 2, leave_pending: 4, approvals_pending: 6,
        attendance_last_7_days: trend.slice(-7), attendance_last_30_days: trend,
      }) });
      return;
    }
    const table = requestPath.split('/').pop();
    let data: unknown = [];
    if (table === 'tenant_memberships') data = [{ tenant_id: tenantId, role: 'qa_tenant_manager', status: 'active' }];
    else if (table === 'employees') data = [];
    else if (table === 'admin_users') data = { active: false, is_super_admin: false };
    else if (table === 'tenants') data = [{ id: tenantId, name: 'Synthetic Tenant A', slug: 'tenant-a', timezone: 'Asia/Dhaka' }];
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Managerial Dashboard' })).toBeVisible();
}

test('manager dashboard uses tenant RPC counts and working search, filters, and CSV download', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInSyntheticManager(page);

  await expect(page.getByRole('heading', { name: 'Today’s Attendance Summary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Present 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Absent 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Work from Office 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Work From Home 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Attendance Chart' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Client Meeting 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'On Leave 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Late 0' })).toBeVisible();
  const metricColumns = await page.locator('section[aria-labelledby="today-attendance-heading"] > div.grid')
    .evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(metricColumns).toBe(8);
  await expect(page.getByRole('img', { name: /Attendance records over the last 7 days/ })).toBeVisible();
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/managerial-dashboard-desktop-20261014.png'), fullPage: true });

  await page.getByRole('searchbox', { name: 'Search dashboard metrics' }).fill('Home');
  await expect(page.getByRole('button', { name: 'Work From Home 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Present 3' })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search dashboard metrics' }).fill('');

  await page.getByRole('button', { name: 'Filter attendance chart' }).click();
  await page.getByLabel('Attendance chart range').selectOption('30');
  await expect(page.getByText('Recorded attendance by day · last 30 days')).toBeVisible();
  await expect(page.getByRole('img', { name: /Attendance records over the last 30 days/ })).toBeVisible();

  const downloadWaiter = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Report' }).click();
  const download = await downloadWaiter;
  expect(download.suggestedFilename()).toMatch(/^managerial-dashboard-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('manager dashboard fits a narrow mobile viewport and keeps all attendance tiles reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInSyntheticManager(page);

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(376);
  await expect(page.getByRole('heading', { name: 'Today’s Attendance Summary' })).toBeVisible();
  await expect(page.getByText('Team Members')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Late 0' })).toBeVisible();
  const metricColumns = await page.locator('section[aria-labelledby="today-attendance-heading"] > div.grid')
    .evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(metricColumns).toBe(2);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/managerial-dashboard-mobile-20261014.png'), fullPage: true });
});
