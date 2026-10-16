import { test, expect } from '@playwright/test';

const userId = 'f2222222-2222-4222-8222-222222222222';
const tenantId = 'f3333333-3333-4333-8333-333333333333';
const activityId = 'f4444444-4444-4444-8444-444444444444';
const allocationId = 'f4545454-4444-4444-8444-444444444444';
const projectId = 'f4646464-4444-4444-8444-444444444444';
const timesheetId = 'f5555555-5555-4555-8555-555555555555';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: 'employee-timesheet@hris.test',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const token = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated',
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1', email: user.email,
    exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic-signature',
].join('.');

test('linked employee completes the timesheet journey in Bengali and English with mobile recovery', async ({ page }) => {
  let authenticated = false;
  let failNextContext = true;
  let saved = false;
  let submitted = false;
  let rejected = false;
  let draftVersion = 0;
  let savedPayload: Record<string, unknown> | null = null;
  let correctionPayload: Record<string, unknown> | null = null;
  const rpcPayloads: { endpoint: string; body: Record<string, unknown> }[] = [];
  const externalRequests: string[] = [];

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    externalRequests.push(url.toString());
    return route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'text/css', body: '',
  }));
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      authenticated = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
    }
    if (path.endsWith('/user') && authenticated) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'No local test session' }) });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
    }
    if (endpoint === 'hris_get_my_dashboard_data') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        employee: { full_name: 'Synthetic Employee', employee_number: 'QA-A-001',
          official_email: user.email, designation_title: 'Product Designer', department_name: 'Experience Design' },
        dashboard_date: '2026-10-12', attendance: { records: [], corrections: [] },
        balances: [], requests: [], leave_types: [], holidays: [], weekly_off_days: [0, 6],
      }) });
    }
    if (endpoint === 'hris_get_my_timesheet_context') {
      if (failNextContext) {
        failNextContext = false;
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic timesheet service unavailable.' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        employee_id: userId,
        activities: [{ id: activityId, activity_type: 'project', name: 'Product delivery', code: 'DELIVERY' }],
        allocations: [{ id: allocationId, project_id: projectId, project_name: 'Synthetic Project', project_code: 'QA-1', assigned_date: '2026-10-01', release_date: null }],
        timesheets: saved ? [{
          id: timesheetId, period_type: String(savedPayload?.p_period_type || 'weekly'),
          period_start: String(savedPayload?.p_start || '2026-10-05'), period_end: String(savedPayload?.p_end || '2026-10-11'),
          version: draftVersion,
          status: rejected ? 'rejected' : submitted ? 'submitted' : 'draft', submitted_at: submitted ? '2026-10-12T10:30:00Z' : null,
          resolved_at: rejected ? '2026-10-12T11:30:00Z' : null, resolution_note: rejected ? 'Please correct the logged hours before resubmitting.' : null,
          project_reviews: submitted || rejected ? [{ project_id: projectId, project_name: 'Synthetic Project', revision: rejected ? 1 : 2,
            status: rejected ? 'rejected' : 'pending', rejection_reason: rejected ? 'Please correct the logged hours before resubmitting.' : null }] : [],
          entries: (Array.isArray(correctionPayload?.p_entries) ? correctionPayload.p_entries : Array.isArray(savedPayload?.p_entries) ? savedPayload.p_entries : []).map((entry, index) => {
            const value = entry as Record<string, unknown>;
            return { id: `f6666666-6666-4666-8666-66666666666${index}`, activity_id: value.activity_id,
              activity_name: 'Product delivery', activity_code: 'DELIVERY', work_date: value.work_date,
              hours: value.hours, note: value.note, project_allocation_id: value.project_allocation_id,
              project_id: projectId, project_name: 'Synthetic Project' };
          }),
        }] : [],
      }) });
    }
    if (endpoint === 'hris_save_my_timesheet') {
      const body = request.postDataJSON() as Record<string, unknown>;
      rpcPayloads.push({ endpoint, body });
      savedPayload = body;
      draftVersion += 1;
      saved = true;
      submitted = false;
      rejected = false;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(timesheetId) });
    }
    if (endpoint === 'hris_submit_my_timesheet') {
      const body = request.postDataJSON() as Record<string, unknown>;
      rpcPayloads.push({ endpoint, body });
      submitted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(timesheetId) });
    }
    if (endpoint === 'hris_resubmit_rejected_project_timesheet') {
      const body = request.postDataJSON() as Record<string, unknown>;
      rpcPayloads.push({ endpoint, body });
      correctionPayload = body;
      rejected = false;
      submitted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending', revision: 2 }) });
    }
    if (endpoint === 'tenant_memberships') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { tenant_id: tenantId, role: 'synthetic_employee', status: 'active' },
    ]) });
    if (endpoint === 'employees') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { tenant_id: tenantId, employment_status: 'active' },
    ]) });
    if (endpoint === 'admin_users') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    if (endpoint === 'tenants') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: tenantId, name: 'Synthetic Organization', slug: 'synthetic', timezone: 'Asia/Dhaka' },
    ]) });
    if (endpoint === 'leave_requests' || endpoint === 'leave_types') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Unexpected local UI endpoint: ${endpoint}` }) });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Personal Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'My Timesheets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My timesheets' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Synthetic timesheet service unavailable.');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('No timesheets have been saved for this organization.')).toBeVisible();
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(page.getByRole('heading', { name: 'আমার টাইমশিটসমূহ', exact: true })).toBeVisible();
  await expect(page.getByText('এই প্রতিষ্ঠানের জন্য এখনো কোনো টাইমশিট সংরক্ষিত হয়নি।')).toBeVisible();
  await expect(page.getByRole('button', { name: 'নতুন টাইমশিট', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole('button', { name: 'নতুন টাইমশিট', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'নতুন টাইমশিট খসড়া', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'এন্ট্রি যোগ করুন', exact: true }).click();
  await page.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('প্রতিটি এন্ট্রির কার্যক্রম, কাজের তারিখ ও ঘণ্টা পূরণ করুন।');
  await page.getByLabel('কার্যক্রম', { exact: true }).selectOption(activityId);
  await page.getByLabel('কাজের তারিখ', { exact: true }).fill(await page.getByLabel('সময়সীমা শুরু', { exact: true }).inputValue());
  await page.getByLabel('ঘণ্টা', { exact: true }).fill('3.5');
  await page.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('প্রতিটি প্রকল্প এন্ট্রির জন্য প্রকল্প বরাদ্দ বেছে নিন।');
  expect(rpcPayloads).toHaveLength(0);
  await page.getByLabel('প্রকল্প বরাদ্দ (আবশ্যক)', { exact: true }).selectOption(allocationId);
  await page.getByLabel('নোট (ঐচ্ছিক)', { exact: true }).fill('Synthetic implementation work');
  await page.getByRole('button', { name: 'এন্ট্রি যোগ করুন', exact: true }).click();
  await page.getByLabel('কার্যক্রম', { exact: true }).nth(1).selectOption(activityId);
  await page.getByLabel('প্রকল্প বরাদ্দ (আবশ্যক)', { exact: true }).nth(1).selectOption(allocationId);
  await page.getByLabel('ঘণ্টা', { exact: true }).nth(1).fill('21.5');
  await expect(page.getByText('২৫.০০ / ২৪ ঘণ্টা · দৈনিক সীমা অতিক্রম করেছে')).toBeVisible();
  await page.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('এক দিনে মোট ২৪ ঘণ্টার বেশি হতে পারে না।');
  expect(rpcPayloads).toHaveLength(0);
  await page.getByLabel('ঘণ্টা', { exact: true }).nth(1).fill('2.25');
  await expect(page.getByText('৫.৭৫ / ২৪ ঘণ্টা')).toBeVisible();
  await page.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  const timesheetCard = page.locator(`[data-timesheet-id="${timesheetId}"]`);
  await expect(page.getByText('টাইমশিটের খসড়া সংরক্ষিত হয়েছে।')).toBeVisible();
  await expect(timesheetCard).toContainText('Product delivery');
  await expect(timesheetCard).toContainText('মোট ৫.৭৫ ঘণ্টা · ২ এন্ট্রি');

  await timesheetCard.getByRole('button', { name: 'খসড়া সম্পাদনা করুন', exact: true }).click();
  await page.getByLabel('ঘণ্টা', { exact: true }).nth(1).fill('2.5');
  await expect(page.getByText('৬.০০ / ২৪ ঘণ্টা')).toBeVisible();
  await page.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  await expect(page.getByText('টাইমশিটের খসড়া সংরক্ষিত হয়েছে।')).toBeVisible();
  await expect(timesheetCard).toContainText('মোট ৬ ঘণ্টা');

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await timesheetCard.getByRole('button', { name: 'টাইমশিট জমা দিন', exact: true }).click();
  await expect(page.getByText('টাইমশিট পর্যালোচনার জন্য জমা হয়েছে।')).toBeVisible();
  await expect(timesheetCard.getByText('জমা হয়েছে', { exact: true })).toBeVisible();
  await expect(timesheetCard.getByRole('button', { name: 'টাইমশিট জমা দিন' })).toHaveCount(0);

  rejected = true;
  submitted = false;
  await page.getByRole('button', { name: 'রিফ্রেশ', exact: true }).click();
  await expect(timesheetCard.getByText('প্রত্যাখ্যাত', { exact: true })).toBeVisible();
  await expect(timesheetCard).toContainText('Please correct the logged hours before resubmitting.');
  await timesheetCard.getByRole('button', { name: 'এই প্রকল্প অংশ সংশোধন করুন', exact: true }).click();
  await page.getByLabel('ঘণ্টা', { exact: true }).nth(1).fill('2.75');
  await expect(page.getByText('৬.২৫ / ২৪ ঘণ্টা')).toBeVisible();
  await page.getByRole('button', { name: 'প্রকল্পের সময় সংরক্ষণ করে আবার জমা দিন', exact: true }).click();
  await expect(timesheetCard.getByText('জমা হয়েছে', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await expect(page.getByRole('heading', { name: 'My timesheets', exact: true })).toBeVisible();
  await expect(timesheetCard.getByText('Submitted', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  expect(rpcPayloads.map(item => item.endpoint)).toEqual([
    'hris_save_my_timesheet', 'hris_save_my_timesheet', 'hris_submit_my_timesheet',
    'hris_resubmit_rejected_project_timesheet',
  ]);
  expect(rpcPayloads[0].body).toMatchObject({ p_tenant_id: tenantId, p_id: null, p_period_type: 'weekly' });
  expect(rpcPayloads[0].body.p_entries).toEqual([
    { activity_id: activityId, project_allocation_id: allocationId, work_date: rpcPayloads[0].body.p_start, hours: 3.5, note: 'Synthetic implementation work' },
    { activity_id: activityId, project_allocation_id: allocationId, work_date: rpcPayloads[0].body.p_start, hours: 2.25, note: null },
  ]);
  expect(rpcPayloads[1].body).toMatchObject({ p_tenant_id: tenantId, p_id: timesheetId, p_period_type: 'weekly' });
  expect(rpcPayloads[1].body.p_entries).toEqual([
    { activity_id: activityId, project_allocation_id: allocationId, work_date: rpcPayloads[1].body.p_start, hours: 3.5, note: 'Synthetic implementation work' },
    { activity_id: activityId, project_allocation_id: allocationId, work_date: rpcPayloads[1].body.p_start, hours: 2.5, note: null },
  ]);
  expect(rpcPayloads[1].body.p_expected_version).toBe(1);
  expect(rpcPayloads[2].body).toEqual({ p_tenant_id: tenantId, p_id: timesheetId });
  expect(rpcPayloads[3].body).toMatchObject({ p_tenant_id: tenantId, p_timesheet_id: timesheetId, p_project_id: projectId, p_expected_revision: 1 });
  expect(rpcPayloads[3].body.p_entries).toEqual([
    { activity_id: activityId, project_allocation_id: allocationId, work_date: rpcPayloads[3].body.p_start, hours: 3.5, note: 'Synthetic implementation work' },
    { activity_id: activityId, project_allocation_id: allocationId, work_date: rpcPayloads[3].body.p_start, hours: 2.75, note: null },
  ]);
  expect(externalRequests).toEqual([]);
});
