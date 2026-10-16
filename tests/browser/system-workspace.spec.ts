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

async function interceptAuth(page: import('@playwright/test').Page): Promise<() => Record<string, unknown> | null> {
  let pendingProfileChange = true;
  let profileChangeReviewPayload: Record<string, unknown> | null = null;
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
    const table = url.pathname.split('/').pop();
    const requested = url.searchParams.get('select') || '';
    let data: unknown = [];
    if (url.pathname.endsWith('/rpc/admin_list_profile_change_requests')) data = pendingProfileChange ? [{ id: 'pf-1', employee_id: 'emp-1', employee_number: 'TEST-01', full_name: 'Synthetic Test Employee', field_key: 'official_email', requested_value: 'new.employee@example.org', reason: 'Employee contact address changed.', submitted_at: '2026-10-16T12:00:00.000Z' }] : [];
    else if (url.pathname.endsWith('/rpc/admin_review_profile_change_request')) {
      profileChangeReviewPayload = JSON.parse(request.postData() || '{}');
      pendingProfileChange = false;
      data = { success: true, status: 'approved' };
    }
    else if (table === 'tenant_memberships') data = [];
    else if (table === 'employees') {
      data = requested.includes('full_name')
        ? [{ id: 'emp-1', full_name: 'Synthetic Test Employee', employee_number: 'TEST-01', employment_status: 'active' }]
        : [];
    }
    else if (table === 'admin_users') data = { active: true, is_super_admin: true };
    else if (table === 'tenants') data = requested === 'id'
      ? { id: tenantId } : [{ id: tenantId, name: 'Synthetic Synesis', slug: 'synesis-it', timezone: 'Asia/Dhaka' }];
    else if (table === 'has_permission') data = true;
    else if (table === 'departments') data = [{ id: 'dept-1', name: 'Engineering', code: 'ENG', active: true }];
    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return () => profileChangeReviewPayload;
}

test('authorized Super Admin opens real system navigation, not fixture preview', async ({ page }) => {
  const getProfileChangeReviewPayload = await interceptAuth(page);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByText('Authenticated · synthetic-superadmin@example.org')).toBeVisible();
  const moduleNav = page.getByRole('navigation', { name: 'HRIS modules' });
  await expect(moduleNav).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System overview' })).toBeVisible();
  await expect(moduleNav.getByRole('button', { name: /Employee directory/ })).toBeVisible();
  await expect(moduleNav.getByRole('button', { name: /Performance goals/ })).toBeVisible();
  await expect(moduleNav.getByRole('button', { name: /Compensation management/ })).toBeVisible();
  await expect(page.getByText('No sample data or simulated saves are displayed.')).toBeVisible();

  await moduleNav.getByRole('button', { name: /Employee directory/ }).click();
  await expect(page.getByText('Synthetic Test Employee')).toBeVisible();
  await expect(page.getByText('TEST-01')).toBeVisible();

  await moduleNav.getByRole('button', { name: /Profile correction requests/ }).click();
  await expect(page.getByRole('heading', { name: 'Profile correction requests', exact: true })).toBeVisible();
  const changeRequests = page.getByRole('region', { name: 'Profile correction requests' });
  await expect(changeRequests.getByText('new.employee@example.org')).toBeVisible();
  await changeRequests.getByLabel('Reviewer note (optional)').fill('Verified against employee documents.');
  await changeRequests.getByRole('button', { name: 'Approve change' }).click();
  await expect(changeRequests.getByText('Request approved.', { exact: true })).toBeVisible();
  await expect(changeRequests.getByText('No pending profile correction requests.')).toBeVisible();
  expect(getProfileChangeReviewPayload()).toEqual({
    p_id: 'pf-1',
    p_decision: 'approved',
    p_note: 'Verified against employee documents.',
  });

  await moduleNav.getByRole('button', { name: /Compensation management/ }).click();
  await expect(page.getByRole('heading', { name: 'Workflow integration pending' })).toBeVisible();
});
