import { expect, test } from '@playwright/test';

type Ws08Call = { name: string; args?: unknown };
async function calls(page: import('@playwright/test').Page): Promise<Ws08Call[]> {
  return page.evaluate(() =>
    (window as Window & { __ws08Calls?: Ws08Call[] }).__ws08Calls || []);
}

test('WS08 real user management requires selected-tenant permissions and does not write before submission', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html');
  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Employees eligible for account linking' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Authorized Employee' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'HR Administrator' })).toBeVisible();
  await expect(page.getByText(/Create an email-and-password account for an existing employee/)).toBeVisible();
  await expect(page.getByText(/Changes are saved to Supabase after/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create user' })).toBeDisabled();
  await page.getByLabel('Search eligible employees').fill('not-present');
  await expect(page.getByText('No eligible employees match this search.')).toBeVisible();
  const actual = await calls(page);
  expect(actual.map(call => call.name)).toEqual([
    'has_tenant_permission', 'synesis_tenant_id', 'admin_get_my_provisioning_context',
  ]);
  expect(actual[0].args).toEqual({
    p_tenant_id: 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    p_permission_id: 'admin_users.manage',
  });
});

test('WS08 denies unauthorized access before querying identity scope or employee records', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?mode=denied');
  await expect(page.getByRole('alert')).toContainText('not authorized');
  await expect(page.getByRole('cell', { name: 'Authorized Employee' })).toHaveCount(0);
  expect((await calls(page)).map(call => call.name)).toEqual(['has_tenant_permission']);
});

test('WS08 rejects an implicit tenant mismatch before loading any provisionable identities', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?mode=scope-mismatch');
  await expect(page.getByRole('alert')).toContainText('Selected organization cannot be matched');
  await expect(page.getByRole('cell', { name: 'Authorized Employee' })).toHaveCount(0);
  expect((await calls(page)).map(call => call.name)).toEqual(['has_tenant_permission', 'synesis_tenant_id']);
});

test('WS08 retries failed permission reads and handles empty context', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?mode=retry');
  await expect(page.getByRole('alert')).toContainText('access could not be verified');
  await page.getByRole('button', { name: 'Retry authorized read' }).click();
  await expect(page.getByRole('cell', { name: 'Authorized Employee' })).toBeVisible();
  expect((await calls(page)).filter(call => call.name === 'has_tenant_permission')).toHaveLength(2);
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?mode=empty');
  await expect(page.getByText('No unlinked eligible employees are available.')).toBeVisible();
  await expect(page.getByText('No roles are assignable to this account.')).toBeVisible();
});

test('WS08 Bengali user creation screen remains usable at mobile width without premature writes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?locale=bn');
  await expect(page.getByRole('heading', { name: 'ব্যবহারকারী ব্যবস্থাপনা' })).toBeVisible();
  await expect(page.getByLabel('যোগ্য কর্মী খুঁজুন')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Authorized Employee' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ব্যবহারকারী তৈরি করুন' })).toBeDisabled();
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(viewportWidth).toBe(375);
});

test('WS08 creates a real account only after employee, role and password are provided', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html');
  const create = page.getByRole('button', { name: 'Create user' });
  await expect(create).toBeDisabled();
  await page.getByLabel('Select employee').selectOption('fccccccc-cccc-4ccc-8ccc-cccccccccccc');
  await page.getByLabel('Assign role').selectOption('hr_admin');
  await page.getByLabel('Login email').fill('test-created@example.test');
  await page.getByLabel('Initial password (12 characters minimum)').fill('test-created-password-123');
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByText('User account created. The employee and assigned role have been saved.')).toBeVisible();
  await expect(page.getByText('No unlinked eligible employees are available.')).toBeVisible();
  const actual = await calls(page);
  expect(actual.filter(call => call.name === 'edge:admin-create-user')).toHaveLength(1);
  expect(actual.some(call => call.name === 'has_tenant_permission')).toBe(true);
  const edge = actual.find(call => call.name === 'edge:admin-create-user')?.args as Record<string, unknown>;
  expect(edge).toMatchObject({
    tenantId: 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    employeeId: 'fccccccc-cccc-4ccc-8ccc-cccccccccccc',
    roleId: 'hr_admin',
    email: 'test-created@example.test',
  });
});

test('WS08 displays failed SQL finalization and does not claim an account was created', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?mode=sql-error');
  await page.getByLabel('Select employee').selectOption('fccccccc-cccc-4ccc-8ccc-cccccccccccc');
  await page.getByLabel('Assign role').selectOption('hr_admin');
  await page.getByLabel('Login email').fill('failed@example.test');
  await page.getByLabel('Initial password (12 characters minimum)').fill('test-created-password-123');
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByRole('alert')).toContainText('SQL finalization rejected');
  await expect(page.getByRole('cell', { name: 'Authorized Employee' })).toBeVisible();
  await expect(page.getByText('User account created.')).toHaveCount(0);
  expect((await calls(page)).filter(call => call.name === 'edge:admin-create-user')).toHaveLength(1);
});
