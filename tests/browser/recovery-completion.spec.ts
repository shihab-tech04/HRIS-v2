import { test, expect } from '@playwright/test';

const userId = 'f1111111-1111-4111-8111-111111111111';
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'synthetic-recovery@example.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwt = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({
    sub: userId, aud: 'authenticated', role: 'authenticated',
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
    email: user.email, exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url'),
  'synthetic-signature',
].join('.');

test('a recovery callback offers password replacement without creating an HRIS account', async ({ page }) => {
  let attemptedUpdate = 0;
  let attemptedSignOut = 0;
  await page.route('**/auth/v1/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/user') && req.method() === 'PUT') {
      attemptedUpdate++;
      const input = req.postDataJSON();
      expect(input.password).toBe('a-long-and-new-test-password');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    if (path.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    if (path.endsWith('/logout')) {
      attemptedSignOut++;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Unexpected mocked Supabase endpoint' }) });
  });

  // Only a locally mocked recovery session is used. This does not access Auth accounts.
  await page.goto('/#access_token=' + encodeURIComponent(jwt) +
    '&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=recovery');
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible({ timeout: 14000 });
  await page.getByLabel('New password').fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page.getByRole('button', { name: 'Update password' }).click();
  // HTML minLength prevents submission before the React validator is invoked.
  expect(await page.getByLabel('New password').evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);
  expect(attemptedUpdate).toBe(0);

  await page.getByLabel('New password').fill('a-long-and-new-test-password');
  await page.getByLabel('Confirm password').fill('different-valid-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  expect(attemptedUpdate).toBe(0);

  await page.getByLabel('Confirm password').fill('a-long-and-new-test-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  expect(attemptedUpdate).toBe(1);
  expect(attemptedSignOut).toBe(1);
  await expect(page).not.toHaveURL(/access_token=/);
});
