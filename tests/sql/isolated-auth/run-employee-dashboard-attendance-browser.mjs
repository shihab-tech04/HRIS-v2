// Exercises the employee attendance month selector against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_ATTENDANCE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_ATTENDANCE_TENANT_ID',
  'HRIS_LOCAL_ATTENDANCE_CURRENT_MONTH', 'HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH',
  'HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH',
  'HRIS_LOCAL_ROSTER_ASSIGNMENT_ID', 'HRIS_LOCAL_ROSTER_ASSIGNMENT_DATE', 'HRIS_LOCAL_ROSTER_SHIFT_NAME',
  'HRIS_LOCAL_UPCOMING_TRAINING_SESSION_ID', 'HRIS_LOCAL_UPCOMING_TRAINING_PROGRAM_TITLE',
  'HRIS_LOCAL_DASHBOARD_EMPLOYEE_ID', 'HRIS_LOCAL_DASHBOARD_TASK_TITLE', 'HRIS_LOCAL_DASHBOARD_GOAL_TITLE',
  'HRIS_LOCAL_DASHBOARD_ANNOUNCEMENT_ID', 'HRIS_LOCAL_DASHBOARD_ANNOUNCEMENT_TITLE',
  'HRIS_LOCAL_DASHBOARD_TEAM_NAME',
  'HRIS_LOCAL_DASHBOARD_APPRAISAL_ID',
  'HRIS_LOCAL_DASHBOARD_PENDING_LEAVE_ID', 'HRIS_LOCAL_DASHBOARD_PENDING_SERVICE_ID',
  'HRIS_LOCAL_DASHBOARD_LEAVE_AVAILABLE_DAYS',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select an available loopback port for the employee browser journey.')));
      return;
    }
    probe.close(error => error ? reject(error) : resolvePort(String(address.port)));
  });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [resolve(repo, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: repo,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY,
  },
  stdio: 'ignore',
});

let browser;
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local employee dashboard UI server.');
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let failInitialPeriodRead = true;
  let failInitialIdentityCardRead = true;
  let failInitialRosterRead = true;
  let failInitialUpcomingTrainingRead = true;
  let failInitialDashboardTaskRead = true;
  let failInitialDashboardPendingRead = true;
  let failInitialDashboardReviewRead = true;
  let failDashboardNoticeRead = false;
  const identityCardRequests = [];
  const periodRequests = [];
  const rosterRequests = [];
  const upcomingTrainingRequests = [];
  const dashboardTaskRequests = [];
  const dashboardGoalRequests = [];
  const dashboardNoticeRequests = [];
  const dashboardPendingRequests = [];
  const dashboardReviewRequests = [];
  const directRosterTableRequests = [];
  const directAttendanceTableRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_attendance_period') && request.method() === 'POST') {
      const body = request.postDataJSON();
      periodRequests.push({ tenantId: body?.p_tenant_id, monthStart: body?.p_month_start });
    }
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_shift_roster') && request.method() === 'POST') {
      const body = request.postDataJSON();
      rosterRequests.push({ tenantId: body?.p_tenant_id, start: body?.p_start, end: body?.p_end });
    }
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_learning_context') && request.method() === 'POST') {
      const body = request.postDataJSON();
      upcomingTrainingRequests.push(body?.p_tenant_id);
    }
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_project_tasks') && request.method() === 'POST') {
      dashboardTaskRequests.push(request.postDataJSON()?.p_tenant_id);
    }
    if (url.pathname.endsWith('/rest/v1/performance_goals') && request.method() === 'GET') {
      dashboardGoalRequests.push({ tenantId: url.searchParams.get('tenant_id'), employeeId: url.searchParams.get('employee_id') });
    }
    if (url.pathname.endsWith('/rest/v1/notices') && request.method() === 'GET') {
      dashboardNoticeRequests.push({ tenantId: url.searchParams.get('tenant_id'), active: url.searchParams.get('active'),
        select: url.searchParams.get('select'), limit: url.searchParams.get('limit') });
    }
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_pending_requests') && request.method() === 'POST') {
      dashboardPendingRequests.push(request.postDataJSON()?.p_tenant_id);
    }
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_appraisal_work') && request.method() === 'POST') {
      dashboardReviewRequests.push(request.postDataJSON()?.p_tenant_id);
    }
    if (/\/rest\/v1\/(?:employee_shift_assignments|roster_change_notifications)(?:\?|$)/.test(url.pathname + url.search)) {
      directRosterTableRequests.push(url.pathname);
    }
    if (/\/rest\/v1\/attendance_records(?:\?|$)/.test(url.pathname + url.search)) {
      directAttendanceTableRequests.push(url.pathname);
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_employee_identity_card')
          && route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        identityCardRequests.push(body?.p_tenant_id);
        if (failInitialIdentityCardRead) {
          failInitialIdentityCardRead = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
            code: 'XX000', message: 'Synthetic temporary identity-card outage.',
          }) });
          return;
        }
      }
      if (failInitialUpcomingTrainingRead
          && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_learning_context')
          && route.request().method() === 'POST') {
        failInitialUpcomingTrainingRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic temporary learning-context outage.',
        }) });
        return;
      }
      if (failInitialDashboardTaskRead
          && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_project_tasks')
          && route.request().method() === 'POST') {
        failInitialDashboardTaskRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic temporary project task outage.',
        }) });
        return;
      }
      if (failInitialDashboardPendingRead
          && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_pending_requests')
          && route.request().method() === 'POST') {
        failInitialDashboardPendingRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic temporary dashboard pending-request outage.',
        }) });
        return;
      }
      if (failInitialDashboardReviewRead
          && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_appraisal_work')
          && route.request().method() === 'POST') {
        failInitialDashboardReviewRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic temporary dashboard review outage.',
        }) });
        return;
      }
      if (failDashboardNoticeRead && url.pathname.endsWith('/rest/v1/notices')
          && route.request().method() === 'GET'
          && url.searchParams.get('select') === 'id,title,category,pinned,published_at') {
        failDashboardNoticeRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic temporary dashboard announcement outage.',
        }) });
        return;
      }
      if (failInitialPeriodRead && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
          && route.request().method() === 'POST') {
        failInitialPeriodRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic temporary attendance-history outage.',
        }) });
        return;
      }
      if (failInitialRosterRead && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_shift_roster')
          && route.request().method() === 'POST') {
        failInitialRosterRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic temporary roster outage.',
        }) });
        return;
      }
      return route.continue();
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_ATTENDANCE_EMPLOYEE_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  const returnToOverview = async () => {
    if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
    await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  };
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  const todayAttendance = page.locator('section[aria-labelledby="employee-today-heading"]');
  const todayAttendanceText = await todayAttendance.innerText();
  if (!todayAttendanceText.includes(process.env.HRIS_LOCAL_DASHBOARD_TODAY_STATUS)
      || !todayAttendanceText.includes(process.env.HRIS_LOCAL_DASHBOARD_TODAY_WORK_MODE)) {
    throw new Error(`The linked employee's persisted today status or work mode was not rendered: ${todayAttendanceText}.`);
  }
  console.log('EMPLOYEE_DASHBOARD_TODAY_STATUS_BROWSER_ACCEPTANCE=PASS');
  const visibleAttendanceTimes = todayAttendanceText.match(/\b\d{1,2}:\d{2}(?:\s?[AP]M)?\b/g) || [];
  if (!todayAttendanceText.includes('Check in') || !todayAttendanceText.includes('Check out')
      || visibleAttendanceTimes.length < 2) {
    throw new Error(`The linked employee's persisted check-in and check-out fields were not rendered: ${todayAttendanceText}.`);
  }
  console.log('EMPLOYEE_DASHBOARD_TODAY_TIMES_BROWSER_ACCEPTANCE=PASS');
  const dashboardLeaveBalances = page.locator('section[aria-labelledby="employee-leave-balances-heading"]');
  await dashboardLeaveBalances.getByText(process.env.HRIS_LOCAL_DASHBOARD_LEAVE_AVAILABLE_DAYS, { exact: true }).waitFor({ state: 'visible' });
  await dashboardLeaveBalances.getByText('days available', { exact: true }).first().waitFor({ state: 'visible' });
  console.log('EMPLOYEE_DASHBOARD_LEAVE_BALANCE_BROWSER_ACCEPTANCE=PASS');
  const quickAccess = page.getByRole('navigation', { name: 'Quick access', exact: true });
  await quickAccess.waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(page, 'Employee dashboard quick access mobile');
  await quickAccess.getByRole('button', { name: 'Attendance', exact: true }).click();
  if (await page.evaluate(() => document.activeElement?.id) !== 'employee-today-heading') {
    throw new Error('The attendance quick action did not focus today’s attendance section.');
  }
  await quickAccess.getByRole('button', { name: 'My profile', exact: true }).click();
  if (await page.evaluate(() => document.activeElement?.id) !== 'employee-profile-heading') {
    throw new Error('The profile quick action did not focus the employee profile section.');
  }
  await quickAccess.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal leave', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee dashboard leave shortcut mobile');
  await returnToOverview();
  await page.getByRole('navigation', { name: 'Quick access', exact: true }).getByRole('button', { name: 'My Payslips', exact: true }).click();
  await page.getByRole('heading', { name: 'My Payslips', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee dashboard payslip shortcut mobile');
  await returnToOverview();
  await page.getByRole('navigation', { name: 'Quick access', exact: true }).getByRole('button', { name: 'My Requests', exact: true }).click();
  await page.getByRole('heading', { name: 'My Service Requests', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee dashboard request shortcut mobile');
  await returnToOverview();
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Employee dashboard quick access desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  console.log('EMPLOYEE_DASHBOARD_QUICK_ACCESS_BROWSER_ACCEPTANCE=PASS');
  await page.locator('[data-employee-contact="official-phone"]').getByText('+880 2 5550001', { exact: true }).waitFor({ state: 'visible' });
  await page.locator('[data-employee-profile="team"]').getByText(process.env.HRIS_LOCAL_DASHBOARD_TEAM_NAME, { exact: true }).waitFor({ state: 'visible' });
  const upcomingReviews = page.locator('section[aria-labelledby="employee-upcoming-reviews-heading"]');
  await upcomingReviews.getByRole('alert').filter({ hasText: 'Unable to load your upcoming reviews.' }).waitFor({ state: 'visible' });
  if (failInitialDashboardReviewRead) throw new Error('The injected appraisal deadline dashboard outage was not observed.');
  await upcomingReviews.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
  await upcomingReviews.locator(`[data-upcoming-review="${process.env.HRIS_LOCAL_DASHBOARD_APPRAISAL_ID}"]`).waitFor({ state: 'visible' });
  await upcomingReviews.getByText('QA A Annual Review', { exact: true }).waitFor({ state: 'visible' });
  await upcomingReviews.getByText(/Self-review due/).waitFor({ state: 'visible' });
  if (dashboardReviewRequests.length < 2 || dashboardReviewRequests.some(value => value !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)) {
    throw new Error(`Dashboard appraisal deadline reads were missing or not tenant-bound: ${JSON.stringify(dashboardReviewRequests)}.`);
  }
  await assertNoOverflow(page, 'Employee upcoming reviews mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Employee upcoming reviews desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  await upcomingReviews.getByRole('button', { name: 'Open My Performance', exact: true }).click();
  await page.getByRole('heading', { name: 'My Performance', exact: true }).waitFor({ state: 'visible' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  await upcomingReviews.locator(`[data-upcoming-review="${process.env.HRIS_LOCAL_DASHBOARD_APPRAISAL_ID}"]`).waitFor({ state: 'visible' });
  const pendingRequests = page.locator('section[aria-labelledby="employee-pending-requests-heading"]');
  await pendingRequests.getByRole('alert').filter({ hasText: 'Unable to load your pending requests.' }).waitFor({ state: 'visible' });
  if (failInitialDashboardPendingRead) throw new Error('The injected pending-request dashboard outage was not observed.');
  await pendingRequests.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
  await pendingRequests.locator(`[data-pending-request-id="${process.env.HRIS_LOCAL_DASHBOARD_PENDING_LEAVE_ID}"]`).waitFor({ state: 'visible' });
  for (const kind of ['leave','attendance','expense','travel','service']) {
    await pendingRequests.locator(`[data-pending-request-kind="${kind}"]`).first().waitFor({ state: 'visible' });
  }
  if (dashboardPendingRequests.length < 2
      || dashboardPendingRequests.some(requestedTenantId => requestedTenantId !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)) {
    throw new Error(`Pending request reads were missing or not bound to the employee tenant: ${JSON.stringify(dashboardPendingRequests)}.`);
  }
  await assertNoOverflow(page, 'Employee pending requests mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Employee pending requests desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  const announcementPreview = page.locator('section[aria-labelledby="my-announcements-heading"]');
  await announcementPreview.getByRole('heading', { name: 'Recent HR announcements', exact: true }).waitFor({ state: 'visible' });
  const dashboardNotice = announcementPreview.locator(`[data-announcement-id="${process.env.HRIS_LOCAL_DASHBOARD_ANNOUNCEMENT_ID}"]`);
  await dashboardNotice.getByRole('heading', { name: process.env.HRIS_LOCAL_DASHBOARD_ANNOUNCEMENT_TITLE, exact: true }).waitFor({ state: 'visible' });
  if (await announcementPreview.locator('[data-announcement-id]').count() !== 2
      || !dashboardNoticeRequests.length
      || dashboardNoticeRequests.some(request => request.tenantId !== `eq.${process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID}`
        || request.active !== 'eq.true' || request.select !== 'id,title,category,pinned,published_at' || request.limit !== '3')) {
    throw new Error(`The compact announcement preview returned an unexpected dataset or query: ${JSON.stringify({ dashboardNoticeRequests, count: await announcementPreview.locator('[data-announcement-id]').count() })}.`);
  }
  failDashboardNoticeRead = true;
  await announcementPreview.getByRole('button', { name: 'Refresh announcements', exact: true }).click();
  await announcementPreview.getByRole('alert').filter({ hasText: 'Announcements are unavailable.' }).waitFor({ state: 'visible' });
  await announcementPreview.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
  await dashboardNotice.waitFor({ state: 'visible' });
  await announcementPreview.getByRole('button', { name: 'View all announcements', exact: true }).click();
  await page.getByRole('heading', { name: 'Announcements', exact: true }).waitFor({ state: 'visible' });
  await page.locator(`[data-announcement-id="${process.env.HRIS_LOCAL_DASHBOARD_ANNOUNCEMENT_ID}"]`).waitFor({ state: 'visible' });
  if (await page.locator('[data-announcement-id]').count() !== 2) throw new Error('The dashboard announcement link did not open the full employee-safe announcement list.');
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'Recent HR announcements', exact: true }).waitFor({ state: 'visible' });
  const dashboardWork = page.locator('section[aria-labelledby="employee-dashboard-work-heading"]');
  await dashboardWork.getByRole('alert').filter({ hasText: 'Unable to load your assigned work.' }).waitFor({ state: 'visible' });
  if (failInitialDashboardTaskRead) throw new Error('The injected dashboard project-task outage was not observed.');
  await dashboardWork.getByRole('button', { name: 'Retry', exact: true }).click();
  await dashboardWork.locator('[data-employee-dashboard-work="task"]')
    .filter({ hasText: process.env.HRIS_LOCAL_DASHBOARD_TASK_TITLE }).waitFor({ state: 'visible' });
  const overdueGoal = dashboardWork.locator('[data-employee-dashboard-work="goal"][data-overdue="true"]')
    .filter({ hasText: process.env.HRIS_LOCAL_DASHBOARD_GOAL_TITLE });
  await overdueGoal.waitFor({ state: 'visible' });
  if (dashboardTaskRequests.length < 2
      || dashboardTaskRequests.some(tenantId => tenantId !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)
      || !dashboardGoalRequests.length
      || dashboardGoalRequests.some(request => request.tenantId !== `eq.${process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID}`
        || request.employeeId !== `eq.${process.env.HRIS_LOCAL_DASHBOARD_EMPLOYEE_ID}`)) {
    throw new Error(`Dashboard task/goal reads were missing or not bound to the active tenant and employee: ${JSON.stringify({ dashboardTaskRequests, dashboardGoalRequests })}.`);
  }
  await dashboardWork.getByRole('button', { name: 'Refresh assigned work', exact: true }).click();
  await dashboardWork.locator('[data-employee-dashboard-work="task"]')
    .filter({ hasText: process.env.HRIS_LOCAL_DASHBOARD_TASK_TITLE }).waitFor({ state: 'visible' });
  await dashboardWork.getByRole('button', { name: 'Open My Projects', exact: true }).click();
  await page.getByRole('heading', { name: 'My Projects & Allocations', exact: true }).waitFor({ state: 'visible' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  await dashboardWork.getByRole('button', { name: 'View my goals', exact: true }).click();
  await page.getByRole('heading', { name: 'My Performance', exact: true }).waitFor({ state: 'visible' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  await dashboardWork.locator('[data-employee-dashboard-work="goal"][data-overdue="true"]')
    .filter({ hasText: process.env.HRIS_LOCAL_DASHBOARD_GOAL_TITLE }).waitFor({ state: 'visible' });
  const upcomingTraining = page.locator('section[aria-labelledby="employee-upcoming-training-heading"]');
  await upcomingTraining.getByRole('alert').filter({ hasText: 'Unable to load upcoming training.' }).waitFor({ state: 'visible' });
  if (failInitialUpcomingTrainingRead) throw new Error('The injected learning-context outage was not observed.');
  await upcomingTraining.getByRole('button', { name: 'Retry', exact: true }).click();
  const confirmedTrainingSession = page.locator(`[data-upcoming-training-session="${process.env.HRIS_LOCAL_UPCOMING_TRAINING_SESSION_ID}"]`);
  await confirmedTrainingSession.waitFor({ state: 'visible' });
  await confirmedTrainingSession.getByText(process.env.HRIS_LOCAL_UPCOMING_TRAINING_PROGRAM_TITLE, { exact: true }).waitFor({ state: 'visible' });
  if (await upcomingTraining.locator('[data-upcoming-training-session]').count() !== 1
      || await upcomingTraining.getByText('QA A Approval Learning', { exact: true }).count() !== 0) {
    throw new Error('Upcoming training included a requested session or a session without an enrolled assignment.');
  }
  if (await upcomingTraining.locator('a').count() !== 0) {
    throw new Error('Upcoming training exposed a join URL instead of linking to the established My Learning journey.');
  }
  if (upcomingTrainingRequests.length < 2
      || upcomingTrainingRequests.some(tenantId => tenantId !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)) {
    throw new Error(`Upcoming training reads were missing or not tenant-bound: ${JSON.stringify(upcomingTrainingRequests)}.`);
  }
  await upcomingTraining.getByRole('button', { name: 'Open My Learning', exact: true }).click();
  await page.getByRole('heading', { name: 'My Learning', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: process.env.HRIS_LOCAL_UPCOMING_TRAINING_PROGRAM_TITLE, exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  await page.locator(`[data-upcoming-training-session="${process.env.HRIS_LOCAL_UPCOMING_TRAINING_SESSION_ID}"]`).waitFor({ state: 'visible' });
  const pendingServiceRequest = page.locator(`section[aria-labelledby="employee-pending-requests-heading"] [data-pending-request-id="${process.env.HRIS_LOCAL_DASHBOARD_PENDING_SERVICE_ID}"]`);
  await pendingServiceRequest.waitFor({ state: 'visible' });
  await pendingServiceRequest.getByRole('button', { name: 'View history', exact: true }).click();
  await page.getByRole('heading', { name: 'My Service Requests', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  const monthInput = page.locator('input[type="month"][aria-label="Attendance month"]');
  await monthInput.waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Retry attendance month', exact: true }).waitFor({ state: 'visible' });
  if (failInitialPeriodRead) throw new Error('The injected monthly attendance outage was not observed.');

  await page.getByRole('button', { name: 'View digital employee ID', exact: true }).click();
  const identityDialog = page.getByRole('dialog', { name: 'Digital employee ID', exact: true });
  await identityDialog.getByRole('alert').filter({ hasText: 'Unable to load your employee ID card.' }).waitFor({ state: 'visible' });
  await identityDialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await identityDialog.locator('[data-employee-id-card][data-employment-status="active"]').waitFor({ state: 'visible' });
  for (const value of ['QA-A-001', 'Synthetic Employee A', 'QA A designation', 'QA A department', 'Active']) {
    await identityDialog.getByText(value, { exact: true }).waitFor({ state: 'visible' });
  }
  if (failInitialIdentityCardRead) throw new Error('The injected identity-card outage was not observed.');
  await assertNoOverflow(page, 'Employee digital ID mobile');
  await identityDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await identityDialog.waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor({ state: 'visible' });
  const rosterNotification = page.locator(`[data-notification-source="roster_change"][data-roster-assignment-id="${process.env.HRIS_LOCAL_ROSTER_ASSIGNMENT_ID}"]`);
  await rosterNotification.waitFor({ state: 'visible' });
  await rosterNotification.getByRole('heading', { name: 'Your roster was updated', exact: true }).waitFor({ state: 'visible' });
  await rosterNotification.getByText(process.env.HRIS_LOCAL_ROSTER_SHIFT_NAME, { exact: true }).waitFor({ state: 'visible' });
  await rosterNotification.getByRole('button', { name: 'Open roster', exact: true }).click();
  await page.getByRole('heading', { name: 'My Roster', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('alert').filter({ hasText: 'Unable to load your roster. Try again.' }).waitFor({ state: 'visible' });
  if (failInitialRosterRead) throw new Error('The injected initial employee roster outage was not observed.');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const employeeRosterCard = page.locator(`[data-roster-assignment-id="${process.env.HRIS_LOCAL_ROSTER_ASSIGNMENT_ID}"]`);
  await employeeRosterCard.waitFor({ state: 'visible' });
  for (const value of [process.env.HRIS_LOCAL_ROSTER_SHIFT_NAME, '09:00 – 17:00', '60 minutes', '10 minutes', 'Sunday, Saturday']) {
    await employeeRosterCard.getByText(value, { exact: true }).waitFor({ state: 'visible' });
  }
  if (await page.locator('#my-roster-start').inputValue() !== process.env.HRIS_LOCAL_ROSTER_ASSIGNMENT_DATE
      || await page.locator('#my-roster-end').inputValue() !== process.env.HRIS_LOCAL_ROSTER_ASSIGNMENT_DATE) {
    throw new Error('The roster notification did not focus its exact assigned date.');
  }
  await page.getByRole('button', { name: 'Next 7 days', exact: true }).click();
  await employeeRosterCard.waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'This month', exact: true }).click();
  await employeeRosterCard.waitFor({ state: 'visible' });
  const rosterStart = page.locator('#my-roster-start');
  const rosterEnd = page.locator('#my-roster-end');
  await rosterStart.fill(process.env.HRIS_LOCAL_ROSTER_ASSIGNMENT_DATE);
  await rosterEnd.fill(process.env.HRIS_LOCAL_ROSTER_ASSIGNMENT_DATE);
  await page.getByRole('button', { name: 'Apply dates', exact: true }).click();
  await employeeRosterCard.waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee roster mobile');
  await page.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  await page.getByRole('heading', { name: 'আমার রোস্টার', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'তারিখ প্রয়োগ করুন', exact: true }).waitFor({ state: 'visible' });
  await employeeRosterCard.getByText(process.env.HRIS_LOCAL_ROSTER_SHIFT_NAME, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee roster Bengali mobile');
  await page.getByRole('button', { name: 'রোস্টার রিফ্রেশ করুন', exact: true }).click();
  await employeeRosterCard.waitFor({ state: 'visible' });
  await page.reload();
  await page.getByRole('heading', { name: 'ব্যক্তিগত ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'সাম্প্রতিক এইচআর ঘোষণা', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'আমার কাজ ও লক্ষ্যসমূহ', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'আসন্ন পর্যালোচনা', exact: true }).waitFor({ state: 'visible' });
  await page.getByText(/নিজের পর্যালোচনার শেষ তারিখ/).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'আমার কর্মদক্ষতা খুলুন', exact: true }).waitFor({ state: 'visible' });
  await page.getByText('মেয়াদোত্তীর্ণ', { exact: true }).first().waitFor({ state: 'visible' });
  await page.locator(`[data-upcoming-training-session="${process.env.HRIS_LOCAL_UPCOMING_TRAINING_SESSION_ID}"]`).waitFor({ state: 'visible' });
  if (await page.locator('html').getAttribute('lang') !== 'bn') throw new Error('Roster navigation lost Bengali locale on refresh.');
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'আমার রোস্টার', exact: true }).click();
  await page.getByRole('heading', { name: 'আমার রোস্টার', exact: true }).waitFor({ state: 'visible' });
  await employeeRosterCard.waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee roster Bengali mobile after refresh');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Employee roster Bengali desktop');
  if (rosterRequests.length < 5 || rosterRequests.some(request => request.tenantId !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)) {
    throw new Error(`Roster reads were missing or not tenant-bound: ${JSON.stringify(rosterRequests)}.`);
  }
  if (!rosterRequests.some(request => request.start === process.env.HRIS_LOCAL_ROSTER_ASSIGNMENT_DATE
      && request.end === process.env.HRIS_LOCAL_ROSTER_ASSIGNMENT_DATE)) {
    throw new Error(`Focused assignment dates were not requested: ${JSON.stringify(rosterRequests)}.`);
  }
  if (directRosterTableRequests.length) {
    throw new Error(`Employee roster bypassed the secured RPC: ${JSON.stringify(directRosterTableRequests)}.`);
  }

  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'ব্যক্তিগত ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'অপেক্ষমাণ অনুরোধসমূহ', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'অপেক্ষমাণ অনুরোধ রিফ্রেশ করুন', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'আসন্ন প্রশিক্ষণ', exact: true }).waitFor({ state: 'visible' });
  await page.getByText('আপনার জন্য নির্ধারিত নিশ্চিত সেশন।', { exact: true }).waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(page, 'Employee upcoming training Bengali mobile');
  await page.getByRole('button', { name: 'ডিজিটাল কর্মচারী পরিচয়পত্র দেখুন', exact: true }).click();
  const bengaliIdentityDialog = page.getByRole('dialog', { name: 'ডিজিটাল কর্মচারী পরিচয়পত্র', exact: true });
  await bengaliIdentityDialog.getByText('সক্রিয়', { exact: true }).waitFor({ state: 'visible' });
  await bengaliIdentityDialog.getByRole('button', { name: 'বন্ধ করুন', exact: true }).click();
  await bengaliIdentityDialog.waitFor({ state: 'detached' });
  await page.getByLabel('উপস্থিতির মাস', { exact: true }).waitFor({ state: 'visible' });
  if (await page.locator('html').getAttribute('lang') !== 'bn'
      || await page.evaluate(() => localStorage.getItem('synesis-hris-locale')) !== 'bn') {
    throw new Error('The employee dashboard did not persist Bengali locale state.');
  }
  const bengaliQuickAccess = page.getByRole('navigation', { name: 'দ্রুত প্রবেশ', exact: true });
  await bengaliQuickAccess.getByRole('button', { name: 'উপস্থিতি', exact: true }).waitFor({ state: 'visible' });
  await bengaliQuickAccess.getByRole('button', { name: 'আমার বেতন স্লিপ', exact: true }).waitFor({ state: 'visible' });
  await bengaliQuickAccess.getByRole('button', { name: 'আমার প্রোফাইল', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee attendance month Bengali mobile');

  const correctionButton = page.getByRole('button', { name: 'সংশোধনের আবেদন করুন', exact: true });
  await correctionButton.click();
  const correctionDialog = page.getByRole('dialog', { name: 'উপস্থিতি সংশোধনের আবেদন', exact: true });
  await correctionDialog.waitFor({ state: 'visible' });
  // The required marker is visually hidden from assistive technology but remains
  // part of Playwright's associated-label text; match the translated label
  // without requiring an exact text-node match.
  await correctionDialog.getByLabel('কারণ').fill('synthetic validation check');
  await correctionDialog.getByRole('button', { name: 'আবেদন জমা দিন', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'সংশোধনের জন্য অন্তত একটি উপস্থিতির তথ্য দিন।' }).waitFor({ state: 'visible' });
  await correctionDialog.getByRole('button', { name: 'বাতিল', exact: true }).click();
  await correctionDialog.waitFor({ state: 'detached' });

  const leaveRequestButton = page.getByRole('button', { name: 'ছুটির আবেদন', exact: true });
  if (!(await leaveRequestButton.isEnabled())) throw new Error('The synthetic employee did not receive an authorized leave type for the localized request dialog.');
  await leaveRequestButton.click();
  const leaveDialog = page.getByRole('dialog', { name: 'ছুটির আবেদন', exact: true });
  await leaveDialog.waitFor({ state: 'visible' });
  await leaveDialog.getByLabel('ছুটির ধরন').waitFor({ state: 'visible' });
  await leaveDialog.getByRole('button', { name: 'বাতিল', exact: true }).click();
  await leaveDialog.waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Switch language to English', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Retry attendance month', exact: true }).click();
  await page.getByRole('button', { name: 'Retry attendance month', exact: true }).waitFor({ state: 'detached' });
  if (await monthInput.getAttribute('value') !== process.env.HRIS_LOCAL_ATTENDANCE_CURRENT_MONTH) {
    throw new Error(`Current organization month was not selected: ${await monthInput.getAttribute('value')}.`);
  }
  if (await monthInput.getAttribute('max') !== process.env.HRIS_LOCAL_ATTENDANCE_CURRENT_MONTH) {
    throw new Error(`Month selector did not cap future months: max=${await monthInput.getAttribute('max')}.`);
  }

  await monthInput.fill(process.env.HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH);
  await page.getByRole('img', { name: /Recorded work hours for .* by week/ }).waitFor({ state: 'visible' });
  await page.locator('[title="8.0 recorded hours"]').waitFor({ state: 'visible' });
  const previousMonth = process.env.HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH;
  const weekBuckets = page.locator('[data-work-hours-week]');
  if (await weekBuckets.count() !== 5) throw new Error('The synthetic previous month must render all five weekly buckets.');
  const chartRows = await weekBuckets.evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().top)));
  if (new Set(chartRows).size !== 1) throw new Error(`The five weekly chart bars wrapped into multiple mobile rows: ${JSON.stringify(chartRows)}.`);
  const [year, month] = previousMonth.split('-').map(Number);
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  await page.getByRole('button', { name: 'Check-in times', exact: true }).click();
  await page.getByRole('heading', { name: `Check-in history · ${label}`, exact: true }).waitFor({ state: 'visible' });
  const history = page.locator('ul.divide-y').filter({ hasText: 'present' });
  await history.waitFor({ state: 'visible' });
  if (!(await history.innerText()).includes('10')) throw new Error('Persisted prior-month attendance date was not rendered in history.');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Working hours', exact: true }).click();
  await page.locator('[title="8.0 recorded hours"]').waitFor({ state: 'visible' });
  const weekCount = Math.ceil(new Date(Date.UTC(Number(previousMonth.slice(0, 4)), Number(previousMonth.slice(5, 7)), 0)).getUTCDate() / 7);
  const weeklyTable = page.getByRole('table', { name: 'Weekly work-hours data', exact: true });
  await weeklyTable.waitFor({ state: 'visible' });
  if (await weeklyTable.locator('tbody tr').count() !== weekCount) {
    throw new Error(`Accessible English weekly attendance rows did not match the selected month (${weekCount} weeks).`);
  }
  if (!(await weeklyTable.innerText()).includes('8.0 hr') || !(await weeklyTable.innerText()).includes('1')) {
    throw new Error('Accessible English weekly attendance did not expose the persisted hours and complete-pair count.');
  }
  await page.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  const bengaliWeeklyTable = page.getByRole('table', { name: 'সাপ্তাহিক কাজের সময়ের তথ্য', exact: true });
  await bengaliWeeklyTable.waitFor({ state: 'visible' });
  await bengaliWeeklyTable.getByRole('columnheader', { name: 'সপ্তাহ', exact: true }).waitFor({ state: 'visible' });
  await bengaliWeeklyTable.getByRole('columnheader', { name: 'নথিভুক্ত কাজের সময়', exact: true }).waitFor({ state: 'visible' });
  await bengaliWeeklyTable.getByRole('columnheader', { name: 'সম্পূর্ণ চেক-ইন জোড়া', exact: true }).waitFor({ state: 'visible' });
  if (await bengaliWeeklyTable.locator('tbody tr').count() !== weekCount) {
    throw new Error(`Accessible Bengali weekly attendance rows did not match the selected month (${weekCount} weeks).`);
  }
  await assertNoOverflow(page, 'Employee accessible weekly attendance Bengali mobile');
  await page.getByRole('button', { name: 'Switch language to English', exact: true }).click();
  await weeklyTable.waitFor({ state: 'visible' });

  await monthInput.fill(process.env.HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH);
  const emptyParts = process.env.HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH.split('-').map(Number);
  const emptyLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(emptyParts[0], emptyParts[1] - 1, 1)));
  await page.getByText(`No complete check-in and check-out pairs are available for ${emptyLabel}.`, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee attendance month mobile');

  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Employee attendance month desktop');
  await page.getByRole('button', { name: 'View digital employee ID', exact: true }).click();
  const desktopIdentityDialog = page.getByRole('dialog', { name: 'Digital employee ID', exact: true });
  await desktopIdentityDialog.locator('[data-employee-id-card]').waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee digital ID desktop');
  await desktopIdentityDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await desktopIdentityDialog.waitFor({ state: 'detached' });
  if (periodRequests.length < 5 || periodRequests.some(request => request.tenantId !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)) {
    throw new Error(`Attendance period RPC requests were missing or not tenant-bound: ${JSON.stringify(periodRequests)}.`);
  }
  if (!periodRequests.some(request => request.monthStart === `${process.env.HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH}-01`)
      || !periodRequests.some(request => request.monthStart === `${process.env.HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH}-01`)) {
    throw new Error(`Selected months were not requested: ${JSON.stringify(periodRequests)}.`);
  }
  if (directAttendanceTableRequests.length) {
    throw new Error(`Employee attendance history bypassed the secured period RPC: ${JSON.stringify(directAttendanceTableRequests)}.`);
  }
  if (identityCardRequests.length < 3 || identityCardRequests.some(requestedTenant => requestedTenant !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)) {
    throw new Error(`Employee identity-card RPC requests were missing or not tenant-bound: ${JSON.stringify(identityCardRequests)}.`);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  await page.getByRole('heading', { name: 'ব্যক্তিগত ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  if (await page.locator('html').getAttribute('lang') !== 'bn'
      || await page.evaluate(() => localStorage.getItem('synesis-hris-locale')) !== 'bn') {
    throw new Error('The employee dashboard did not persist Bengali locale state.');
  }
  await assertNoOverflow(page, 'Employee attendance month Bengali mobile');
  await page.reload();
  await page.getByRole('heading', { name: 'ব্যক্তিগত ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  if (await page.locator('html').getAttribute('lang') !== 'bn'
      || await page.evaluate(() => localStorage.getItem('synesis-hris-locale')) !== 'bn') {
    throw new Error('The employee dashboard lost Bengali locale after a full browser refresh.');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Employee attendance month Bengali desktop');
  await page.locator(`[data-upcoming-training-session="${process.env.HRIS_LOCAL_UPCOMING_TRAINING_SESSION_ID}"]`).waitFor({ state: 'visible' });
  console.log('EMPLOYEE_IDENTITY_CARD_BROWSER_ACCEPTANCE=PASS');
  console.log('EMPLOYEE_UPCOMING_TRAINING_BROWSER_ACCEPTANCE=PASS');
  console.log('EMPLOYEE_DASHBOARD_WORK_BROWSER_ACCEPTANCE=PASS');
  console.log('EMPLOYEE_DASHBOARD_ANNOUNCEMENTS_BROWSER_ACCEPTANCE=PASS');
  console.log('EMPLOYEE_DASHBOARD_PENDING_REQUESTS_BROWSER_ACCEPTANCE=PASS');
  console.log('EMPLOYEE_ROSTER_NOTIFICATION_BROWSER_ACCEPTANCE=PASS');
  console.log('Local Auth/Postgres employee dashboard journeys passed: quick access to attendance, leave, released payslips, employee profile and service-request history; audience-filtered recent announcements; task/goal recovery; upcoming confirmed training and appraisal deadlines; pending request retry and history routes; My Learning/My Performance navigation; English/Bengali; refresh and route recovery; own contact fields; tenant-bound reads; and 375px/1280px layouts.');
  console.log('EMPLOYEE_DASHBOARD_UPCOMING_REVIEWS_BROWSER_ACCEPTANCE=PASS');
} finally {
  await browser?.close();
  await stopChildProcess(server);
}
