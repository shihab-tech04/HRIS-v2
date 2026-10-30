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
  await expect(navigation.getByRole('button', { name: 'User management preview' })).toBeVisible();
  await navigation.getByRole('button', { name: 'User management preview' }).click();
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Random User' })).toBeEnabled();
}

test('Admin completes the synthetic Employee journey, returns to Admin, and recovers it after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsAdmin(page);

  const forbiddenWrites: string[] = [];
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    const method = request.method().toUpperCase();
    if (pathname.includes('/auth/v1/signup') || pathname.includes('/auth/v1/admin/users') || pathname.includes('/auth/v1/invite')) {
      forbiddenWrites.push(`${method} ${pathname}`);
    }
    if (pathname.startsWith('/rest/v1/') && !pathname.includes('/rpc/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      forbiddenWrites.push(`${method} ${pathname}`);
    }
  });

  await page.getByRole('button', { name: 'Generate Random User' }).click();
  let form = page.getByRole('dialog', { name: 'Generated user preview' });
  await expect(form).toBeVisible();
  const originalName = await form.getByLabel('Full name').inputValue();
  const email = await form.getByLabel('Synthetic email').inputValue();
  const userIdInput = await form.getByLabel('User ID', { exact: true }).inputValue();
  const employeeNumber = await form.getByLabel('Employee number').inputValue();
  expect(originalName.length).toBeGreaterThan(1);
  expect(email).toMatch(/^[^@]+\.[a-f0-9]{6}@example\.com$/i);
  expect(userIdInput).toMatch(/^USR-[A-F0-9]{8}$/);
  expect(employeeNumber).toMatch(/^EMP-\d{4}-\d{4}$/);
  expect(userIdInput).not.toBe(employeeNumber);

  await form.getByRole('combobox', { name: 'Role' }).selectOption({ label: 'Employee' });
  await form.getByLabel('Department', { exact: true }).selectOption('dept-1');
  await form.getByLabel('Designation', { exact: true }).selectOption({ label: 'People Assistant' });
  await form.getByRole('button', { name: 'Regenerate' }).click();
  const regeneratedEmail = await form.getByLabel('Synthetic email').inputValue();
  const regeneratedName = await form.getByLabel('Full name').inputValue();
  expect(regeneratedEmail).not.toBe(email);
  expect(regeneratedName).not.toBe(originalName);
  expect(await form.getByLabel('Department', { exact: true }).inputValue()).toBe('dept-1');
  expect(await form.getByLabel('Designation', { exact: true }).inputValue()).toBe('des-1');
  await form.getByRole('button', { name: 'Save preview user' }).click();

  let row = page.getByRole('row').filter({ hasText: regeneratedEmail });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Employee');
  await expect(row).toContainText('People Operations');
  await expect(row).toContainText('People Assistant');

  await row.getByRole('button', { name: `Edit user: ${regeneratedName}` }).click();
  form = page.getByRole('dialog', { name: 'Edit preview user' });
  await form.getByLabel('Full name').fill('Recovered Synthetic Employee');
  await form.getByLabel('Department', { exact: true }).selectOption('dept-2');
  await expect(form.getByLabel('Designation', { exact: true }).locator('option')).toHaveText(['Select a designation', 'Finance Analyst']);
  await form.getByLabel('Designation', { exact: true }).selectOption({ label: 'Finance Analyst' });
  await form.getByRole('button', { name: 'Save changes' }).click();

  const editedRow = page.getByRole('row').filter({ hasText: regeneratedEmail });
  await expect(editedRow).toContainText('Recovered Synthetic Employee');
  await expect(editedRow).toContainText('Employee');
  await expect(editedRow).toContainText('Finance');
  await expect(editedRow).toContainText('Finance Analyst');

  await editedRow.getByRole('button', { name: 'View profile: Recovered Synthetic Employee' }).click();
  const profileDialog = page.getByRole('dialog', { name: 'Recovered Synthetic Employee' });
  await expect(profileDialog).toContainText('not loaded from SQL');
  await profileDialog.getByRole('button', { name: 'View as User', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My overview' })).toBeVisible();
  await expect(page.getByText(/does not switch accounts/)).toBeVisible();
  await page.getByRole('button', { name: /^My profile/ }).click();
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await expect(page.getByText('Recovered Synthetic Employee')).toBeVisible();
  await expect(page.getByText('Finance Analyst')).toBeVisible();
  await page.getByRole('button', { name: /^Leave and balances/ }).click();
  await expect(page.getByRole('heading', { name: 'Leave request preview' })).toBeVisible();

  await page.getByLabel('From date').fill('2026-11-03');
  await page.getByLabel('To date').fill('2026-11-01');
  await page.getByLabel('Reason').fill('Synthetic acceptance run');
  await page.getByRole('button', { name: 'Save preview draft' }).click();
  await expect(page.getByText('The end date must be on or after the start date.')).toBeVisible();
  await page.getByLabel('To date').fill('2026-11-05');
  await page.getByRole('button', { name: 'Save preview draft' }).click();
  await expect(page.getByText('Draft saved in this browser; no SQL request was created.')).toBeVisible();
  await expect(page.getByText('Synthetic acceptance run')).toBeVisible();
  expect(forbiddenWrites).toEqual([]);

  await page.getByRole('button', { name: 'Back to User Management' }).click();
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.getByRole('heading', { name: 'ব্যবহারকারী ব্যবস্থাপনা' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  await page.reload();
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  await navigation.getByRole('button', { name: 'User management preview' }).click();
  row = page.getByRole('row').filter({ hasText: regeneratedEmail });
  await expect(row).toContainText('Recovered Synthetic Employee');
  await expect(row).toContainText('Finance Analyst');
  await row.getByRole('button', { name: 'View as User: Recovered Synthetic Employee' }).click();
  await page.getByRole('button', { name: /^Leave and balances/ }).click();
  await expect(page.getByText('Synthetic acceptance run')).toBeVisible();
  await expect(page.getByText('2026-11-03 – 2026-11-05')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.getByRole('heading', { name: 'ছুটির অনুরোধ প্রিভিউ' })).toBeVisible();
  await expect(page.getByText(/এটি স্থানীয় প্রিভিউ খসড়া/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await page.getByRole('button', { name: 'ব্যবহারকারী ব্যবস্থাপনায় ফিরুন' }).click();
  await expect(page.getByRole('heading', { name: 'ব্যবহারকারী ব্যবস্থাপনা' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await page.getByRole('row').filter({ hasText: regeneratedEmail })
    .getByRole('button', { name: 'Edit user: Recovered Synthetic Employee' }).click();
  form = page.getByRole('dialog', { name: 'Edit preview user' });
  await expect(form).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await form.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('row').filter({ hasText: regeneratedEmail })
    .getByRole('button', { name: 'View as User: Recovered Synthetic Employee' }).click();
  await expect(page.getByRole('heading', { name: 'My overview' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await page.getByRole('button', { name: 'Back to User Management' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  expect(forbiddenWrites).toEqual([]);
});
