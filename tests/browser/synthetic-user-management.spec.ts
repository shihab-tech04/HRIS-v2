import { test, expect } from '@playwright/test';

const userId = 'f1111111-1111-4111-8111-111111111111';
const tenantId = 'f2222222-2222-4222-8222-222222222222';
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'preview-admin@example.org',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', email: user.email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

async function interceptAuthAndTenant(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
      return;
    }
    if (pathname.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split('/').pop() || '';
    let data: unknown = [];
    if (url.pathname.includes('/rpc/')) data = false;
    else if (endpoint === 'tenant_memberships') data = [{ tenant_id: tenantId, role: 'qa_tenant_superadmin', status: 'active' }];
    else if (endpoint === 'admin_users') data = { active: true, is_super_admin: true };
    else if (endpoint === 'tenants') data = [{ id: tenantId, name: 'Preview Organization', slug: 'preview-org', timezone: 'Asia/Dhaka' }];
    else if (endpoint === 'departments') data = [
      { id: 'dept-1', tenant_id: tenantId, name: 'People Operations', code: 'PEOPLE', active: true },
      { id: 'dept-2', tenant_id: tenantId, name: 'Finance', code: 'FIN', active: true },
    ];
    else if (endpoint === 'designations') data = [
      { id: 'des-1', tenant_id: tenantId, department_id: 'dept-1', title: 'People Assistant', active: true },
      { id: 'des-2', tenant_id: tenantId, department_id: 'dept-1', title: 'People Partner', active: true },
      { id: 'des-3', tenant_id: tenantId, department_id: 'dept-2', title: 'Finance Analyst', active: true },
    ];
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}

async function signInAsAdmin(page: import('@playwright/test').Page) {
  await interceptAuthAndTenant(page);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  await expect(navigation).toBeVisible();
  return navigation;
}

test('Super Admin sees real tenant workspace but cannot access historical synthetic-user management', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const navigation = await signInAsAdmin(page);

  await expect(navigation.getByRole('button', { name: 'User management preview' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate Random User' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'User Management' })).toHaveCount(0);
  await expect(navigation.getByRole('button', { name: 'Platform tenants' })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('button', { name: 'User management preview' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate Random User' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
});
