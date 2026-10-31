import { expect, test } from '@playwright/test';

type Call = { kind: string; name: string; args?: unknown; bodyKeys?: string[]; email?: string; roleId?: string; employeeId?: string };
async function recorded(page: import('@playwright/test').Page): Promise<Call[]> {
  return page.evaluate(() =>
    (window as Window & { __ws08CreateCalls?: Call[] }).__ws08CreateCalls || []);
}
async function fillAuthorized(page: import('@playwright/test').Page) {
  await page.getByLabel('Existing employee').selectOption('fccccccc-cccc-4ccc-8ccc-cccccccccccc');
  await page.getByLabel('Permitted role').selectOption('hr_admin');
  await page.getByLabel('Initial password (12 characters minimum)').fill('SafeTestPasswordNotForProd123!');
}

test('WS08 account creation is inert by default and does not expose password input', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-create-harness.html');
  await expect(page.getByRole('heading', { name: 'Existing-employee account provisioning' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Account creation is disabled');
  await expect(page.getByLabel('Initial password (12 characters minimum)')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Create real account/ })).toBeDisabled();
  expect((await recorded(page)).filter(c => c.kind === 'function')).toHaveLength(0);
});

test('WS08 tested approved-mode submits only the exact verified Edge Function v3 fields', async ({ page }) => {
  await page.goto('/tests/browser/ws08-real-create-harness.html?enabled=1');
  await fillAuthorized(page);
  await expect(page.getByText('Legitimate Employee')).toBeVisible();
  await expect(page.getByText('legitimate@example.test')).toBeVisible();
  await page.getByRole('button', { name: /Create real account/ }).click();
  await expect(page.getByText('A real account was created.')).toBeVisible();
  const calls = await recorded(page);
  const invoked = calls.filter(c => c.kind === 'function');
  expect(invoked).toHaveLength(1);
  expect(invoked[0]).toMatchObject({
    name: 'admin-create-user', bodyKeys: ['email', 'employeeId', 'password', 'roleId'],
    email: 'legitimate@example.test', roleId: 'hr_admin',
    employeeId: 'fccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
  expect(calls.filter(c => c.name === 'admin_get_my_provisioning_context')).toHaveLength(2);
  await expect(page.getByRole('button', { name: /Create real account/ })).toBeDisabled();
});

test('WS08 duplicate and unknown server results do not trigger unsafe automatic retries', async ({ page }) => {
  for (const mode of ['duplicate', 'interrupted', 'unconfirmed']) {
    await page.goto('/tests/browser/ws08-real-create-harness.html?enabled=1&mode=' + mode);
    await fillAuthorized(page);
    await page.getByRole('button', { name: /Create real account/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create real account/ })).toBeDisabled();
    await expect(page.getByLabel('Initial password (12 characters minimum)')).toHaveValue('');
    expect((await recorded(page)).filter(c => c.kind === 'function')).toHaveLength(1);
  }
});

test('WS08 denies unapproved tenant and access before touching account Edge Function', async ({ page }) => {
  for (const mode of ['denied', 'scope-mismatch']) {
    await page.goto('/tests/browser/ws08-real-create-harness.html?enabled=1&mode=' + mode);
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await recorded(page)).filter(c => c.kind === 'function')).toHaveLength(0);
  }
});

test('WS08 Bengali 375px form clearly states password flow is not an invitation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tests/browser/ws08-real-create-harness.html?locale=bn');
  await expect(page.getByRole('heading', { name: 'বিদ্যমান কর্মীর জন্য অ্যাকাউন্ট তৈরি' })).toBeVisible();
  await expect(page.getByText('এই API কোনো আমন্ত্রণ ইমেইল পাঠায় না।')).toBeVisible();
  await expect(page.getByRole('button', { name: /বাস্তব অ্যাকাউন্ট তৈরি/ })).toBeDisabled();
  expect((await recorded(page)).filter(c => c.kind === 'function')).toHaveLength(0);
});
