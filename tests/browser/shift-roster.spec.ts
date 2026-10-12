import { test, expect } from '@playwright/test';
import path from 'path';

const userId = 'e1111111-1111-4111-8111-111111111111';
const tenantId = 'e2222222-2222-4222-8222-222222222222';
const user = { id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-roster-manager@example.org',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z' };
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated',
  email: user.email, iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

test('tenant shift roster uses the scoped RPC, filters, exports, and remains usable on mobile', async ({ page }) => {
  const externalRequests: string[] = [];
  const rosterCalls: Record<string, unknown>[] = [];
  const assignmentCalls: Record<string, unknown>[] = [];
  const today = new Date();
  const assignmentDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const rows = [
    { assignment_id: 'a1111111-1111-4111-8111-111111111111', assignment_date: assignmentDate,
      assignment_status: 'scheduled', employee_id: 'a2222222-2222-4222-8222-222222222222',
      employee_number: 'QA-001', full_name: 'Synthetic Roster Employee', department_name: 'Product Design',
      shift_id: 'a3333333-3333-4333-8333-333333333333', shift_name: 'Day Shift', shift_code: 'DAY',
      start_time: '09:00:00', end_time: '17:00:00', grace_minutes: 10, break_minutes: 60,
      weekly_off_days: [0, 6] },
    { assignment_id: 'a4444444-4444-4444-8444-444444444444', assignment_date: assignmentDate,
      assignment_status: 'scheduled', employee_id: 'a5555555-5555-4555-8555-555555555555',
      employee_number: 'QA-002', full_name: 'Second Roster Employee', department_name: 'Product Design',
      shift_id: 'a6666666-6666-4666-8666-666666666666', shift_name: 'Late Shift', shift_code: 'LATE',
      start_time: '13:00:00', end_time: '21:00:00', grace_minutes: 5, break_minutes: 45,
      weekly_off_days: [0, 6] },
  ];
  const employeeOptions = [
    { id: 'a2222222-2222-4222-8222-222222222222', employee_number: 'QA-001', full_name: 'Synthetic Roster Employee', department_name: 'Product Design' },
    { id: 'a5555555-5555-4555-8555-555555555555', employee_number: 'QA-002', full_name: 'Second Roster Employee', department_name: 'Product Design' },
    { id: 'a7777777-7777-4777-8777-777777777777', employee_number: 'QA-003', full_name: 'New Roster Employee', department_name: 'Product Design' },
  ];
  const shiftOptions = [
    { id: 'a3333333-3333-4333-8333-333333333333', name: 'Day Shift', code: 'DAY', start_time: '09:00:00', end_time: '17:00:00' },
    { id: 'a6666666-6666-4666-8666-666666666666', name: 'Late Shift', code: 'LATE', start_time: '13:00:00', end_time: '21:00:00' },
  ];

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') { await route.continue(); return; }
    externalRequests.push(url.toString());
    await route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/auth/v1/**', async route => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
    } else if (requestPath.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    } else {
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    }
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop() || '';
    if (url.pathname.includes('/rpc/')) {
      if (endpoint === 'has_tenant_permission') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      } else if (endpoint === 'hris_get_tenant_dashboard_summary') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          dashboard_date: assignmentDate, team_members: 2, employees: 2, present_today: 2,
          attendance_last_7_days: [], attendance_last_30_days: [],
        }) });
      } else if (endpoint === 'hris_get_tenant_shift_roster_data') {
        const body = request.postDataJSON() as Record<string, unknown>;
        rosterCalls.push(body);
        const term = String(body.p_search || '').toLocaleLowerCase();
        const data = term ? rows.filter(row =>
          `${row.full_name} ${row.employee_number} ${row.shift_name} ${row.shift_code}`.toLocaleLowerCase().includes(term)) : rows;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      } else if (endpoint === 'hris_get_tenant_shift_roster_options') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          employees: employeeOptions, shifts: shiftOptions,
        }) });
      } else if (endpoint === 'hris_assign_tenant_employee_shift') {
        const body = request.postDataJSON() as Record<string, unknown>;
        assignmentCalls.push(body);
        const duplicate = rows.some(row => row.employee_id === body.p_employee_id
          && row.assignment_date === body.p_assignment_date);
        if (duplicate) {
          await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({
            code: '23505', message: 'duplicate key value violates unique constraint',
          }) });
          return;
        }
        const employee = employeeOptions.find(row => row.id === body.p_employee_id);
        const shift = shiftOptions.find(row => row.id === body.p_shift_id);
        rows.push({ assignment_id: 'a8888888-8888-4888-8888-888888888888',
          assignment_date: String(body.p_assignment_date), assignment_status: 'scheduled',
          employee_id: String(body.p_employee_id), employee_number: employee?.employee_number || '',
          full_name: employee?.full_name || '', department_name: employee?.department_name || '',
          shift_id: String(body.p_shift_id), shift_name: shift?.name || '', shift_code: shift?.code || '',
          start_time: shift?.start_time || '', end_time: shift?.end_time || '', grace_minutes: 0,
          break_minutes: 60, weekly_off_days: [0, 6] });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('a8888888-8888-4888-8888-888888888888') });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      return;
    }
    let data: unknown = [];
    if (endpoint === 'tenant_memberships') data = [{ tenant_id: tenantId, role: 'qa_tenant_manager', status: 'active' }];
    else if (endpoint === 'employees') data = [];
    else if (endpoint === 'admin_users') data = { active: false, is_super_admin: false };
    else if (endpoint === 'tenants') data = [{ id: tenantId, name: 'Synthetic Roster Org', slug: 'roster-test', timezone: 'Asia/Dhaka' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const moduleNav = page.getByRole('navigation', { name: 'HRIS modules' });
  await moduleNav.getByRole('button', { name: 'Roster', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shift roster' })).toBeVisible();
  const rosterTable = page.getByRole('table', { name: 'Shift roster assignments' });
  await expect(rosterTable).toBeVisible();
  await expect(rosterTable.getByRole('row', { name: /Synthetic Roster Employee/ })).toContainText('09:00 – 17:00');
  await expect(rosterTable.getByRole('row', { name: /Second Roster Employee/ })).toContainText('Late Shift');
  expect(rosterCalls.at(-1)?.p_tenant_id).toBe(tenantId);

  await page.getByLabel('Employee or shift').fill('QA-001');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(rosterTable.getByRole('row', { name: /Synthetic Roster Employee/ })).toBeVisible();
  await expect(rosterTable.getByRole('row', { name: /Second Roster Employee/ })).toHaveCount(0);
  expect(rosterCalls.at(-1)?.p_search).toBe('QA-001');
  expect(rosterCalls.at(-1)?.p_start).toBe(assignmentDate);

  await page.getByLabel('Employee or shift').fill('');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(rosterTable.getByRole('row', { name: /Synthetic Roster Employee/ })).toBeVisible();
  await expect(rosterTable.getByRole('row', { name: /Second Roster Employee/ })).toBeVisible();

  const callsBeforeDateDraft = rosterCalls.length;
  await page.getByLabel('To', { exact: true }).fill(assignmentDate);
  expect(rosterCalls).toHaveLength(callsBeforeDateDraft);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect.poll(() => rosterCalls.at(-1)?.p_end).toBe(assignmentDate);
  expect(rosterCalls.at(-1)).toMatchObject({ p_tenant_id: tenantId,
    p_start: assignmentDate, p_end: assignmentDate, p_search: null });

  await page.getByLabel('Employee', { exact: true }).selectOption('a7777777-7777-4777-8777-777777777777');
  await page.getByLabel('Shift', { exact: true }).selectOption('a6666666-6666-4666-8666-666666666666');
  await page.getByLabel('Assignment date').fill(assignmentDate);
  await page.getByRole('button', { name: 'Assign shift', exact: true }).click();
  await expect(page.getByText('Shift assigned to New Roster Employee.', { exact: true })).toBeVisible();
  await expect(rosterTable.getByRole('row', { name: /New Roster Employee/ })).toContainText('Late Shift');
  expect(assignmentCalls.at(-1)).toMatchObject({ p_tenant_id: tenantId,
    p_employee_id: 'a7777777-7777-4777-8777-777777777777',
    p_shift_id: 'a6666666-6666-4666-8666-666666666666', p_assignment_date: assignmentDate });

  await page.getByRole('button', { name: 'Assign shift', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This employee already has a shift assignment for that date.');
  await expect(rosterTable.getByRole('row', { name: /New Roster Employee/ })).toHaveCount(1);

  const invalidFrom = new Date(Date.parse(`${assignmentDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const callsBeforeInvalidRange = rosterCalls.length;
  await page.getByLabel('From', { exact: true }).fill(invalidFrom);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('Choose a valid roster date range.', { exact: true })).toBeVisible();
  expect(rosterCalls).toHaveLength(callsBeforeInvalidRange);
  await page.getByLabel('From', { exact: true }).fill(assignmentDate);
  await page.getByLabel('To', { exact: true }).fill(invalidFrom);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect.poll(() => rosterCalls.at(-1)?.p_end).toBe(invalidFrom);
  expect(rosterCalls).toHaveLength(callsBeforeInvalidRange + 1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^shift-roster-.*\.csv$/);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/shift-roster-desktop-20261012.png'), fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'Roster', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shift roster' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shift roster assignments' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/shift-roster-mobile-20261012.png'), fullPage: true });
  expect(externalRequests).toEqual([]);
});
