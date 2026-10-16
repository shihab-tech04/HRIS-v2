import { test, expect } from '@playwright/test';

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

test('employee sees own tenant-local attendance, leave, holidays, schedule and goals', async ({ page }) => {
  let attendanceFilter: Record<string, string> = {};
  let leaveContextMethod = '';
  let scheduleMethod = '';
  let performanceContextMethod = '';
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt,
        refresh_token: 'synthetic-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        user,
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
    const table = path.split('/').pop() || '';
    let data: unknown = [];
    if (path.endsWith('/rpc/has_permission')) data = false;
    else if (path.endsWith('/rpc/employee_get_leave_context')) {
      leaveContextMethod = route.request().method();
      data = { balances: [{ leave_type_id: 'e4444444-4444-4444-8444-444444444444', leave_type_name: 'Annual Leave', balance_year: 2026, available_days: 15, used_days: 3, pending_days: 2 }], holidays: [{ id: 'e5555555-5555-4555-8555-555555555555', name: 'National Day', start_date: '2026-12-16', end_date: '2026-12-16', holiday_type: 'Public', description: null }] };
    }
    else if (path.endsWith('/rpc/employee_get_dashboard_schedule')) {
      scheduleMethod = route.request().method();
      data = {
        interviews: [{ id: 'e6666666-6666-4666-8666-666666666666', job_title: 'Data Analyst', interview_type: 'Panel interview', scheduled_at: '2026-11-16T03:00:00.000Z', location_or_link: 'North Room' }],
        learning_sessions: [{ id: 'e7777777-7777-4777-8777-777777777777', title: 'Secure coding', start_at: '2026-11-18T02:00:00.000Z', end_at: '2026-11-18T03:30:00.000Z', location: 'Training room 2' }],
        training: [{ id: 'e8888888-8888-4888-8888-888888888888', title: 'Leadership workshop', institute_name: 'People Academy', start_date: '2026-11-20', end_date: '2026-11-21' }],
        performance_cycles: [{ id: 'e9999999-9999-4999-8999-999999999999', name: '2026 Annual Review', start_date: '2026-11-01', end_date: '2026-12-31', self_review_deadline: '2026-11-30', manager_review_deadline: '2026-12-15', status: 'active' }],
      };
    }
    else if (path.endsWith('/rpc/employee_get_my_performance_context')) {
      performanceContextMethod = route.request().method();
      data = { goals: [
        { id: 'ea111111-1111-4111-8111-111111111111', title: 'Complete onboarding', category: 'Operational', target_metric: 'Complete 5 modules', current_progress: 40, due_date: '1900-01-01', status: 'in_progress', origin: 'assigned' },
        { id: 'ea222222-2222-4222-8222-222222222222', title: 'Completed safety induction', category: 'Skill', target_metric: null, current_progress: 100, due_date: '1900-01-01', status: 'completed', origin: 'assigned' },
      ] };
    }
    else if (table === 'tenant_memberships') data = [];
    else if (table === 'employees') {
      data = url.searchParams.get('user_id') === `eq.${userId}`
        ? [{ id: employeeId, tenant_id: tenantId, employment_status: 'active' }]
        : [];
    } else if (table === 'admin_users') data = { active: false, is_super_admin: false };
    else if (table === 'tenants') data = [{ id: tenantId, name: 'Test tenant', slug: 'test-tenant', timezone: 'Asia/Dhaka' }];
    else if (table === 'attendance_records') {
      attendanceFilter = Object.fromEntries(url.searchParams.entries());
      data = { status: 'late', work_mode: 'home', check_in: '2026-10-16T03:00:00.000Z', check_out: null };
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
  await expect(attendance.getByText('Late')).toBeVisible();
  await expect(attendance.getByText('Working remotely')).toBeVisible();
  await expect(attendance.getByText('09:00', { exact: true })).toBeVisible();
  await expect(attendance.getByText('Not checked out', { exact: true })).toBeVisible();
  expect(attendanceFilter).toMatchObject({
    select: 'status,work_mode,check_in,check_out',
    tenant_id: `eq.${tenantId}`,
    employee_id: `eq.${employeeId}`,
  });
  expect(attendanceFilter.attendance_date).toMatch(/^eq\.\d{4}-\d{2}-\d{2}$/);
  expect(leaveContextMethod).toBe('POST');
  expect(scheduleMethod).toBe('POST');
  expect(performanceContextMethod).toBe('POST');
  const balances = page.getByRole('region', { name: 'Remaining leave balances' });
  await expect(balances.getByText('Annual Leave')).toBeVisible();
  await expect(balances.getByText('15 days available')).toBeVisible();
  await expect(balances.getByText('2026 · 3 used · 2 pending')).toBeVisible();
  const holidays = page.getByRole('region', { name: 'Upcoming holidays' });
  await expect(holidays.getByText('National Day')).toBeVisible();
  await expect(holidays.getByText('2026-12-16 · Public')).toBeVisible();

  const schedule = page.getByRole('region', { name: 'Upcoming schedule' });
  const interviews = schedule.getByRole('region', { name: 'Upcoming interviews' });
  await expect(interviews.getByText('Data Analyst · Panel interview')).toBeVisible();
  await expect(interviews.getByText('16 Nov 2026, 09:00')).toBeVisible();
  const training = schedule.getByRole('region', { name: 'Upcoming training' });
  await expect(training.getByText('Secure coding')).toBeVisible();
  await expect(training.getByText('18 Nov 2026, 08:00 – 18 Nov 2026, 09:30')).toBeVisible();
  await expect(training.getByText('Leadership workshop')).toBeVisible();
  const reviews = schedule.getByRole('region', { name: 'Upcoming reviews' });
  await expect(reviews.getByText('2026 Annual Review')).toBeVisible();
  await expect(reviews.getByText('Self review due 2026-11-30')).toBeVisible();
  const events = schedule.getByRole('region', { name: 'Company events' });
  await expect(events.getByText('Company event dates are not available in this workspace calendar.')).toBeVisible();

  const goals = page.getByRole('region', { name: 'My goals and overdue actions' });
  await expect(goals.getByText('Complete onboarding')).toBeVisible();
  await expect(goals.getByText('Overdue', { exact: true })).toHaveCount(1);
  await expect(goals.getByText('Completed safety induction')).toBeVisible();
  await expect(goals.getByText('Completed · 100% complete')).toBeVisible();
  await expect(goals.getByText('This workspace provides performance goals; standalone task assignments are not available here.')).toBeVisible();
});
