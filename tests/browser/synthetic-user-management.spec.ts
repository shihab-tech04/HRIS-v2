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
    else if (endpoint === 'departments') data = [{ id: 'dept-1', name: 'People Operations', code: 'PEOPLE' }];
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
  await expect(navigation.getByRole('button', { name: 'User management preview' })).toBeVisible();
  await navigation.getByRole('button', { name: 'User management preview' }).click();
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
}

test('Admin creates synthetic users and previews a role without production writes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsAdmin(page);

  const forbiddenWrites: string[] = [];
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    const method = request.method().toUpperCase();
    if (pathname.includes('/auth/v1/signup') || pathname.includes('/auth/v1/admin/users')) forbiddenWrites.push(`${method} ${pathname}`);
    if (pathname.startsWith('/rest/v1/') && !pathname.includes('/rpc/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) forbiddenWrites.push(`${method} ${pathname}`);
  });

  await page.getByRole('button', { name: 'Generate Random User' }).click();
  const form = page.getByRole('dialog', { name: 'Generated user preview' });
  await expect(form).toBeVisible();
  const fullName = await form.getByLabel('Full name').inputValue();
  const email = await form.getByLabel('Synthetic email').inputValue();
  const userIdInput = await form.getByLabel('User ID', { exact: true }).inputValue();
  const employeeNumber = await form.getByLabel('Employee number').inputValue();
  expect(fullName.length).toBeGreaterThan(1);
  expect(email).toMatch(/^[^@]+\.[a-f0-9]{6}@example\.com$/i);
  expect(userIdInput).toMatch(/^USR-[A-F0-9]{8}$/);
  expect(employeeNumber).toMatch(/^EMP-\d{4}-\d{4}$/);
  expect(userIdInput).not.toBe(employeeNumber);
  await form.getByRole('button', { name: 'Regenerate' }).click();
  const regeneratedEmail = await form.getByLabel('Synthetic email').inputValue();
  const regeneratedName = await form.getByLabel('Full name').inputValue();
  expect(regeneratedEmail).not.toBe(email);
  await form.getByRole('button', { name: 'Save preview user' }).click();

  const row = page.getByRole('row').filter({ hasText: regeneratedEmail });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Employee');
  expect(forbiddenWrites).toEqual([]);
  await row.getByRole('button', { name: `View profile: ${regeneratedName}` }).click();
  const profileDialog = page.getByRole('dialog', { name: regeneratedName });
  await expect(profileDialog).toContainText('not loaded from SQL');
  await profileDialog.getByRole('button', { name: `View as User: ${regeneratedName}` }).click();
  await expect(page.getByRole('heading', { name: 'My overview' })).toBeVisible();
  await expect(page.getByText(/does not switch accounts/)).toBeVisible();
  await page.getByRole('button', { name: 'Complete sample step' }).first().click();
  await expect(page.getByRole('button', { name: 'Completed in preview' }).first()).toBeDisabled();

  await page.reload();
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  await navigation.getByRole('button', { name: 'User management preview' }).click();
  await expect(page.getByRole('row').filter({ hasText: regeneratedEmail })).toBeVisible();
  await page.getByRole('row').filter({ hasText: regeneratedEmail }).getByRole('button', { name: `View as User: ${regeneratedName}` }).click();
  await expect(page.getByRole('button', { name: 'Completed in preview' }).first()).toBeDisabled();

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
});
