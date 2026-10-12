import { test, expect } from '@playwright/test';

const widths = [360, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
for (const width of widths) {
  test('unauthenticated live sign-in renders without horizontal overflow at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 800 : 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Design preview (sample)')).toHaveCount(0);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(width + 1);
  });
}
test('sign-in form has labels, password masking and usable keyboard focus', async ({ page }) => {
  await page.goto('/');
  const email = page.getByLabel('Email');
  const password = page.getByLabel('Password');
  await email.focus();
  await expect(email).toBeFocused();
  await email.fill('test.invalid@example.com');
  await password.focus();
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute('type', 'password');
  await password.fill('example-placeholder-do-not-submit');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

test('Supabase sign-in errors are displayed and the form stays usable', async ({ page }) => {
  await page.route('**/auth/v1/**', async route => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
    });
  });
  await page.goto('/');
  await page.getByLabel('Email').fill('example.invalid@example.org');
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid login credentials');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
});

test('reset request does not expose whether account exists', async ({ page }) => {
  await page.route('**/auth/v1/recover**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Account email').fill('test.invalid@example.org');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
});

test('reset screen returns to the unchanged sign-in flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
});
