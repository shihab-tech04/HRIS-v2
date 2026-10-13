import { expect, test } from '@playwright/test';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '55555555-5555-4555-8555-555555555555';
const goalId = '88888888-8888-4888-8888-888888888801';
const email = 'performance-employee@hris.test';

const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const token = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', email,
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic-signature',
].join('.');

test('employee updates only their recorded performance goal progress', async ({ page }) => {
  const goal = {
    id: goalId,
    tenant_id: tenantId,
    employee_id: userId,
    title: 'Improve release readiness',
    description: 'Complete the agreed release checklist.',
    category: 'Operational',
    target_metric: 'Close all approved checklist items',
    current_progress: 40,
    due_date: '2026-12-31',
    status: 'in_progress',
    weight: 50,
    origin: 'assigned',
    updated_at: '2026-10-13T00:00:00.000Z',
  };
  const appraisal = {
    id: '88888888-8888-4888-8888-888888888931',
    tenant_id: tenantId,
    cycle_id: 'cycle-2026',
    employee_id: userId,
    reviewer_employee_id: 'manager-1',
    status: 'submitted_by_employee',
    created_at: '2026-11-10T00:00:00.000Z',
  };
  const appraisalQueries: { tenantFilter: string | null; select: string | null }[] = [];
  const goalRequests: { method: string; tenantFilter: string | null; body: unknown }[] = [];

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
    if (endpoint === 'tenant_memberships') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (endpoint === 'employees') {
      const select = url.searchParams.get('select') || '';
      const linked = select.includes('employment_status');
      if (select === 'id' && url.searchParams.get('user_id') === 'eq.' + userId) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: userId }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(linked
        ? [{ tenant_id: tenantId, employment_status: 'active' }]
        : []) });
    }
    if (endpoint === 'admin_users') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    if (endpoint === 'tenants') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: tenantId, name: 'Synthetic Organization', slug: 'synthetic', timezone: 'Asia/Dhaka' },
    ]) });
    if (endpoint === 'performance_goals') {
      const body = request.postDataJSON();
      goalRequests.push({ method: request.method(), tenantFilter: url.searchParams.get('tenant_id'), body });
      if (request.method() === 'PATCH') {
        const update = body as Record<string, unknown>;
        if (Object.keys(update).length === 1 && typeof update.current_progress === 'number') {
          goal.current_progress = update.current_progress;
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(goal) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([goal]) });
    }
    if (endpoint === 'performance_appraisals') {
      appraisalQueries.push({ tenantFilter: url.searchParams.get('tenant_id'), select: url.searchParams.get('select') });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([appraisal]) });
    }
    if (endpoint === 'performance_cycles') return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'cycle-2026', name: 'Annual review 2026', start_date: '2026-01-01',
          end_date: '2026-12-31', status: 'active' },
      ]),
    });
    if (endpoint === 'hris_get_my_dashboard_data') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      employee: { full_name: 'Synthetic Employee', employee_number: 'QA-001', official_email: email,
        designation_title: 'Analyst', department_name: 'Operations' },
      dashboard_date: '2026-10-13', attendance: { records: [], corrections: [] },
      balances: [], requests: [], leave_types: [], holidays: [], weekly_off_days: [0, 6],
    }) });
    if (request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Personal Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'My Performance' }).click();
  await expect(page.getByRole('heading', { name: 'My Performance' })).toBeVisible();
  const appraisalCard = page.locator('article').filter({ hasText: 'Submitted By Employee' });
  await expect(page.getByRole('heading', { name: 'Appraisals' })).toBeVisible();
  await expect(appraisalCard).toContainText('Your appraisal');
  await expect(appraisalCard).toContainText('Annual review 2026');
  await expect(appraisalCard).toContainText('Final scores and feedback are not shown');
  const goalCard = page.locator('article').filter({ hasText: 'Improve release readiness' });
  await expect(goalCard).toContainText('40%');
  await expect(goalCard).toContainText('Complete the agreed release checklist.');
  await page.getByRole('searchbox', { name: 'Search performance goals' }).fill('release readiness');
  await page.getByRole('combobox', { name: 'Filter performance goals by status' }).selectOption('in_progress');
  await page.getByRole('spinbutton', { name: 'Update Improve release readiness progress' }).fill('72.5');
  await goalCard.getByRole('button', { name: 'Save progress' }).click();
  await expect(goalCard).toContainText('72.5%');
  await expect(page.getByRole('status').filter({ hasText: 'Progress saved' })).toContainText('Progress saved');

  const patchRequest = goalRequests.find(item => item.method === 'PATCH');
  expect(patchRequest?.tenantFilter).toBe(`eq.${tenantId}`);
  expect(patchRequest?.body).toEqual({ current_progress: 72.5 });
  expect(appraisalQueries.length).toBeGreaterThan(0);
  expect(appraisalQueries.every(item => item.tenantFilter === 'eq.' + tenantId)).toBe(true);
  expect(appraisalQueries.every(item => item.select === 'id,cycle_id,employee_id,reviewer_employee_id,status,created_at')).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
