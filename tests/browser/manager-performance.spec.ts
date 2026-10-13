import { expect, test } from '@playwright/test';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const email = 'performance-manager@hris.test';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email,
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const token = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', email,
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic-signature',
].join('.');

test('performance viewer sees filtered tenant goals without write controls', async ({ page }) => {
  const goals = [
    { id: 'goal-1', tenant_id: tenantId, employee_id: 'employee-1', title: 'Improve onboarding quality',
      description: 'Complete the approved onboarding checklist.', category: 'Operational',
      target_metric: 'Checklist completion', current_progress: 65, due_date: '2026-12-31',
      status: 'in_progress', weight: 40, origin: 'assigned' },
    { id: 'goal-2', tenant_id: tenantId, employee_id: 'employee-1', title: 'Publish team handbook',
      description: 'Finalize the existing handbook draft.', category: 'Team', target_metric: 'Published handbook',
      current_progress: 100, due_date: '2026-11-30', status: 'completed', weight: 60, origin: 'assigned' },
  ];
  const goalQueries: string[] = [];

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    return route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
    }) });
    if (path.endsWith('/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop() || '';
    if (endpoint === 'tenant_memberships') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { tenant_id: tenantId, role: 'qa_performance_viewer', status: 'active' },
    ]) });
    if (endpoint === 'admin_users') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    if (endpoint === 'tenants') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: tenantId, name: 'Synthetic Organization', slug: 'synthetic', timezone: 'Asia/Dhaka' },
    ]) });
    if (endpoint === 'has_tenant_permission') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const permission = body.p_permission_id;
      const allowed = permission === 'performance.view';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(allowed) });
    }
    if (endpoint === 'employees') {
      const select = url.searchParams.get('select') || '';
      if (select.includes('employment_status')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'employee-1', full_name: 'Avery Example', employee_number: 'SYN-014' },
      ]) });
    }
    if (endpoint === 'performance_goals') {
      goalQueries.push(url.searchParams.get('tenant_id') || '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(goals) });
    }
    if (request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Performance', exact: true })).toBeVisible();
  await expect(page.getByText('Avery Example').first()).toBeVisible();
  await expect(page.getByText('Goals', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search organization performance' }).fill('handbook');
  await expect(page.getByRole('heading', { name: 'Publish team handbook' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Improve onboarding quality' })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search organization performance' }).fill('');
  await page.getByRole('combobox', { name: 'Filter organization performance by status' }).selectOption('completed');
  await expect(page.getByRole('heading', { name: 'Publish team handbook' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Improve onboarding quality' })).toHaveCount(0);
  expect(goalQueries.length).toBeGreaterThan(0);
  expect(goalQueries.every(value => value === `eq.${tenantId}`)).toBe(true);
  expect(await page.getByRole('button', { name: 'Save progress' }).count()).toBe(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
