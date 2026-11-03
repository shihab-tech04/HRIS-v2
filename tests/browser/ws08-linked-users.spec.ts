import { expect, test } from '@playwright/test';

type Call = { table?: string; name?: string; args?: unknown; method?: string };
async function calls(page: import('@playwright/test').Page): Promise<Call[]> {
  return page.evaluate(() =>
    (window as Window & { __ws08RealDirectoryCalls?: Call[] }).__ws08RealDirectoryCalls || []);
}

test('WS08 linked-user directory shows real user-linked employee and admin registry fields, never Auth status guesses', async ({ page }) => {
  await page.goto('/tests/browser/ws08-linked-users-harness.html');
  await expect(page.getByRole('heading', { name: 'Linked real user directory' })).toBeVisible();
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  await expect(page.getByText('EMP-009')).toBeVisible();
  await expect(page.getByText('authorized@example.test')).toBeVisible();
  await expect(page.getByText('People Operations')).toBeVisible();
  await expect(page.getByText('HR Specialist')).toBeVisible();
  await expect(page.getByText('hr_admin')).toBeVisible();
  await expect(page.getByText(/Auth account enabled\/disabled state/)).toBeVisible();
  await expect(page.getByRole('button', { name: /invite user|create user|delete user/i })).toHaveCount(0);
  let seen = await calls(page);
  expect(seen.filter(item => item.name === 'has_tenant_permission').length).toBeGreaterThanOrEqual(4);
  expect(seen.find(item => item.table === 'employees')).toBeDefined();
  expect(seen.find(item => item.table === 'user_roles')).toBeDefined();
  expect(seen.find(item => item.table === 'admin_users')).toBeDefined();
  expect(seen.find(item => item.table === 'departments')).toBeDefined();
  await page.getByLabel('Search linked employee names').fill('Authorized');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  seen = await calls(page);
  expect(seen.some(item => item.table === 'employees' && item.method === 'ilike')).toBe(true);
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
  await page.goto('/tests/browser/ws08-linked-users-harness.html?mode=no-org&locale=bn');
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  await expect(page.getByText('এই সেশনে উপলব্ধ নয়').first()).toBeVisible();
  expect((await calls(page)).some(item => item.table === 'departments' || item.table === 'designations')).toBe(false);
});
