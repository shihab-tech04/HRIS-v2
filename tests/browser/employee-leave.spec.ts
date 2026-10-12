import { test, expect } from '@playwright/test';

const userId = 'f2222222-2222-4222-8222-222222222222';
const tenantId = 'f3333333-3333-4333-8333-333333333333';
const leaveTypeId = 'f4444444-4444-4444-8444-444444444444';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: 'employee-test@hris.test',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const token = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated',
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
    email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic-signature',
].join('.');

function isoDateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test('linked employee can complete the private evidence leave request on mobile', async ({ page }) => {
  let authenticated = false;
  let submitted = false;
  const externalRequests: string[] = [];

  // Any request outside the local app must be handled by one of the explicit
  // Supabase mocks below. This prevents the UI test from reaching production.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    externalRequests.push(url.toString());
    await route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'text/css', body: '',
  }));

  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      authenticated = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
      return;
    }
    if (path.endsWith('/user') && authenticated) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'No local test session' }) });
  });

  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
    } else if (endpoint === 'hris_get_my_dashboard_data') {
      const requestHistory = submitted ? [{
        id: 'f5555555-5555-4555-8555-555555555555', leave_type_id: leaveTypeId,
        leave_type_name: 'Medical leave', from_date: isoDateAfter(9), to_date: isoDateAfter(9),
        requested_days: 1, reason: 'Synthetic mobile leave request', status: 'pending',
      }] : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        attendance: { records: [] },
        balances: [{ leave_type_id: leaveTypeId, leave_type_name: 'Medical leave', available_days: 20,
          used_days: 0, pending_days: submitted ? 1 : 0 }],
        requests: requestHistory,
        leave_types: [{ id: leaveTypeId, name: 'Medical leave', annual_entitlement: 20,
          min_days_notice: null, requires_document_proof: true }],
        holidays: [], weekly_off_days: [0, 6], balance_year: new Date().getFullYear(),
      }) });
    } else if (endpoint === 'hris_employee_submit_leave_request') {
      submitted = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('f5555555-5555-4555-8555-555555555555') });
    } else if (endpoint === 'tenant_memberships') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { tenant_id: tenantId, role: 'synthetic_employee', status: 'active' },
      ]) });
    } else if (endpoint === 'employees') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { tenant_id: tenantId, employment_status: 'active' },
      ]) });
    } else if (endpoint === 'admin_users') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    } else if (endpoint === 'tenants') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: tenantId, name: 'Synthetic Organization', slug: 'synthetic', timezone: 'Asia/Dhaka' },
      ]) });
    } else if (endpoint === 'leave_requests' || endpoint === 'leave_types') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Unexpected local UI endpoint: ${endpoint}` }) });
    }
  });

  await page.route('**/storage/v1/object/leave-evidence/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'synthetic-evidence' }) });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'My Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My leave' })).toBeVisible();
  await page.getByRole('button', { name: 'Request for leave' }).click();
  const dialog = page.getByRole('dialog', { name: 'Request for leave' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close leave request' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Request for leave' }).click();
  await page.getByLabel('Leave type').selectOption(leaveTypeId);
  await page.getByLabel('From date').fill(isoDateAfter(9));
  await page.getByLabel('To date').fill(isoDateAfter(9));
  await page.getByLabel('Reason').fill('Synthetic mobile leave request');
  await page.locator('#personal-leave-evidence').setInputFiles({
    name: 'medical-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic test evidence'),
  });
  const formBody = dialog.locator('form > div').first();
  await formBody.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const evidenceClearsFooter = await page.evaluate(() => {
    const evidence = document.querySelector('#personal-leave-evidence');
    const footer = evidence?.closest('form')?.lastElementChild;
    if (!evidence || !(footer instanceof HTMLElement)) return false;
    return evidence.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top;
  });
  expect(evidenceClearsFooter).toBe(true);
  await expect(page.getByRole('button', { name: 'Send request' })).toBeEnabled();
  await page.screenshot({ path: '/private/tmp/hris-employee-leave-mobile.png', fullPage: false });
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('status')).toContainText('Leave request submitted.');
  await expect(page.getByText('Synthetic mobile leave request')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  expect(externalRequests).toEqual([]);
});
