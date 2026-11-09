import { expect, test } from '@playwright/test';

type Call = { table?: string; name?: string; args?: unknown; method?: string };
async function calls(page: import('@playwright/test').Page): Promise<Call[]> {
  return page.evaluate(() =>
    (window as Window & { __ws08RealDirectoryCalls?: Call[] }).__ws08RealDirectoryCalls || []);
}

test('WS08 linked-user directory shows tenant membership and sign-in status from authorized SQL', async ({ page }) => {
  await page.goto('/tests/browser/ws08-linked-users-harness.html');
  await expect(page.getByRole('heading', { name: 'Linked employee accounts' })).toBeVisible();
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  await expect(page.getByText('EMP-009')).toBeVisible();
  await expect(page.getByText('authorized@example.test')).toBeVisible();
  await expect(page.getByText('People Operations')).toBeVisible();
  await expect(page.getByText('HR Specialist')).toBeVisible();
  await expect(page.getByText('hr_admin')).toBeVisible();
  await expect(page.getByText('Organization access')).toBeVisible();
  await expect(page.getByText('Sign-in account')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit access' })).toHaveCount(0);
  let seen = await calls(page);
  expect(seen.filter(item => item.name === 'has_tenant_permission').length).toBeGreaterThanOrEqual(2);
  expect(seen.find(item => item.table === 'employees')).toBeDefined();
  expect(seen.find(item => item.table === 'tenant_memberships')).toBeDefined();
  expect(seen.find(item => item.table === 'admin_users')).toBeDefined();
  expect(seen.find(item => item.table === 'departments')).toBeDefined();
  await page.getByLabel('Search linked employee names').fill('Authorized');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  seen = await calls(page);
  expect(seen.some(item => item.table === 'employees' && item.method === 'ilike')).toBe(true);
});

test('WS08 Super Admin inspects tenant-effective permissions and confirms role/sign-in changes with readback', async ({ page }) => {
  await page.goto('/tests/browser/ws08-linked-users-harness.html?mode=manage');
  await expect(page.getByRole('heading', { name: 'Linked employee accounts' })).toBeVisible();

  await page.getByRole('button', { name: 'Effective permissions' }).click();
  await expect(page.getByText('employees · view_compensation')).toBeVisible();

  await page.getByRole('button', { name: 'Edit access' }).click();
  await page.getByLabel('Assign role').selectOption('employee');
  await page.getByLabel('Allow sign-in').uncheck();
  await expect(page.getByRole('button', { name: 'Save access' })).toBeDisabled();
  await page.getByLabel('I understand this account will be unable to sign in until it is reactivated.').check();
  await page.getByRole('button', { name: 'Save access' }).click();

  await expect(page.getByRole('status')).toContainText('saved and read back');
  await expect(page.getByText('employee', { exact: true })).toBeVisible();
  await expect(page.getByText('Inactive', { exact: true })).toHaveCount(2);
  const seen = await calls(page);
  const update = seen.find(item => item.name === 'admin_update_user_access');
  expect(update).toBeDefined();
  expect(update?.args).toEqual({
    p_user_id: 'f1111111-1111-4111-8111-111111111111',
    p_role_id: 'employee',
    p_active: false,
  });
  expect(seen.some(item => item.table === 'tenant_memberships' && item.method === 'eq'
    && (item.args as { name?: string })?.name === 'tenant_id')).toBe(true);
});

test('WS08 linked-user list denies unauthorized access before any tenant rows are read', async ({ page }) => {
  await page.goto('/tests/browser/ws08-linked-users-harness.html?mode=denied');
  await expect(page.getByRole('alert')).toContainText('not authorized');
  expect((await calls(page)).filter(item => !!item.table)).toHaveLength(0);
});

test('WS08 linked-user list rejects wrong implicit tenant and foreign returned rows', async ({ page }) => {
  await page.goto('/tests/browser/ws08-linked-users-harness.html?mode=scope-mismatch');
  await expect(page.getByRole('alert')).toContainText('does not match');
  expect((await calls(page)).filter(item => !!item.table)).toHaveLength(0);
  await page.goto('/tests/browser/ws08-linked-users-harness.html?mode=foreign');
  await expect(page.getByRole('alert')).toContainText('outside the selected organization');
  await expect(page.getByText('Authorized Employee')).toHaveCount(0);
});

test('WS08 linked-user list does not display stale records after permissions are revoked', async ({ page }) => {
  await page.goto('/tests/browser/ws08-linked-users-harness.html?mode=revoke');
  await expect(page.getByRole('alert')).toContainText('Account access changed');
  await expect(page.getByText('Authorized Employee')).toHaveCount(0);
});

test('WS08 Bengali linked directory renders at 375px and handles empty results without privilege escalation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tests/browser/ws08-linked-users-harness.html?mode=empty&locale=bn');
  await expect(page.getByRole('heading', { name: 'সংযুক্ত প্রকৃত ব্যবহারকারী তালিকা' })).toBeVisible();
  await expect(page.getByText('এই প্রতিষ্ঠান ও অনুসন্ধানে কোনো সংযুক্ত ব্যবহারকারী পাওয়া যায়নি।')).toBeVisible();
  await expect(page.getByRole('button', { name: 'পরের পৃষ্ঠা' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/tests/browser/ws08-linked-users-harness.html?mode=no-org&locale=bn');
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  await expect(page.getByText('—').first()).toBeVisible();
  expect((await calls(page)).some(item => item.table === 'departments' || item.table === 'designations')).toBe(false);
});
