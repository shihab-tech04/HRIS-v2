// Verify the real employee submission/evidence and manager decision journey
// against the disposable local Auth, Postgres, RPC, and private Storage stack.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_LEAVE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_LEAVE_MANAGER_EMAIL',
  'HRIS_LOCAL_LEAVE_TENANT_ID', 'HRIS_LOCAL_LEAVE_EMPLOYEE_ID',
  'HRIS_LOCAL_LEAVE_REQUEST_ID', 'HRIS_LOCAL_LEAVE_EVIDENCE_PATH',
  'HRIS_LOCAL_LEAVE_REQUEST_REASON', 'HRIS_LOCAL_LEAVE_HISTORY_YEAR',
  'HRIS_LOCAL_LEAVE_REJECTION_NOTE', 'HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const apiUrl = new URL(process.env.HRIS_LOCAL_SUPABASE_URL);
const expectedApiPort = process.env.HRIS_SUPABASE_API_PORT || '55421';
if (apiUrl.hostname !== '127.0.0.1' || apiUrl.port !== expectedApiPort) {
  throw new Error(`Refusing the leave-evidence browser journey: expected isolated local Supabase API port ${expectedApiPort}.`);
}
const evidenceParts = process.env.HRIS_LOCAL_LEAVE_EVIDENCE_PATH.split('/');
if (evidenceParts.length !== 3
    || evidenceParts[0] !== process.env.HRIS_LOCAL_LEAVE_EMPLOYEE_ID
    || evidenceParts[1] !== process.env.HRIS_LOCAL_LEAVE_TENANT_ID) {
  throw new Error('Refusing the leave-evidence browser journey: the test object path is not owner and tenant scoped.');
}

const repo = process.cwd();
const port = '48380';
const origin = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
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
    } catch { /* Vite is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function routeOnlyLocalServices(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    return route.abort();
  });
}

async function signIn(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if ((await page.evaluate(() => window.innerWidth)) < 1024) {
    await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  } else {
    await page.getByRole('navigation', { name: 'HRIS modules' }).waitFor({ state: 'visible' });
  }
}

async function navigateTo(page, label) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: label, exact: true }).click();
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

async function assertDownloadedEvidence(page, download, expectedPrefix, expectedContent = 'isolated synthetic evidence') {
  if (!download.suggestedFilename().startsWith(expectedPrefix)) {
    throw new Error(`Unexpected evidence filename: ${download.suggestedFilename()}.`);
  }
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('The downloaded evidence file was not materialized locally.');
  const bytes = await readFile(downloadedPath);
  if (!bytes.includes(Buffer.from(expectedContent))) {
    throw new Error('Downloaded evidence did not contain the isolated Storage object bytes.');
  }
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const employeeContext = await browser.newContext({ viewport: { width: 375, height: 812 }, acceptDownloads: true });
  await routeOnlyLocalServices(employeeContext);
  const employee = await employeeContext.newPage();
  await signIn(employee, process.env.HRIS_LOCAL_LEAVE_EMPLOYEE_EMAIL);
  await navigateTo(employee, 'My Leave');
  await employee.getByRole('heading', { name: 'Personal leave' }).waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(employee, 'Employee personal leave mobile');
  const history = employee.getByRole('table', {
    name: `Personal leave history for ${process.env.HRIS_LOCAL_LEAVE_HISTORY_YEAR}`,
  });
  const ownRow = history.getByRole('row', { name: new RegExp(process.env.HRIS_LOCAL_LEAVE_REQUEST_REASON) });
  await ownRow.waitFor({ state: 'visible' });
  await ownRow.getByRole('button', { name: 'Download evidence' }).waitFor({ state: 'visible' });

  const uiEvidenceReason = 'Real employee UI leave evidence request';
  await employee.getByRole('button', { name: 'Request for leave', exact: true }).click();
  const requestDialog = employee.getByRole('dialog', { name: 'Request for leave' });
  await requestDialog.waitFor({ state: 'visible' });
  await requestDialog.getByLabel('Leave type').selectOption({ label: 'Synthetic evidence-required leave' });
  await requestDialog.locator('#personal-leave-from').fill('2026-10-20');
  await requestDialog.locator('#personal-leave-to').fill('2026-10-20');
  await requestDialog.getByLabel('Reason').fill(uiEvidenceReason);
  await requestDialog.locator('#personal-leave-evidence').setInputFiles({
    name: 'employee-ui-leave-evidence.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nreal employee UI evidence bytes\n'),
  });
  const uiEvidenceUpload = employee.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.includes('/storage/v1/object/leave-evidence/'),
  { timeout: 10000 });
  const uiLeaveSubmission = employee.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/hris_employee_submit_leave_request'),
  { timeout: 10000 });
  await requestDialog.getByRole('button', { name: 'Send request', exact: true }).click();
  const [uploadedResponse, submittedResponse] = await Promise.all([uiEvidenceUpload, uiLeaveSubmission]);
  if (!uploadedResponse.ok()) throw new Error(`Employee UI evidence upload returned ${uploadedResponse.status()}.`);
  if (!submittedResponse.ok()) throw new Error(`Employee UI leave submission returned ${submittedResponse.status()}.`);
  const uiLeaveRequestValue = await submittedResponse.json();
  const uiLeaveRequestId = typeof uiLeaveRequestValue === 'string' ? uiLeaveRequestValue : uiLeaveRequestValue?.id;
  const uiEvidencePath = decodeURIComponent(new URL(uploadedResponse.url()).pathname.split('/storage/v1/object/leave-evidence/')[1] || '');
  const submittedPayload = submittedResponse.request().postDataJSON();
  console.log(`LEAVE_UI_REQUEST_ACCEPTANCE=${JSON.stringify({ id: uiLeaveRequestId, path: uiEvidencePath, reason: uiEvidenceReason })}`);
  if (!uiLeaveRequestId || !uiEvidencePath.startsWith(`${process.env.HRIS_LOCAL_LEAVE_EMPLOYEE_ID}/${process.env.HRIS_LOCAL_LEAVE_TENANT_ID}/`)
      || submittedPayload?.p_tenant_id !== process.env.HRIS_LOCAL_LEAVE_TENANT_ID
      || submittedPayload?.p_payload?.attachment_url !== uiEvidencePath
      || submittedPayload?.p_payload?.reason !== uiEvidenceReason
      || submittedPayload?.p_payload?.from_date !== '2026-10-20') {
    throw new Error('Employee UI submission did not persist the selected tenant, reason, date, and owner-scoped evidence path.');
  }
  await employee.getByRole('status').filter({ hasText: 'Leave request submitted.' }).waitFor({ state: 'visible' });
  const uiHistoryRow = history.getByRole('row', { name: new RegExp(uiEvidenceReason) });
  await uiHistoryRow.waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'Request for leave', exact: true }).click();
  const reopenedRequestDialog = employee.getByRole('dialog', { name: 'Request for leave' });
  await reopenedRequestDialog.waitFor({ state: 'visible' });
  const evidenceInputReset = await reopenedRequestDialog.locator('#personal-leave-evidence')
    .evaluate(input => input.value === '' && input.files?.length === 0);
  await reopenedRequestDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (!evidenceInputReset) throw new Error('The employee evidence input was not reset after the real UI submission.');

  const employeeUiStorageResponse = employee.waitForResponse(response =>
    response.request().method() === 'GET'
      && decodeURIComponent(new URL(response.url()).pathname).includes(`/storage/v1/object/leave-evidence/${uiEvidencePath}`),
  { timeout: 10000 });
  const employeeUiDownload = employee.waitForEvent('download');
  await uiHistoryRow.getByRole('button', { name: 'Download evidence' }).click();
  const [employeeUiResponse, employeeUiFile] = await Promise.all([employeeUiStorageResponse, employeeUiDownload]);
  if (!employeeUiResponse.ok()) throw new Error(`Employee UI evidence download returned ${employeeUiResponse.status()}.`);
  await assertDownloadedEvidence(employee, employeeUiFile, `personal-leave-evidence-${uiLeaveRequestId.slice(0, 8)}`, 'real employee UI evidence bytes');

  const employeeStorageResponse = employee.waitForResponse(response =>
    response.request().method() === 'GET' && response.url().includes('/storage/v1/object/leave-evidence/'), { timeout: 10000 })
    .catch(async cause => {
      const alerts = await employee.getByRole('alert').allTextContents();
      throw new Error(`Employee UI made no private Storage request; alerts: ${alerts.join(' | ') || '(none)'}. ${cause.message}`);
    });
  const employeeDownload = employee.waitForEvent('download');
  await ownRow.getByRole('button', { name: 'Download evidence' }).click();
  const [employeeResponse, employeeFile] = await Promise.all([employeeStorageResponse, employeeDownload]);
  if (!employeeResponse.ok()) throw new Error(`Employee Storage download returned ${employeeResponse.status()}.`);
  if (!decodeURIComponent(new URL(employeeResponse.url()).pathname).includes(process.env.HRIS_LOCAL_LEAVE_EVIDENCE_PATH)) {
    throw new Error('Employee browser downloaded a different leave-evidence object than the request references.');
  }
  await assertDownloadedEvidence(employee, employeeFile, `personal-leave-evidence-${process.env.HRIS_LOCAL_LEAVE_REQUEST_ID.slice(0, 8)}`);
  await employee.getByRole('status').filter({ hasText: 'Evidence downloaded.' }).waitFor({ state: 'visible' });
  await employeeContext.close();

  const managerContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await routeOnlyLocalServices(managerContext);
  const manager = await managerContext.newPage();
  await signIn(manager, process.env.HRIS_LOCAL_LEAVE_MANAGER_EMAIL);
  await navigateTo(manager, 'Leave');
  await manager.getByRole('heading', { name: 'Leave Requests' }).waitFor({ state: 'visible' });
  const leaveTable = manager.getByRole('table', { name: 'Leave requests' });
  await leaveTable.waitFor({ state: 'visible', timeout: 10000 }).catch(async cause => {
    const pageText = await manager.locator('body').innerText().catch(() => '');
    throw new Error(`Manager leave table did not load. Page: ${pageText.slice(-1800)}. ${cause.message}`);
  });
  const managerRows = await leaveTable.locator('tbody tr').allInnerTexts();
  const managerRow = leaveTable.getByRole('row', { name: /Synthetic Employee A.*Synthetic evidence-required leave.*2026-10-19/ });
  await managerRow.waitFor({ state: 'visible', timeout: 5000 }).catch(async cause => {
    throw new Error(`Evidence request missing from manager queue. Rows: ${JSON.stringify(managerRows)}. ${cause.message}`);
  });
  const uiManagerRow = leaveTable.getByRole('row', { name: /Synthetic Employee A.*Synthetic evidence-required leave.*2026-10-20/ });
  await uiManagerRow.waitFor({ state: 'visible', timeout: 5000 });
  const managerStorageResponse = manager.waitForResponse(response =>
    response.request().method() === 'GET' && response.url().includes('/storage/v1/object/leave-evidence/'), { timeout: 10000 })
    .catch(async cause => {
      const alerts = await manager.getByRole('alert').allTextContents();
      throw new Error(`Manager UI made no private Storage request; alerts: ${alerts.join(' | ') || '(none)'}. ${cause.message}`);
    });
  const managerDownload = manager.waitForEvent('download');
  await managerRow.getByRole('button', { name: /Download evidence for Synthetic Employee A/ }).click();
  const [managerResponse, managerFile] = await Promise.all([managerStorageResponse, managerDownload]);
  if (!managerResponse.ok()) throw new Error(`Same-tenant manager Storage download returned ${managerResponse.status()}.`);
  if (!decodeURIComponent(new URL(managerResponse.url()).pathname).includes(process.env.HRIS_LOCAL_LEAVE_EVIDENCE_PATH)) {
    throw new Error('Manager browser downloaded a different leave-evidence object than the request references.');
  }
  await assertDownloadedEvidence(manager, managerFile, `leave-evidence-${process.env.HRIS_LOCAL_LEAVE_REQUEST_ID.slice(0, 8)}`);
  await manager.getByRole('status').filter({ hasText: 'Evidence downloaded.' }).waitFor({ state: 'visible' });

  const managerUiStorageResponse = manager.waitForResponse(response =>
    response.request().method() === 'GET'
      && decodeURIComponent(new URL(response.url()).pathname).includes(`/storage/v1/object/leave-evidence/${uiEvidencePath}`),
  { timeout: 10000 });
  const managerUiDownload = manager.waitForEvent('download');
  await uiManagerRow.getByRole('button', { name: /Download evidence for Synthetic Employee A/ }).click();
  const [managerUiResponse, managerUiFile] = await Promise.all([managerUiStorageResponse, managerUiDownload]);
  if (!managerUiResponse.ok()) throw new Error(`Same-tenant manager UI evidence download returned ${managerUiResponse.status()}.`);
  await assertDownloadedEvidence(manager, managerUiFile, `leave-evidence-${uiLeaveRequestId.slice(0, 8)}`, 'real employee UI evidence bytes');

  const approvalResponse = manager.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/admin_resolve_leave_request'),
  { timeout: 10000 });
  await managerRow.getByRole('button', { name: 'Approve', exact: true }).click();
  const resolved = await approvalResponse;
  if (!resolved.ok()) throw new Error(`Same-tenant manager approval returned ${resolved.status()}.`);
  await manager.getByRole('status').filter({ hasText: 'Leave request approved.' }).waitFor({ state: 'visible' });
  await managerRow.getByRole('cell').filter({ hasText: 'approved' }).waitFor({ state: 'visible' });

  const uiApprovalResponse = manager.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/admin_resolve_leave_request'),
  { timeout: 10000 });
  await uiManagerRow.getByRole('button', { name: 'Approve', exact: true }).click();
  const uiApproved = await uiApprovalResponse;
  if (!uiApproved.ok()) throw new Error(`Same-tenant manager approval of the employee UI request returned ${uiApproved.status()}.`);
  await manager.getByRole('status').filter({ hasText: 'Leave request approved.' }).waitFor({ state: 'visible' });
  await uiManagerRow.getByRole('cell').filter({ hasText: 'approved' }).waitFor({ state: 'visible' });

  const rejectionRow = leaveTable.getByRole('row', {
    name: /Synthetic Employee A.*Synthetic annual leave.*2026-10-22/,
  });
  await rejectionRow.waitFor({ state: 'visible' });
  await rejectionRow.getByRole('button', { name: 'Reject', exact: true }).click();
  const rejectionDialog = manager.getByRole('dialog', { name: 'Reject leave request' });
  await rejectionDialog.waitFor({ state: 'visible' });
  await rejectionDialog.getByLabel('Decision note (optional)').fill(process.env.HRIS_LOCAL_LEAVE_REJECTION_NOTE);
  const rejectionResponse = manager.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/admin_resolve_leave_request'),
  { timeout: 10000 });
  await rejectionDialog.getByRole('button', { name: 'Reject request', exact: true }).click();
  const rejected = await rejectionResponse;
  if (!rejected.ok()) throw new Error(`Same-tenant manager rejection returned ${rejected.status()}.`);
  await manager.getByRole('status').filter({ hasText: 'Leave request rejected.' }).waitFor({ state: 'visible' });
  await rejectionRow.getByRole('cell').filter({ hasText: 'rejected' }).waitFor({ state: 'visible' });
  await rejectionRow.getByText(`Decision note: ${process.env.HRIS_LOCAL_LEAVE_REJECTION_NOTE}`).waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(manager, 'Manager leave requests desktop');
  await managerContext.close();

  const refreshedEmployeeContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await routeOnlyLocalServices(refreshedEmployeeContext);
  const refreshedEmployee = await refreshedEmployeeContext.newPage();
  await signIn(refreshedEmployee, process.env.HRIS_LOCAL_LEAVE_EMPLOYEE_EMAIL);
  await navigateTo(refreshedEmployee, 'My Leave');
  await refreshedEmployee.getByRole('heading', { name: 'Personal leave' }).waitFor({ state: 'visible' });
  const refreshedHistory = refreshedEmployee.getByRole('table', {
    name: `Personal leave history for ${process.env.HRIS_LOCAL_LEAVE_HISTORY_YEAR}`,
  });
  const resolvedRequest = refreshedHistory.getByRole('row', {
    name: new RegExp(process.env.HRIS_LOCAL_LEAVE_REQUEST_REASON),
  });
  await resolvedRequest.waitFor({ state: 'visible' });
  if (!(await resolvedRequest.innerText()).toLocaleLowerCase().includes('approved')) {
    throw new Error('The employee did not see the manager approval after refreshing their leave history.');
  }
  const refreshedUiRequest = refreshedHistory.getByRole('row', { name: new RegExp(uiEvidenceReason) });
  await refreshedUiRequest.waitFor({ state: 'visible' });
  if (!(await refreshedUiRequest.innerText()).toLocaleLowerCase().includes('approved')) {
    throw new Error('The employee did not see the UI-created request approval after refreshing their leave history.');
  }
  await assertNoHorizontalOverflow(refreshedEmployee, 'Employee refreshed leave history mobile');
  const employeeRejectedRequest = refreshedHistory.getByRole('row', { name: /Synthetic UI rejection acceptance/ });
  await employeeRejectedRequest.waitFor({ state: 'visible' });
  const employeeRejectionText = (await employeeRejectedRequest.innerText()).toLocaleLowerCase();
  if (!employeeRejectionText.includes('rejected')
      || !employeeRejectionText.includes(process.env.HRIS_LOCAL_LEAVE_REJECTION_NOTE.toLocaleLowerCase())) {
    throw new Error('The employee did not see the manager rejection status and note after refreshing leave history.');
  }

  await navigateTo(refreshedEmployee, 'Notifications');
  const leaveApprovalCard = refreshedEmployee.locator(`[data-notification-source="leave_decision"][data-notification-kind="approved"][data-notification-request-id="${uiLeaveRequestId}"]`);
  await leaveApprovalCard.waitFor({ state: 'visible' });
  await refreshedEmployee.getByRole('button', { name: 'Refresh', exact: true }).click();
  await leaveApprovalCard.waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Leave decision notifications mobile');
  await refreshedEmployee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await refreshedEmployee.getByRole('heading', { name: 'ছুটির অনুরোধ অনুমোদিত' }).first().waitFor({ state: 'visible' });
  const bengaliApprovalCard = refreshedEmployee.locator(`[data-notification-source="leave_decision"][data-notification-kind="approved"][data-notification-request-id="${uiLeaveRequestId}"]`);
  await bengaliApprovalCard.getByRole('button', { name: 'ছুটির তথ্য খুলুন', exact: true }).click();
  await refreshedEmployee.getByRole('heading', { name: 'Personal leave' }).waitFor({ state: 'visible' });
  const focusedUiRequest = refreshedEmployee.locator(`[data-leave-request-id="${uiLeaveRequestId}"]`);
  await focusedUiRequest.waitFor({ state: 'visible' });
  await refreshedEmployee.waitForFunction(expectedId =>
    document.activeElement?.getAttribute('data-leave-request-id') === expectedId, uiLeaveRequestId);
  const focusedUiRequestId = await refreshedEmployee.evaluate(() => document.activeElement?.getAttribute('data-leave-request-id'));
  if (focusedUiRequestId !== uiLeaveRequestId) throw new Error('Opening the leave notification did not focus its matching request history row.');

  await refreshedEmployee.getByRole('button', { name: 'Switch language to English' }).click();
  await refreshedEmployee.setViewportSize({ width: 1280, height: 900 });
  await navigateTo(refreshedEmployee, 'Notifications');
  const leaveRejectionCard = refreshedEmployee.locator(`[data-notification-source="leave_decision"][data-notification-kind="rejected"][data-notification-request-id="${process.env.HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID}"]`);
  await leaveRejectionCard.waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Leave decision notifications desktop');
  await leaveRejectionCard.getByRole('button', { name: 'Open leave', exact: true }).click();
  await refreshedEmployee.getByRole('heading', { name: 'Personal leave' }).waitFor({ state: 'visible' });
  const focusedRejectedRequest = refreshedEmployee.locator(`[data-leave-request-id="${process.env.HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID}"]`);
  await focusedRejectedRequest.waitFor({ state: 'visible' });
  await refreshedEmployee.waitForFunction(expectedId =>
    document.activeElement?.getAttribute('data-leave-request-id') === expectedId,
  process.env.HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID);
  const focusedRejectedRequestId = await refreshedEmployee.evaluate(() => document.activeElement?.getAttribute('data-leave-request-id'));
  if (focusedRejectedRequestId !== process.env.HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID) {
    throw new Error('Opening the rejected leave notification did not focus its matching request history row.');
  }
  await refreshedEmployeeContext.close();

  console.log('Real local Auth/Postgres/Storage leave flow passed: employee UI submits proof-backed leave, employee and manager retrieve its private evidence, manager approves and rejects, refreshed employee history and owner-only decision notifications persist, Bengali and English notification actions return to the matching request on mobile and desktop.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
