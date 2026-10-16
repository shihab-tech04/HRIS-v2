import { expect, test } from '@playwright/test';

// The tenant's saved timezone is Asia/Dhaka; keep displayed attendance times
// deterministic on hosted runners whose default browser timezone is UTC.
test.use({ timezoneId: 'Asia/Dhaka' });

const userId = 'e1111111-1111-4111-8111-111111111111';
const employeeId = 'e3333333-3333-4333-8333-333333333333';
const tenantId = 'e2222222-2222-4222-8222-222222222222';
const email = 'synthetic-attendance@example.org';
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({
  sub: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600,
})).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');
const tenantDateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => {
  if (part.type !== 'literal') parts[part.type] = part.value;
  return parts;
}, {});
const dashboardDate = `${tenantDateParts.year}-${tenantDateParts.month}-${tenantDateParts.day}`;

test('employee attendance dashboard uses the tenant RPCs and renders organization-local records', async ({ page }) => {
  let dashboardCalls = 0;
  let dashboardRpcPayload: Record<string, unknown> = {};
  const attendancePeriodRpcPayloads: Record<string, unknown>[] = [];
  let legacyAttendanceRestReads = 0;

  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
      return;
    }
    if (path.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const endpoint = path.split('/').pop() || '';
    let data: unknown = [];
    if (endpoint === 'has_permission' || endpoint === 'has_tenant_permission') data = false;
    else if (endpoint === 'hris_get_my_dashboard_data') {
      dashboardCalls += 1;
      dashboardRpcPayload = route.request().postDataJSON() as Record<string, unknown>;
      data = {
        employee: { id: employeeId, full_name: 'Synthetic Employee', employee_number: 'SYN-001',
          official_email: email, designation_title: 'Product Designer', department_name: 'Experience Design' },
        dashboard_date: dashboardDate,
        balance_year: Number(dashboardDate.slice(0, 4)),
        attendance: {
          records: [{ id: 'ec888888-8888-4888-8888-888888888888', attendance_date: dashboardDate,
            status: 'late', work_mode: 'home', check_in: `${dashboardDate}T03:00:00.000Z`, check_out: null }],
          corrections: [],
        },
        balances: [{ id: 'ec999999-9999-4999-8999-999999999999', employee_id: employeeId,
          leave_type_id: 'e4444444-4444-4444-8444-444444444444', leave_type_name: 'Annual Leave',
          balance_year: Number(dashboardDate.slice(0, 4)), available_days: 15, used_days: 3, pending_days: 2 }],
        requests: [],
        holidays: [{ id: 'e5555555-5555-4555-8555-555555555555', name: 'National Day',
          start_date: '2026-12-16', end_date: '2026-12-16', holiday_type: 'Public' }],
        leave_types: [],
        weekly_off_days: [5, 6],
      };
    } else if (endpoint === 'hris_get_my_attendance_period') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      attendancePeriodRpcPayloads.push(payload);
      data = { tenant_id: tenantId, month_start: payload.p_month_start,
        records: [{ id: 'ec888888-8888-4888-8888-888888888888', attendance_date: dashboardDate,
          status: 'late', work_mode: 'home', check_in: `${dashboardDate}T03:00:00.000Z`,
          check_out: null, work_hours: null }] };
    } else if (endpoint === 'tenant_memberships') {
      data = [{ tenant_id: tenantId, role: 'employee', status: 'active' }];
    } else if (endpoint === 'employees') {
      data = [{ id: employeeId, tenant_id: tenantId, user_id: userId, employment_status: 'active' }];
    } else if (endpoint === 'admin_users') {
      data = { active: false, is_super_admin: false };
    } else if (endpoint === 'tenants') {
      data = [{ id: tenantId, name: 'Test tenant', slug: 'test-tenant', timezone: 'Asia/Dhaka', is_active: true }];
    } else if (endpoint === 'attendance_records' || endpoint === 'attendance_corrections') {
      legacyAttendanceRestReads += 1;
    }
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-test-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const attendance = page.getByRole('region', { name: "Today's attendance" });
  await expect(attendance.getByText('Late', { exact: true })).toBeVisible();
  await expect(attendance.getByText('Working remotely', { exact: true })).toBeVisible();
  await expect(attendance.getByText('09:00', { exact: true })).toBeVisible();
  await expect(attendance.getByText('—', { exact: true })).toBeVisible();
  expect(dashboardRpcPayload).toEqual({ p_tenant_id: tenantId });
  expect(attendancePeriodRpcPayloads[0]).toMatchObject({
    p_tenant_id: tenantId,
    p_month_start: `${dashboardDate.slice(0, 7)}-01`,
  });
  expect(legacyAttendanceRestReads).toBe(0);

  const dashboardViews = page.getByRole('group', { name: 'Personal dashboard views' });
  await dashboardViews.getByRole('button', { name: 'Work location' }).click();
  await expect(page.getByText('Working remotely', { exact: true })).toBeVisible();
  await dashboardViews.getByRole('button', { name: 'Check-in times' }).click();
  await expect(page.getByText('Late', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => dashboardCalls).toBeGreaterThan(1);
  await expect(attendance.getByText('Late', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: "Today's attendance" }).getByText('Late', { exact: true })).toBeVisible();
  expect(legacyAttendanceRestReads).toBe(0);
});
