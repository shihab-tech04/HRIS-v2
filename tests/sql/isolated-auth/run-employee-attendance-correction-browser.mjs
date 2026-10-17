// Verifies the employee-to-manager attendance-correction journey against the disposable Auth/Postgres stack.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_CORRECTION_EMPLOYEE_EMAIL', 'HRIS_LOCAL_CORRECTION_MANAGER_EMAIL',
  'HRIS_LOCAL_CORRECTION_OTHER_MANAGER_EMAIL',
  'HRIS_LOCAL_CORRECTION_TENANT_ID', 'HRIS_LOCAL_CORRECTION_DATE',
  'HRIS_LOCAL_CORRECTION_REASON_REJECT', 'HRIS_LOCAL_CORRECTION_REASON_APPROVE',
  'HRIS_LOCAL_CORRECTION_REJECTION_NOTE',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing isolated correction setting ${key}.`);

const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select a loopback port for attendance-correction acceptance.')));
      return;
    }
    probe.close(error => error ? reject(error) : resolvePort(String(address.port)));
  });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [resolve(process.cwd(), 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY,
  },
  stdio: 'ignore',
});

let browser;
let failFirstHistoryRead = false;
let failFirstRequest = true;
const submitted = [];
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server is starting */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error('Timed out waiting for the attendance-correction UI.');
}
async function signIn(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (email === process.env.HRIS_LOCAL_CORRECTION_EMPLOYEE_EMAIL) {
    await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  } else {
    await page.getByRole('navigation', { name: 'HRIS modules', exact: true }).waitFor({ state: 'visible' });
  }
}
async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(size)}.`);
}
function correctionResponse(page, status) {
  return page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_submit_attendance_correction')
    && response.status() === status);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employee = await browser.newPage({ viewport: { width: 375, height: 812 } });
  employee.on('request', request => {
    if (request.url().endsWith('/rest/v1/rpc/hris_employee_submit_attendance_correction') && request.method() === 'POST') {
      const payload = request.postDataJSON();
      submitted.push({ tenantId: payload?.p_tenant_id, reason: payload?.p_payload?.reason });
    }
  });
  await employee.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (failFirstHistoryRead && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
          && route.request().method() === 'POST') {
        failFirstHistoryRead = false;
        await new Promise(resolveWait => setTimeout(resolveWait, 150));
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic one-time attendance history outage.',
        }) });
        return;
      }
      if (failFirstRequest && url.pathname.endsWith('/rest/v1/rpc/hris_employee_submit_attendance_correction')
          && route.request().method() === 'POST'
          && route.request().postDataJSON()?.p_payload?.reason === process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT) {
        failFirstRequest = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic one-time correction outage.',
        }) });
        return;
      }
      return route.continue();
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  const dashboardHistory = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
    && response.status() === 200);
  await signIn(employee, process.env.HRIS_LOCAL_CORRECTION_EMPLOYEE_EMAIL);
  await dashboardHistory;
  const historyFailure = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
    && response.status() === 503);
  failFirstHistoryRead = true;
  await employee.getByRole('button', { name: 'Request a correction', exact: true }).click();
  const dialog = employee.getByRole('dialog', { name: 'Request attendance correction', exact: true });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('status').filter({ hasText: 'Loading attendance records' }).waitFor({ state: 'visible' });
  await historyFailure;
  await dialog.getByRole('alert').filter({ hasText: 'Unable to load attendance records for correction.' }).waitFor({ state: 'visible' });
  const historyRetry = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
    && response.status() === 200);
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await historyRetry;
  const emptyMonthRead = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
    && response.request().postDataJSON()?.p_month_start === '2000-01-01' && response.status() === 200);
  await dialog.getByLabel('Attendance month', { exact: true }).fill('2000-01');
  await emptyMonthRead;
  await dialog.getByRole('status').filter({ hasText: 'No attendance records are available for this month.' }).waitFor({ state: 'visible' });
  const currentMonthRead = employee.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
    && response.request().postDataJSON()?.p_month_start === `${process.env.HRIS_LOCAL_CORRECTION_DATE.slice(0, 7)}-01`
    && response.status() === 200);
  await dialog.getByLabel('Attendance month', { exact: true }).fill(process.env.HRIS_LOCAL_CORRECTION_DATE.slice(0, 7));
  await currentMonthRead;
  const correctionDate = dialog.getByLabel('Attendance date');
  await correctionDate.selectOption(process.env.HRIS_LOCAL_CORRECTION_DATE);
  await dialog.getByLabel('Reason', { exact: true }).fill(process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT);
  await dialog.getByRole('button', { name: 'Send request', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Enter at least one attendance field to correct.' }).waitFor({ state: 'visible' });
  if (submitted.length) throw new Error('An empty attendance correction reached the backend.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await employee.getByRole('button', { name: 'Request a correction', exact: true }).click();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByLabel('Attendance date').selectOption(process.env.HRIS_LOCAL_CORRECTION_DATE);
  if (await dialog.getByLabel('Reason', { exact: true }).inputValue() !== process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT) {
    throw new Error('Cancel and reopen discarded the employee correction draft.');
  }
  await dialog.getByLabel('Requested check-in', { exact: true }).fill('09:35');

  const rejectedFailure = correctionResponse(employee, 503);
  await dialog.getByRole('button', { name: 'Send request', exact: true }).click();
  await rejectedFailure;
  const outageAlert = dialog.getByRole('alert');
  await outageAlert.waitFor({ state: 'visible' });
  if (!(await outageAlert.innerText()).trim()
      || await dialog.getByLabel('Attendance date', { exact: true }).inputValue() !== process.env.HRIS_LOCAL_CORRECTION_DATE
      || await dialog.getByLabel('Requested check-in', { exact: true }).inputValue() !== '09:35'
      || await dialog.getByLabel('Reason', { exact: true }).inputValue() !== process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT) {
    throw new Error('Correction outage did not keep a recoverable alert and the entered request.');
  }
  const rejectedSubmit = correctionResponse(employee, 200);
  await dialog.getByRole('button', { name: 'Send request', exact: true }).click();
  const rejectedSubmitResponse = await rejectedSubmit;
  const rejectedId = await rejectedSubmitResponse.json();
  if (typeof rejectedId !== 'string') throw new Error('The employee retry did not return a persisted correction ID.');
  await dialog.waitFor({ state: 'detached' });
  const history = employee.getByRole('region', { name: 'Attendance correction history table', exact: true });
  const rejectedHistory = history.getByRole('row').filter({ hasText: process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT });
  await rejectedHistory.getByText('pending', { exact: true }).waitFor({ state: 'visible' });
  console.log('E06-01_SELECTED_EXISTING_ATTENDANCE_DATE_BROWSER_PASS');
  console.log('E06-02_REQUESTED_PUNCH_BROWSER_PASS');
  console.log('E06-03_REASON_BROWSER_PASS');
  console.log('E06-05_RETRY_SUBMISSION_BROWSER_PASS');
  console.log('E06-07_PENDING_STATUS_BROWSER_PASS');

  await employee.getByRole('button', { name: 'Request a correction', exact: true }).click();
  const approvalDialog = employee.getByRole('dialog', { name: 'Request attendance correction', exact: true });
  await approvalDialog.getByLabel('Attendance date', { exact: true }).selectOption(process.env.HRIS_LOCAL_CORRECTION_DATE);
  await approvalDialog.getByLabel('Requested check-in', { exact: true }).fill('09:45');
  await approvalDialog.getByLabel('Reason', { exact: true }).fill(process.env.HRIS_LOCAL_CORRECTION_REASON_APPROVE);
  const approvalSubmit = correctionResponse(employee, 200);
  await approvalDialog.getByRole('button', { name: 'Send request', exact: true }).click();
  const approvalSubmitResponse = await approvalSubmit;
  const approvedId = await approvalSubmitResponse.json();
  if (typeof approvedId !== 'string') throw new Error('The second correction did not return a persisted ID.');
  await approvalDialog.waitFor({ state: 'detached' });
  const approvalHistory = history.getByRole('row').filter({ hasText: process.env.HRIS_LOCAL_CORRECTION_REASON_APPROVE });
  await approvalHistory.getByText('pending', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Employee correction request 375px mobile');
  await employee.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  await employee.getByRole('heading', { name: 'আমার উপস্থিতি সংশোধনের আবেদন', exact: true }).waitFor({ state: 'visible' });
  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employee, 'Employee correction request Bengali desktop');
  await employee.getByRole('button', { name: 'সংশোধনের আবেদন করুন', exact: true }).click();
  const bengaliDialog = employee.getByRole('dialog', { name: 'উপস্থিতি সংশোধনের আবেদন', exact: true });
  await bengaliDialog.getByLabel('উপস্থিতির মাস', { exact: true }).waitFor({ state: 'visible' });
  await bengaliDialog.getByLabel('উপস্থিতির তারিখ', { exact: true }).waitFor({ state: 'visible' });
  await bengaliDialog.getByLabel('অনুরোধকৃত চেক-ইন', { exact: true }).waitFor({ state: 'visible' });
  await employee.keyboard.press('Escape');
  await bengaliDialog.waitFor({ state: 'detached' });
  console.log('E06-ATTENDANCE_CORRECTION_FORM_BENGALI_BROWSER_PASS');

  const otherManager = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(otherManager, process.env.HRIS_LOCAL_CORRECTION_OTHER_MANAGER_EMAIL);
  await otherManager.getByRole('button', { name: 'Attendance', exact: true }).click();
  await otherManager.getByRole('heading', { name: 'Attendance Report', exact: true }).waitFor({ state: 'visible' });
  if (await otherManager.getByText(process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT, { exact: true }).count()
      || await otherManager.getByText(process.env.HRIS_LOCAL_CORRECTION_REASON_APPROVE, { exact: true }).count()) {
    throw new Error('A manager in another tenant could read the synthetic attendance correction requests.');
  }
  await otherManager.close();

  const manager = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(manager, process.env.HRIS_LOCAL_CORRECTION_MANAGER_EMAIL);
  await manager.getByRole('button', { name: 'Attendance', exact: true }).click();
  await manager.getByRole('heading', { name: 'Attendance Report', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(manager, 'Manager attendance review desktop');
  const correctionSection = manager.getByRole('heading', { name: 'Attendance correction requests', exact: true }).locator('xpath=..');
  const rejectedManagerRow = correctionSection.getByRole('row').filter({ hasText: process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT });
  await rejectedManagerRow.getByRole('button', { name: 'Reject', exact: true }).click();
  const rejectDialog = manager.getByRole('dialog', { name: 'Reject attendance correction', exact: true });
  await rejectDialog.getByLabel('Decision note (optional)').fill(process.env.HRIS_LOCAL_CORRECTION_REJECTION_NOTE);
  const rejectedAttendanceRead = manager.waitForResponse(response => {
    if (!response.url().endsWith('/rest/v1/rpc/hris_get_tenant_attendance_data') || response.request().method() !== 'POST') return false;
    const body = response.request().postDataJSON();
    return body?.p_tenant_id === process.env.HRIS_LOCAL_CORRECTION_TENANT_ID && body?.p_report === false
      && body?.p_start <= process.env.HRIS_LOCAL_CORRECTION_DATE && body?.p_end >= process.env.HRIS_LOCAL_CORRECTION_DATE;
  });
  await rejectDialog.getByRole('button', { name: 'Reject correction', exact: true }).click();
  await manager.getByText('Attendance correction rejected.', { exact: true }).waitFor({ state: 'visible' });
  const rejectedAttendanceResponse = await rejectedAttendanceRead;
  const rejectedAttendanceData = await rejectedAttendanceResponse.json();
  const rejectedAttendanceRecord = rejectedAttendanceData?.records?.find(row => row.attendance_date === process.env.HRIS_LOCAL_CORRECTION_DATE);
  if (!rejectedAttendanceRecord || Date.parse(rejectedAttendanceRecord.check_in) !== Date.parse(`${process.env.HRIS_LOCAL_CORRECTION_DATE}T03:00:00Z`)
      || Date.parse(rejectedAttendanceRecord.check_out) !== Date.parse(`${process.env.HRIS_LOCAL_CORRECTION_DATE}T11:00:00Z`)) {
    throw new Error('Rejecting a correction changed the persisted attendance record.');
  }
  console.log('E06-09_REJECTION_PRESERVES_ATTENDANCE_BROWSER_PASS');

  const approvedManagerRow = correctionSection.getByRole('row').filter({ hasText: process.env.HRIS_LOCAL_CORRECTION_REASON_APPROVE });
  const approvedAttendanceRead = manager.waitForResponse(response => {
    if (!response.url().endsWith('/rest/v1/rpc/hris_get_tenant_attendance_data') || response.request().method() !== 'POST') return false;
    const body = response.request().postDataJSON();
    return body?.p_tenant_id === process.env.HRIS_LOCAL_CORRECTION_TENANT_ID && body?.p_report === false
      && body?.p_start <= process.env.HRIS_LOCAL_CORRECTION_DATE && body?.p_end >= process.env.HRIS_LOCAL_CORRECTION_DATE;
  });
  await approvedManagerRow.getByRole('button', { name: 'Approve', exact: true }).click();
  await manager.getByText('Attendance correction approved.', { exact: true }).waitFor({ state: 'visible' });
  const approvedAttendanceResponse = await approvedAttendanceRead;
  const approvedAttendanceData = await approvedAttendanceResponse.json();
  const approvedAttendanceRecord = approvedAttendanceData?.records?.find(row => row.attendance_date === process.env.HRIS_LOCAL_CORRECTION_DATE);
  if (!approvedAttendanceRecord || Date.parse(approvedAttendanceRecord.check_in) !== Date.parse(`${process.env.HRIS_LOCAL_CORRECTION_DATE}T03:45:00Z`)
      || Date.parse(approvedAttendanceRecord.check_out) !== Date.parse(`${process.env.HRIS_LOCAL_CORRECTION_DATE}T11:00:00Z`)
      || approvedAttendanceRecord.work_mode !== 'office') {
    throw new Error('Approved correction did not update only the requested punch while preserving the other persisted fields.');
  }
  console.log('E06-09_APPROVAL_UPDATES_REQUESTED_ATTENDANCE_BROWSER_PASS');

  await employee.reload();
  await employee.getByRole('heading', { name: 'ব্যক্তিগত ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  const recoveredHistory = employee.getByRole('region', { name: 'উপস্থিতি সংশোধনের ইতিহাসের তালিকা', exact: true });
  const rejectedRecoveredRow = recoveredHistory.getByRole('row').filter({ hasText: process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT });
  await rejectedRecoveredRow.getByText('প্রত্যাখ্যাত', { exact: true }).waitFor({ state: 'visible' });
  await rejectedRecoveredRow.getByText(process.env.HRIS_LOCAL_CORRECTION_REJECTION_NOTE, { exact: true }).waitFor({ state: 'visible' });
  const approvedRecoveredRow = recoveredHistory.getByRole('row').filter({ hasText: process.env.HRIS_LOCAL_CORRECTION_REASON_APPROVE });
  await approvedRecoveredRow.getByText('অনুমোদিত', { exact: true }).waitFor({ state: 'visible' });
  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employee, 'Employee correction history Bengali desktop');
  await employee.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(employee, 'Employee correction history Bengali mobile');
  const expectedSubmissions = [
    process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT,
    process.env.HRIS_LOCAL_CORRECTION_REASON_REJECT,
    process.env.HRIS_LOCAL_CORRECTION_REASON_APPROVE,
  ];
  if (submitted.length !== expectedSubmissions.length
      || submitted.some((request, index) => request.tenantId !== process.env.HRIS_LOCAL_CORRECTION_TENANT_ID
        || request.reason !== expectedSubmissions[index])) {
    throw new Error(`Attendance correction submissions were not bound to the active tenant and expected retry sequence: ${JSON.stringify(submitted)}.`);
  }
  await manager.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(manager, 'Manager correction review mobile');
  console.log('E06-08_REJECTION_REASON_BENGALI_REFRESH_BROWSER_PASS');
  console.log('E06-CORRECTION_FORM_EMPTY_RETRY_CANCEL_AND_ENROLLMENT_SCOPE_BROWSER_PASS');
  console.log('E06-ATTENDANCE_CORRECTION_BROWSER_ACCEPTANCE=PASS');
  console.log(JSON.stringify({ rejectedId, approvedId, submittedAttempts: submitted,
    localeAfterRefresh: await employee.locator('html').getAttribute('lang') }));
} finally {
  await browser?.close();
  await stopChildProcess(server);
}
