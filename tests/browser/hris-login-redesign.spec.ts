import { test, expect } from '@playwright/test';

const userId = 'e4111111-1111-4111-8111-111111111111';
const user = { id: userId, email: 'login-fixture@example.org', aud: 'authenticated',
  role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const claims = Buffer.from(JSON.stringify({
  sub: userId, email: user.email, role: 'authenticated', aud: 'authenticated',
  iss: 'https://xfuxnljfrgvusbrpvxpa.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600,
})).toString('base64url');
const token = [header, claims, 'synthetic-ui-test-only'].join('.');

function mockLocalSignIn(page: import('@playwright/test').Page) {
  return page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: token, refresh_token: 'synthetic-refresh-only',
        expires_in: 3600, token_type: 'bearer', user,
      }) });
    } else if (path.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    } else {
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Local synthetic test only"}' });
    }
  });
}

test('approved login layout is accessible, responsive and supports password visibility', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /A Complete HR.*Management Solution/i })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  const password = page.locator('#hris-password');
  await expect(password).toHaveAttribute('type', 'password');
  await password.fill('synthetic-test-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(page.getByRole('checkbox', { name: 'Remember me' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Remember me' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /A Complete HR.*Management Solution/i })).toBeHidden();
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(noOverflow).toBe(true);
});

test('unchecked remember me stores a synthetic session only in sessionStorage', async ({ page }) => {
  await mockLocalSignIn(page);
  await page.goto('/');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('synthetic-test-only');
  await expect(page.getByRole('checkbox', { name: 'Remember me' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => page.evaluate(() => ({
    preference: localStorage.getItem('synesis-hris-remember-me'),
    local: Object.keys(localStorage).filter(k => k.endsWith('-auth-token')).length,
    session: Object.keys(sessionStorage).filter(k => k.endsWith('-auth-token')).length,
  }))).toEqual({ preference: 'false', local: 0, session: 1 });
});

test('checked remember me stores only a synthetic persistent session, never a password', async ({ page }) => {
  await mockLocalSignIn(page);
  await page.goto('/');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('synthetic-test-only');
  await page.getByRole('checkbox', { name: 'Remember me' }).check();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => page.evaluate(() => ({
    preference: localStorage.getItem('synesis-hris-remember-me'),
    local: Object.keys(localStorage).filter(k => k.endsWith('-auth-token')).length,
    session: Object.keys(sessionStorage).filter(k => k.endsWith('-auth-token')).length,
  }))).toEqual({ preference: 'true', local: 1, session: 0 });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('synthetic-test-only');
});

test('recovery form remains accessible with a path back to sign in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByLabel('Account email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
});
