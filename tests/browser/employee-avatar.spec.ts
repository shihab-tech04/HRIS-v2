import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64',
);
const imgFile = { name: 'employee-photo.png', mimeType: 'image/png', buffer: onePixelPng };
const profileImg = (page: import('@playwright/test').Page) =>
  page.getByRole('img', { name: 'Employee Name: Synthetic QA Employee' });

test('existing HRIS Change Photo uploads to private bucket, confirms SQL readback, survives refresh', async ({ page }) => {
  await page.goto('/tests/browser/employee-profile-harness.html?state=avatar&locale=en');
  const change = page.getByRole('button', { name: 'Change photo' });
  await expect(change).toBeEnabled();
  await page.locator('input[type=file][aria-label="Change photo"]').setInputFiles(imgFile);
  await expect(profileImg(page).locator('img')).toBeVisible();

  const evidence = await page.evaluate(() => ({
    calls: window.__profileFixtureCalls.filter(c => c.name.includes('my_avatar_v1')),
    actions: window.__profileAvatarActions,
  }));
  const save = evidence.calls.find(c => c.name === 'employee_set_my_avatar_v1');
  expect(save).toBeDefined();
  expect((save!.args as { p_expected_path: unknown }).p_expected_path).toBeNull();
  expect(evidence.actions.some(c => c.action === 'upload' && c.bucket === 'employee-avatars')).toBe(true);
  expect(evidence.actions.some(c => c.action === 'download' && c.bucket === 'employee-avatars')).toBe(true);
  expect(evidence.calls.filter(c => c.name === 'employee_get_my_avatar_v1').length).toBeGreaterThanOrEqual(2);

  await page.reload();
  await expect(profileImg(page).locator('img')).toBeVisible();
});

test('photo rejects invalid MIME and oversize before any upload; Bengali control is translated', async ({ page }) => {
  await page.goto('/tests/browser/employee-profile-harness.html?state=avatar&locale=bn');
  await expect(page.getByRole('button', { name: 'ছবি পরিবর্তন' })).toBeEnabled();
  const input = page.locator('input[type=file]');
  await input.setInputFiles({ name: 'not-a-photo.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByRole('alert')).toContainText('PNG বা JPEG');
  await input.setInputFiles({ name: 'too-big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('২ মেগাবাইট');
  const actions = await page.evaluate(() => window.__profileAvatarActions);
  expect(actions.filter(a => a.action === 'upload')).toHaveLength(0);
});

test('SQL write failure preserves the previous profile photo and cleans only the new orphan upload', async ({ page }) => {
  await page.goto('/tests/browser/employee-profile-harness.html?state=avatar-error&locale=en');
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(imgFile);
  await expect(page.getByRole('alert')).toContainText('previous photo is unchanged');
  await expect(profileImg(page).locator('img')).toHaveCount(0);
  const actions = await page.evaluate(() => window.__profileAvatarActions);
  const uploads = actions.filter(a => a.action === 'upload');
  const removes = actions.filter(a => a.action === 'remove');
  expect(uploads).toHaveLength(1);
  expect(removes).toHaveLength(1);
  expect(removes[0].path).toBe(uploads[0].path);
});

test('avatar SQL not installed fails closed without interrupting the existing profile tabs and certificate alerts', async ({ page }) => {
  await page.goto('/tests/browser/employee-profile-harness.html?state=synthetic&locale=en');
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeDisabled();
  await expect(page.getByRole('img', { name: 'Employee Name: Synthetic QA Employee' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Family & Nominee' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
