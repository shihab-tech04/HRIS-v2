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

test('employee sees own attendance, pending requests and dashboard records', async ({ page }) => {
  let attendanceFilter: Record<string, string> = {};
  let attendanceCorrectionFilter: Record<string, string> = {};
  let leaveContextMethod = '';
  let scheduleMethod = '';
  let performanceContextMethod = '';
  let noticeContextMethod = '';
  let expenseContextMethod = '';
  let travelContextMethod = '';
  let selfServiceContextMethod = '';
  let payslipMethod = '';
  let employeeProfileFilter: Record<string, string> = {};
  let broadProfileRpcCalled = false;
  let profileUpdateMethod = '';
  let profileUpdatePayload: Record<string, unknown> = {};
  let updatedProfileFields: Record<string, unknown> = {};
  let profileChangeMethod = '';
  let profileChangePayload: Record<string, unknown> = {};
  let profileChangeHistory: Array<Record<string, unknown>> = [];
  let addressGetMethods: string[] = [];
  let addressSaveMethod = '';
  let addressSavePayload: { p_rows?: Array<Record<string, unknown>> } = {};
  let employeeAddresses: Array<Record<string, unknown>> = [{
    id: 'ed111111-1111-4111-8111-111111111112',
    address_type: 'Present',
    district: 'Dhaka',
    thana: 'Dhanmondi',
    post_code: '1209',
    city_village: 'Dhanmondi',
    road_block_house: 'Road 27',
  }];
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
    else if (path.endsWith('/rpc/employee_get_my_profile_change_requests')) data = profileChangeHistory;
    else if (path.endsWith('/rpc/employee_save_my_addresses_v2')) {
      addressSaveMethod = route.request().method();
      addressSavePayload = JSON.parse(route.request().postData() || '{}');
      employeeAddresses = (addressSavePayload.p_rows || []).map((row, index) => ({
        ...row,
        id: typeof row.id === 'string' ? row.id : `ed222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
      }));
      data = employeeAddresses.length;
    }
    else if (path.endsWith('/rpc/employee_submit_profile_change_request')) {
      profileChangeMethod = route.request().method();
      profileChangePayload = JSON.parse(route.request().postData() || '{}');
      profileChangeHistory = [{ id: 'ef111111-1111-4111-8111-111111111111', field_key: profileChangePayload.p_field_key, reason: profileChangePayload.p_reason, status: 'pending', submitted_at: '2026-10-16T12:00:00.000Z', reviewed_at: null, review_note: null }];
      data = 'ef111111-1111-4111-8111-111111111111';
    }
    else if (path.endsWith('/rpc/employee_get_leave_context')) {
      leaveContextMethod = route.request().method();
      data = { balances: [{ leave_type_id: 'e4444444-4444-4444-8444-444444444444', leave_type_name: 'Annual Leave', balance_year: 2026, available_days: 15, used_days: 3, pending_days: 2 }], holidays: [{ id: 'e5555555-5555-4555-8555-555555555555', name: 'National Day', start_date: '2026-12-16', end_date: '2026-12-16', holiday_type: 'Public', description: null }], requests: [{ id: 'ec111111-1111-4111-8111-111111111111', leave_type_name: 'Annual Leave', from_date: '2026-11-01', to_date: '2026-11-02', status: 'pending', submitted_at: '2026-10-15T12:00:00.000Z' }] };
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
    else if (path.endsWith('/rpc/employee_get_notice_context')) {
      noticeContextMethod = route.request().method();
      data = { can_manage: false, notices: [
        { id: 'eb111111-1111-4111-8111-111111111111', title: 'Benefits enrollment timeline', category: 'Benefits', body: 'Enrollment closes on 30 November.', published_at: '2000-01-01T00:00:00.000Z', pinned: true },
        { id: 'eb222222-2222-4222-8222-222222222222', title: 'October town hall', category: 'Events', body: 'Join the monthly town hall.', published_at: '2025-10-01T00:00:00.000Z', pinned: false },
        { id: 'eb333333-3333-4333-8333-333333333333', title: 'Future announcement', category: 'Events', body: 'Not published yet.', published_at: '2999-01-01T00:00:00.000Z', pinned: true },
      ] };
    }
    else if (path.endsWith('/rpc/employee_get_expense_context')) {
      expenseContextMethod = route.request().method();
      data = { claims: [{ id: 'ec222222-2222-4222-8222-222222222222', description: 'Synthetic test claim', status: 'submitted', submitted_at: '2026-10-14T12:00:00.000Z' }], categories: [] };
    }
    else if (path.endsWith('/rpc/employee_get_travel_context')) {
      travelContextMethod = route.request().method();
      data = { requests: [{ id: 'ec333333-3333-4333-8333-333333333333', destination: 'Synthetic test destination', from_date: '2026-11-20', status: 'submitted', submitted_at: '2026-10-13T12:00:00.000Z' }] };
    }
    else if (path.endsWith('/rpc/employee_get_self_service_context')) {
      selfServiceContextMethod = route.request().method();
      data = { requests: [
        { id: 'ec444444-4444-4444-8444-444444444444', request_type: 'employment_certificate', status: 'pending', submitted_at: '2026-10-12T12:00:00.000Z' },
        { id: 'ec555555-5555-4555-8555-555555555555', request_type: 'work_from_home', status: 'in_progress', submitted_at: '2026-10-11T12:00:00.000Z' },
        { id: 'ec666666-6666-4666-8666-666666666666', request_type: 'noc_letter', status: 'completed', submitted_at: '2026-10-10T12:00:00.000Z' },
      ] };
    }
    else if (path.endsWith('/rpc/employee_get_my_payslips')) {
      payslipMethod = route.request().method();
      data = [
        { id: 'ed111111-1111-4111-8111-111111111111', pay_period_name: 'October 2026', pay_date: '2026-10-31', currency: 'BDT', basic_salary: 20000, house_rent_allowance: 6000, medical_allowance: 1000, transport_allowance: 500, special_allowance: 0, overtime_pay: 0, bonus: 0, tax_deduction: 500, provident_fund_deduction: 1000, leave_without_pay_deduction: 0, other_deductions: 0, gross_earnings: 27500, total_deductions: 1500, net_salary: 26000, status: 'released' },
        { id: 'ed222222-2222-4222-8222-222222222222', pay_period_name: 'November 2026', pay_date: '2026-11-30', currency: 'BDT', net_salary: 99999, status: 'draft' },
      ];
    }
    else if (path.endsWith('/rpc/employee_get_my_profile')) {
      broadProfileRpcCalled = true;
      data = { bank: { bank_account_no: 'should-not-be-requested' }, nid_number: 'should-not-be-requested' };
    }
    else if (path.endsWith('/rpc/employee_update_my_profile')) {
      profileUpdateMethod = route.request().method();
      profileUpdatePayload = JSON.parse(route.request().postData() || '{}');
      updatedProfileFields = (profileUpdatePayload.p_payload as Record<string, unknown>) || {};
      data = employeeId;
    }
    else if (table === 'employee_addresses') {
      addressGetMethods.push(route.request().method());
      data = employeeAddresses;
    }
    else if (table === 'tenant_memberships') data = [];
    else if (table === 'employees') {
      employeeProfileFilter = Object.fromEntries(url.searchParams.entries());
      data = url.searchParams.get('user_id') === `eq.${userId}`
        ? [{ id: employeeId, tenant_id: tenantId, full_name: 'Synthetic Employee', preferred_name: updatedProfileFields.preferred_name ?? 'Sam', employee_number: 'SYN-001', official_email: 'synthetic.employee@example.org', personal_email: updatedProfileFields.personal_email ?? 'sam.personal@example.org', phone: updatedProfileFields.phone ?? '+8801712345678', official_phone: '+88029000000', gender: updatedProfileFields.gender ?? 'Female', date_of_birth: updatedProfileFields.date_of_birth ?? '1990-04-12', nationality: updatedProfileFields.nationality ?? 'Bangladeshi', marital_status: updatedProfileFields.marital_status ?? 'Single', employment_status: 'active' }]
        : [];
    } else if (table === 'admin_users') data = { active: false, is_super_admin: false };
    else if (table === 'tenants') data = [{ id: tenantId, name: 'Test tenant', slug: 'test-tenant', timezone: 'Asia/Dhaka' }];
    else if (table === 'attendance_records') {
      attendanceFilter = Object.fromEntries(url.searchParams.entries());
      data = { status: 'late', work_mode: 'home', check_in: '2026-10-16T03:00:00.000Z', check_out: null };
    } else if (table === 'attendance_corrections') {
      attendanceCorrectionFilter = Object.fromEntries(url.searchParams.entries());
      data = [{ id: 'ec777777-7777-4777-8777-777777777777', attendance_date: '2026-10-15', status: 'pending', requested_at: '2026-10-15T13:00:00.000Z' }];
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
  expect(attendanceCorrectionFilter).toMatchObject({
    select: 'id,attendance_date,status,requested_at',
    tenant_id: `eq.${tenantId}`,
    employee_id: `eq.${employeeId}`,
    status: 'eq.pending',
  });
  expect(leaveContextMethod).toBe('POST');
  expect(scheduleMethod).toBe('POST');
  expect(performanceContextMethod).toBe('POST');
  expect(noticeContextMethod).toBe('POST');
  expect(expenseContextMethod).toBe('POST');
  expect(travelContextMethod).toBe('POST');
  expect(selfServiceContextMethod).toBe('POST');
  expect(payslipMethod).toBe('POST');
  expect(employeeProfileFilter).toMatchObject({
    select: 'id,full_name,preferred_name,employee_number,official_email,personal_email,phone,official_phone,gender,date_of_birth,nationality,marital_status,employment_status',
    tenant_id: `eq.${tenantId}`,
    user_id: `eq.${userId}`,
  });
  expect(broadProfileRpcCalled).toBe(false);
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

  const announcements = page.getByRole('region', { name: 'Recent HR announcements' });
  await expect(announcements.getByText('Benefits enrollment timeline')).toBeVisible();
  await expect(announcements.getByText('Pinned', { exact: true })).toBeVisible();
  await expect(announcements.getByText('Enrollment closes on 30 November.')).toBeVisible();
  await expect(announcements.getByText('October town hall')).toBeVisible();
  await expect(announcements.getByText('Future announcement')).toHaveCount(0);
  const announcementRows = await announcements.getByRole('listitem').allTextContents();
  expect(announcementRows).toHaveLength(2);
  expect(announcementRows[0]).toContain('Benefits enrollment timeline');
  expect(announcementRows[1]).toContain('October town hall');

  const requests = page.getByRole('region', { name: 'Requests awaiting action' });
  const requestRows = await requests.getByRole('listitem').allTextContents();
  expect(requestRows).toHaveLength(6);
  await expect(requests.getByText('Annual Leave request')).toBeVisible();
  await expect(requests.getByText('Attendance correction')).toBeVisible();
  await expect(requests.getByText('Expense claim')).toBeVisible();
  await expect(requests.getByText('Travel request')).toBeVisible();
  await expect(requests.getByText('employment certificate request')).toBeVisible();
  await expect(requests.getByText('work from home request')).toBeVisible();
  await expect(requests.getByText('noc letter request')).toHaveCount(0);

  const quickAccess = page.getByRole('navigation', { name: 'Employee quick access' });
  const expectedLinks = [
    ['Attendance', '#today-attendance'],
    ['Leave', '#leave-balances'],
    ['Payslips', '#my-payslips'],
    ['Profile', '#employee-profile'],
    ['Requests', '#pending-requests'],
  ];
  for (const [label, href] of expectedLinks) {
    await expect(quickAccess.getByRole('link', { name: label })).toHaveAttribute('href', href);
  }
  await quickAccess.getByRole('link', { name: 'Payslips' }).click();
  await expect(page).toHaveURL(/#my-payslips$/);
  const payslips = page.getByRole('region', { name: 'My payslips' });
  await expect(payslips.getByText('October 2026')).toBeVisible();
  await expect(payslips.getByText('Pay date: 2026-10-31')).toBeVisible();
  await expect(payslips.getByText('Net pay: BDT 26,000.00')).toBeVisible();
  await expect(payslips.getByText('November 2026')).toHaveCount(0);
  await payslips.getByText('View pay details').click();
  await expect(payslips.getByText('Basic salary')).toBeVisible();
  await expect(payslips.getByText('BDT 20,000.00')).toBeVisible();
  const profile = page.getByRole('region', { name: 'My profile' });
  await expect(profile.getByText('Synthetic Employee')).toBeVisible();
  await expect(profile.getByText('SYN-001')).toBeVisible();
  await expect(profile.getByText('Sam', { exact: true })).toBeVisible();
  await expect(profile.getByText('synthetic.employee@example.org')).toBeVisible();
  await expect(profile.getByText('sam.personal@example.org')).toBeVisible();
  await expect(profile.getByText('+8801712345678')).toBeVisible();
  await expect(profile.getByText('+88029000000')).toBeVisible();
  await expect(profile.getByText('Female')).toBeVisible();
  await expect(profile.getByText('1990-04-12')).toBeVisible();
  await expect(profile.getByText('Bangladeshi')).toBeVisible();
  await expect(profile.getByText('Single')).toBeVisible();
  await expect(profile.getByText('active')).toBeVisible();

  await profile.getByRole('button', { name: 'Edit personal information' }).click();
  await profile.getByLabel('Preferred name').fill('Sammy');
  await profile.getByLabel('Personal email').fill('sammy.personal@example.org');
  await profile.getByLabel('Personal phone').fill('+8801812345678');
  await profile.getByLabel('Gender').selectOption('Other');
  await profile.getByLabel('Date of birth').fill('1990-04-13');
  await profile.getByLabel('Nationality').fill('Bangladeshi');
  await profile.getByLabel('Marital status').fill('Single');
  await profile.getByRole('button', { name: 'Save personal information' }).click();
  await expect(profile.getByText('Sammy', { exact: true })).toBeVisible();
  await expect(profile.getByText('sammy.personal@example.org')).toBeVisible();
  await expect(profile.getByText('+8801812345678')).toBeVisible();
  await expect(profile.getByRole('status')).toHaveText('Personal information saved.');
  await expect(profile.getByText('Other', { exact: true })).toBeVisible();
  await expect(profile.getByText('1990-04-13')).toBeVisible();
  await expect(profile.getByText('Bangladeshi')).toBeVisible();
  await expect(profile.getByText('Single')).toBeVisible();
  expect(profileUpdateMethod).toBe('POST');
  expect(profileUpdatePayload).toEqual({ p_payload: {
    preferred_name: 'Sammy',
    personal_email: 'sammy.personal@example.org',
    phone: '+8801812345678',
    gender: 'Other',
    date_of_birth: '1990-04-13',
    nationality: 'Bangladeshi',
    marital_status: 'Single',
  } });

  const addresses = profile.getByRole('region', { name: 'Present and permanent addresses' });
  await expect(addresses.getByText('Present address')).toBeVisible();
  await expect(addresses.getByText('Road 27, Dhanmondi, Dhanmondi, Dhaka, 1209')).toBeVisible();
  await addresses.getByRole('button', { name: 'Edit addresses' }).click();
  await addresses.getByLabel('Present address 1 district').fill('Gazipur');
  await addresses.getByLabel('Present address 1 city or village').fill('Tongi');
  await addresses.getByRole('button', { name: 'Add permanent address' }).click();
  await addresses.getByLabel('Permanent address 2 district').fill('Cumilla');
  await addresses.getByLabel('Permanent address 2 thana').fill('Burichang');
  await addresses.getByLabel('Permanent address 2 post code').fill('3520');
  await addresses.getByLabel('Permanent address 2 city or village').fill('Madhabpur');
  await addresses.getByLabel('Permanent address 2 road, block or house').fill('House 6');
  await addresses.getByRole('button', { name: 'Save addresses' }).click();
  await expect(addresses.getByText('Road 27, Tongi, Dhanmondi, Gazipur, 1209')).toBeVisible();
  await expect(addresses.getByText('House 6, Madhabpur, Burichang, Cumilla, 3520')).toBeVisible();
  await expect(profile.getByText('Present and permanent addresses saved.')).toBeVisible();
  expect(addressGetMethods.length).toBeGreaterThanOrEqual(2);
  expect(addressGetMethods.every(method => method === 'GET')).toBe(true);
  expect(addressSaveMethod).toBe('POST');
  expect(addressSavePayload).toEqual({ p_rows: [
    {
      id: 'ed111111-1111-4111-8111-111111111112',
      address_type: 'Present',
      district: 'Gazipur',
      thana: 'Dhanmondi',
      post_code: '1209',
      city_village: 'Tongi',
      road_block_house: 'Road 27',
    },
    {
      address_type: 'Permanent',
      district: 'Cumilla',
      thana: 'Burichang',
      post_code: '3520',
      city_village: 'Madhabpur',
      road_block_house: 'House 6',
    },
  ] });
  expect(broadProfileRpcCalled).toBe(false);

  await profile.getByText('Request a protected profile change').click();
  await profile.getByLabel('Profile field').selectOption('official_email');
  await profile.getByLabel('Proposed value').fill('sammy.employee@example.org');
  await profile.getByLabel('Reason for change').fill('My official contact address changed.');
  await profile.getByRole('button', { name: 'Submit profile change request' }).click();
  await expect(profile.getByText('Your profile change request was submitted for HR review.')).toBeVisible();
  const changeHistory = profile.getByRole('region', { name: 'My profile change requests' });
  await expect(changeHistory.getByText('Official email (HR record only)')).toBeVisible();
  await expect(changeHistory.getByText('pending')).toBeVisible();
  expect(profileChangeMethod).toBe('POST');
  expect(profileChangePayload).toEqual({
    p_field_key: 'official_email',
    p_requested_value: 'sammy.employee@example.org',
    p_reason: 'My official contact address changed.',
  });
});
