// Exercises the structured employee WFH request through local Auth/Postgres,
// then checks manager approval, employee history, and scheduled attendance.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_SERVICE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_SERVICE_MANAGER_EMAIL',
  'HRIS_LOCAL_WFH_DATE', 'HRIS_LOCAL_WFH_CANCEL_DATE',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48382';
const origin = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: repo,
  env: { ...process.env, VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY },
  stdio: 'ignore',
});
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function isolateExternalRequests(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
}

async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(size)}.`);
}

function requestStatusBadge(card, label) {
  return card.locator('span.rounded-full').getByText(label, { exact: true });
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employee = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await isolateExternalRequests(employee);
  await employee.goto(origin);
  await employee.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_SERVICE_EMPLOYEE_EMAIL);
  await employee.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await employee.getByRole('button', { name: 'Sign in', exact: true }).click();
  await employee.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const employeeNav = employee.getByRole('navigation', { name: 'HRIS modules' });
  await employee.getByRole('button', { name: 'Open navigation menu' }).click();
  await employeeNav.getByRole('button', { name: 'My Requests', exact: true }).click();
  await employee.getByRole('heading', { name: 'My Service Requests', exact: true }).waitFor({ state: 'visible' });

  await employee.getByLabel('Request type', { exact: true }).selectOption('work_from_home');
  await employee.getByLabel('From date', { exact: true }).fill(process.env.HRIS_LOCAL_WFH_DATE);
  await employee.getByLabel('To date', { exact: true }).fill(process.env.HRIS_LOCAL_WFH_DATE);
  await employee.getByLabel('Start time', { exact: true }).fill('09:00');
  await employee.getByLabel('End time', { exact: true }).fill('17:00');
  await employee.getByLabel('Task list', { exact: true }).fill('Review local acceptance files\nPrepare the weekly report');
  await employee.getByLabel('Work location (optional)', { exact: true }).fill('Dhaka home office');
  await employee.getByLabel('Reason', { exact: true }).fill('Synthetic WFH browser acceptance request.');
  const firstSubmit = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_submit_my_work_from_home_request')
    && response.request().method() === 'POST');
  await employee.getByRole('button', { name: 'Submit request', exact: true }).click();
  const firstResponse = await firstSubmit;
  const saved = await firstResponse.json();
  if (!firstResponse.ok() || !saved?.id || saved.status !== 'pending'
      || saved.request_data?.start_time !== '09:00:00'
      || saved.request_data?.tasks?.length !== 2
      || saved.request_data?.location !== 'Dhaka home office') {
    throw new Error(`Structured WFH submission did not persist: ${JSON.stringify(saved)}.`);
  }
  const card = employee.locator(`[data-service-request="${saved.id}"]`);
  await card.getByText('Review local acceptance files', { exact: true }).waitFor({ state: 'visible' });
  await requestStatusBadge(card, 'Pending').waitFor({ state: 'visible' });
  const employeeListRefresh = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_service_requests')
    && response.request().method() === 'POST');
  await employee.getByRole('button', { name: 'Refresh my service requests', exact: true }).click();
  const employeeListResponse = await employeeListRefresh;
  const employeeListData = await employeeListResponse.json();
  const refreshedRequest = employeeListData?.requests?.find(request => request.id === saved.id);
  if (!employeeListResponse.ok() || refreshedRequest?.request_data?.location !== 'Dhaka home office') {
    throw new Error(`WFH employee history did not return the persisted location: ${JSON.stringify({
      status: employeeListResponse.status(), request: refreshedRequest, response: employeeListData,
    })}.`);
  }
  const refreshedCardText = await card.innerText();
  if (!refreshedCardText.includes('Dhaka home office')) {
    throw new Error(`WFH employee history data was returned but not rendered: ${JSON.stringify({ request: refreshedRequest, cardText: refreshedCardText })}.`);
  }
  await card.getByText('Dhaka home office', { exact: false }).waitFor({ state: 'visible' });

  await employee.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  await employee.getByRole('heading', { name: 'আমার পরিষেবা অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  await card.getByRole('button', { name: 'অনুরোধ সম্পাদনা করুন', exact: true }).click();
  await card.getByLabel('শুরুর সময়', { exact: true }).fill('10:00');
  await card.getByLabel('শেষ সময়', { exact: true }).fill('18:00');
  await card.getByLabel('কাজের তালিকা', { exact: true }).fill('Review local acceptance files\nPrepare the weekly report\nJoin team planning');
  await card.getByLabel('কাজের স্থান (ঐচ্ছিক)', { exact: true }).fill('Updated Dhaka home office');
  await card.getByLabel('কারণ', { exact: true }).fill('Updated synthetic WFH browser acceptance request.');
  const editResponsePromise = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_update_my_work_from_home_request')
    && response.request().method() === 'POST');
  await card.getByRole('button', { name: 'পরিবর্তন সংরক্ষণ করুন', exact: true }).click();
  const editResponse = await editResponsePromise;
  const updated = await editResponse.json();
  if (!editResponse.ok() || updated?.request_data?.start_time !== '10:00:00'
      || updated?.request_data?.tasks?.length !== 3) {
    throw new Error(`Pending WFH edit did not persist: ${JSON.stringify(updated)}.`);
  }
  await card.getByText('Updated Dhaka home office', { exact: false }).waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Bengali WFH employee mobile');

  await employee.getByLabel('শুরুর তারিখ', { exact: true }).fill(process.env.HRIS_LOCAL_WFH_CANCEL_DATE);
  await employee.getByLabel('শেষ তারিখ', { exact: true }).fill(process.env.HRIS_LOCAL_WFH_CANCEL_DATE);
  await employee.getByLabel('শুরুর সময়', { exact: true }).fill('08:30');
  await employee.getByLabel('শেষ সময়', { exact: true }).fill('16:30');
  await employee.getByLabel('কাজের তালিকা', { exact: true }).fill('Update project notes');
  await employee.getByLabel('কাজের স্থান (ঐচ্ছিক)', { exact: true }).fill('Dhaka');
  await employee.getByLabel('কারণ', { exact: true }).fill('Synthetic request for cancellation acceptance.');
  const cancelDraftResponsePromise = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_submit_my_work_from_home_request')
    && response.request().method() === 'POST');
  await employee.getByRole('button', { name: 'অনুরোধ জমা দিন', exact: true }).click();
  const cancelDraftResponse = await cancelDraftResponsePromise;
  const cancelDraft = await cancelDraftResponse.json();
  if (!cancelDraftResponse.ok() || !cancelDraft?.id || cancelDraft.id === saved.id) {
    throw new Error(`Second WFH request did not persist: ${JSON.stringify(cancelDraft)}.`);
  }
  const cancelCard = employee.locator(`[data-service-request="${cancelDraft.id}"]`);
  await cancelCard.getByRole('button', { name: 'অনুরোধ বাতিল করুন', exact: true }).click();
  await cancelCard.getByRole('group', { name: 'বাতিল নিশ্চিত করুন', exact: true }).getByText('এই অপেক্ষমাণ বাসা থেকে কাজের অনুরোধটি বাতিল করবেন?', { exact: true }).waitFor({ state: 'visible' });
  const cancellationPromise = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_cancel_my_work_from_home_request')
    && response.request().method() === 'POST');
  await cancelCard.getByRole('button', { name: 'বাতিল নিশ্চিত করুন', exact: true }).click();
  const cancellationResponse = await cancellationPromise;
  const cancelled = await cancellationResponse.json();
  if (!cancellationResponse.ok() || cancelled?.status !== 'cancelled') {
    throw new Error(`Pending WFH cancellation did not persist: ${JSON.stringify(cancelled)}.`);
  }
  await requestStatusBadge(cancelCard, 'বাতিল').waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'Switch language to English', exact: true }).click();
  await employee.getByRole('heading', { name: 'My Service Requests', exact: true }).waitFor({ state: 'visible' });
  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employee, 'English WFH employee desktop');

  const manager = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await isolateExternalRequests(manager);
  await manager.goto(origin);
  await manager.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_SERVICE_MANAGER_EMAIL);
  await manager.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await manager.getByRole('button', { name: 'Sign in', exact: true }).click();
  await manager.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const managerNav = manager.getByRole('navigation', { name: 'HRIS modules' });
  await manager.getByRole('button', { name: 'Open navigation menu' }).click();
  await managerNav.getByRole('button', { name: 'Service Requests', exact: true }).click();
  await manager.getByRole('heading', { name: 'Service Requests', exact: true }).waitFor({ state: 'visible' });
  const managerCard = manager.locator(`[data-service-request="${saved.id}"]`);
  await managerCard.getByText('Updated Dhaka home office', { exact: false }).waitFor({ state: 'visible' });
  await managerCard.getByText('Join team planning', { exact: true }).waitFor({ state: 'visible' });
  await managerCard.getByRole('button', { name: 'Approve Work From Home', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(manager, 'WFH manager mobile');
  await manager.setViewportSize({ width: 1280, height: 900 });
  const approvalPromise = manager.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_resolve_tenant_work_from_home_request')
    && response.request().method() === 'POST');
  await managerCard.getByRole('button', { name: 'Approve Work From Home', exact: true }).click();
  const approvalResponse = await approvalPromise;
  const approval = await approvalResponse.json();
  if (!approvalResponse.ok() || approval?.status !== 'approved') {
    throw new Error(`Manager approval did not persist: ${JSON.stringify(approval)}.`);
  }
  await requestStatusBadge(managerCard, 'Approved').waitFor({ state: 'visible' });
  await manager.getByRole('status').getByText('The Work From Home request was approved and added to attendance.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(manager, 'WFH manager desktop');

  await employee.getByRole('button', { name: 'Refresh my service requests', exact: true }).click();
  await requestStatusBadge(card, 'Approved').waitFor({ state: 'visible' });
  const monthAttendancePromise = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
    && response.request().method() === 'POST');
  await employee.setViewportSize({ width: 375, height: 812 });
  await employee.getByRole('button', { name: 'Open navigation menu' }).click();
  await employee.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'My Overview', exact: true }).click();
  await employee.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  const monthAttendanceResponse = await monthAttendancePromise;
  const attendanceData = await monthAttendanceResponse.json();
  const scheduled = attendanceData?.records?.find(row => row.work_from_home_request_id === saved.id);
  if (!monthAttendanceResponse.ok() || scheduled?.status !== 'scheduled' || scheduled?.work_mode !== 'home'
      || scheduled?.check_in !== null || scheduled?.check_out !== null) {
    throw new Error(`Approved WFH was not returned as a scheduled attendance row: ${JSON.stringify(scheduled)}.`);
  }
  await employee.getByText('Scheduled', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'WFH attendance mobile');
  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employee, 'WFH attendance desktop');

  console.log(`WORK_FROM_HOME_ACCEPTANCE_ID=${saved.id}`);
  console.log(`WORK_FROM_HOME_CANCELLED_ID=${cancelDraft.id}`);
  console.log('Local employee submission, structured edit, pending cancellation, manager approval, EN/BN layouts, history refresh, and scheduled attendance persisted.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
