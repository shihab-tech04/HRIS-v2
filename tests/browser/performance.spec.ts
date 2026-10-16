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
  const appraisal: {
    id: string; cycle_id: string; employee_id: string; reviewer_employee_id: string | null;
    employee_name: string | null; status: string; self_comment: string | null; manager_comment: string | null;
    cycle_name: string; cycle_start_date: string; cycle_end_date: string;
    self_review_deadline: string; manager_review_deadline: string; created_at: string; updated_at: string;
  } = {
    id: '88888888-8888-4888-8888-888888888931',
    cycle_id: 'cycle-2026',
    employee_id: userId,
    reviewer_employee_id: 'manager-1',
    employee_name: null,
    status: 'draft',
    self_comment: null,
    manager_comment: null,
    cycle_name: 'Annual review 2026',
    cycle_start_date: '2026-01-01',
    cycle_end_date: '2026-12-31',
    self_review_deadline: '2026-11-15',
    manager_review_deadline: '2026-12-15',
    created_at: '2026-11-10T00:00:00.000Z',
    updated_at: '2026-11-10T00:00:00.000Z',
  };
  const appraisalRpcRequests: { endpoint: string; body: Record<string, unknown> }[] = [];
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
    if (endpoint === 'hris_get_my_appraisal_work') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appraisals: [appraisal] }) });
    if (endpoint === 'hris_save_my_appraisal_self_comment') {
      const body = request.postDataJSON() as Record<string, unknown>;
      appraisalRpcRequests.push({ endpoint, body });
      appraisal.self_comment = body.p_comment as string;
      if (body.p_submit === true) appraisal.status = 'submitted_by_employee';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: appraisal.id, status: appraisal.status, self_comment: appraisal.self_comment,
        updated_at: new Date().toISOString(),
      }) });
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
  const appraisalCard = page.locator(`[data-appraisal-id="${appraisal.id}"]`);
  await expect(page.getByRole('heading', { name: 'Appraisals' })).toBeVisible();
  await expect(appraisalCard).toContainText('Your appraisal');
  await expect(appraisalCard).toContainText('Annual review 2026');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel('Self-review notes').fill('Synthetic narrative self-review.');
  await appraisalCard.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Appraisal notes saved as a draft.' })).toBeVisible();
  await appraisalCard.getByRole('button', { name: 'Submit self review' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('You cannot edit it after submission.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await appraisalCard.getByRole('button', { name: 'Submit self review' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm submission' }).click();
  await expect(appraisalCard).toContainText('Submitted By Employee');
  await expect(appraisalCard).toContainText('Synthetic narrative self-review.');
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
  expect(appraisalRpcRequests.length).toBe(2);
  expect(appraisalRpcRequests.every(item => item.body.p_tenant_id === tenantId && item.body.p_appraisal_id === appraisal.id)).toBe(true);
  expect(appraisalRpcRequests.map(item => item.body.p_submit)).toEqual([false, true]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
