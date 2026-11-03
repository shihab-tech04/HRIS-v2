import { expect, test } from '@playwright/test';

type Ws08Call = { name: string; args?: unknown };
async function calls(page: import('@playwright/test').Page): Promise<Ws08Call[]> {
  return page.evaluate(() =>
    (window as Window & { __ws08Calls?: Ws08Call[] }).__ws08Calls || []);
}

test('WS08 read-only real provisioning prerequisites require selected-tenant permissions and remain separate from preview', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html');
  await expect(page.getByRole('heading', { name: 'Real user provisioning — read-only readiness' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Employees eligible for account linking' })).toBeVisible();
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  await expect(page.getByText('HR Administrator')).toBeVisible();
  await expect(page.getByText(/does not create accounts or send invitations/)).toBeVisible();
  await expect(page.getByText(/Browser-only synthetic User Management remains a separate preview/)).toBeVisible();
  await expect(page.getByRole('button', { name: /create user|invite/i })).toHaveCount(0);
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
  await expect(page.getByText('Authorized Employee')).toHaveCount(0);
  expect((await calls(page)).map(call => call.name)).toEqual(['has_tenant_permission']);
});

test('WS08 rejects an implicit tenant mismatch before loading any provisionable identities', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?mode=scope-mismatch');
  await expect(page.getByRole('alert')).toContainText('Selected organization cannot be matched');
  await expect(page.getByText('Authorized Employee')).toHaveCount(0);
  expect((await calls(page)).map(call => call.name)).toEqual(['has_tenant_permission', 'synesis_tenant_id']);
});

test('WS08 retries failed permission reads and handles empty context', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?mode=retry');
  await expect(page.getByRole('alert')).toContainText('access could not be verified');
  await page.getByRole('button', { name: 'Retry authorized read' }).click();
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  expect((await calls(page)).filter(call => call.name === 'has_tenant_permission')).toHaveLength(2);
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?mode=empty');
  await expect(page.getByText('No unlinked eligible employees are available.')).toBeVisible();
  await expect(page.getByText('No roles are assignable to this account.')).toBeVisible();
});

test('WS08 Bengali readiness remains usable at mobile width without production writes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tests/browser/ws08-real-readiness-harness.html?locale=bn');
  await expect(page.getByRole('heading', { name: 'বাস্তব ব্যবহারকারী প্রভিশনিং — শুধুমাত্র পাঠযোগ্য প্রস্তুতি' })).toBeVisible();
  await expect(page.getByLabel('যোগ্য কর্মী খুঁজুন')).toBeVisible();
  await expect(page.getByText('Authorized Employee')).toBeVisible();
  await expect(page.getByRole('button', { name: /আমন্ত্রণ|তৈরি/ })).toHaveCount(0);
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(viewportWidth).toBe(375);
});
