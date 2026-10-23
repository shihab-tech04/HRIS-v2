// Verify the real employee submission/evidence and manager decision journey
// against the disposable local Auth, Postgres, RPC, and private Storage stack.
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_LEAVE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_LEAVE_MANAGER_EMAIL',
  'HRIS_LOCAL_LEAVE_TENANT_ID', 'HRIS_LOCAL_LEAVE_EMPLOYEE_ID',
  'HRIS_LOCAL_LEAVE_REQUEST_ID', 'HRIS_LOCAL_LEAVE_EVIDENCE_PATH',
  'HRIS_LOCAL_LEAVE_TYPES_JSON', 'HRIS_LOCAL_LEAVE_BALANCES_JSON',
  'HRIS_LOCAL_UNAVAILABLE_LEAVE_TYPES_JSON', 'HRIS_LOCAL_UNAVAILABLE_LEAVE_TYPE_ID',
  'HRIS_LOCAL_LEAVE_PREVIEW_HOLIDAY_DATE', 'HRIS_LOCAL_LEAVE_PREVIEW_WEEKEND_DATE',
  'HRIS_LOCAL_LEAVE_BALANCE_TYPE_ID', 'HRIS_LOCAL_LEAVE_BALANCE_AVAILABLE_DAYS',
  'HRIS_LOCAL_LEAVE_BALANCE_USED_DAYS',
  'HRIS_LOCAL_LEAVE_BALANCE_PENDING_DAYS',
  'HRIS_LOCAL_LEAVE_REQUEST_REASON', 'HRIS_LOCAL_LEAVE_HISTORY_YEAR',
  'HRIS_LOCAL_LEAVE_REJECTION_NOTE', 'HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID',
  'HRIS_LOCAL_DOCUMENT_TENANT_ID', 'HRIS_LOCAL_DOCUMENT_ID', 'HRIS_LOCAL_DOCUMENT_NAME',
  'HRIS_LOCAL_DOCUMENT_REJECTED_NAME', 'HRIS_LOCAL_DOCUMENT_REJECTION_REASON',
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
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select an available loopback port for the leave-evidence browser journey.')));
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
  stdio: ['ignore', 'ignore', 'pipe'],
});

let browser;
let serverStderr = '';
let serverSpawnError = '';
server.stderr.on('data', chunk => { serverStderr = `${serverStderr}${chunk.toString()}`.slice(-4000); });
server.on('error', error => { serverSpawnError = error.code || error.name || 'spawn_error'; });

function safeServerDiagnostic() {
  let diagnostic = serverStderr;
  for (const key of [
    'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
    'HRIS_LOCAL_LEAVE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_LEAVE_MANAGER_EMAIL',
  ]) {
    const secret = process.env[key];
    if (secret) diagnostic = diagnostic.replaceAll(secret, '[REDACTED]');
  }
  diagnostic = diagnostic
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:sb_secret|sb_publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
    .replace(/(authorization:\s*bearer\s+)\S+/gi, '$1[REDACTED]')
    .trim();
  return diagnostic.slice(-1000);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverSpawnError) throw new Error(`Local Vite server could not start (${serverSpawnError}).`);
    if (server.exitCode !== null) {
      const diagnostic = safeServerDiagnostic();
      throw new Error(`Local Vite server exited with ${server.exitCode}.${diagnostic ? ` Startup diagnostic: ${diagnostic}` : ''}`);
    }
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
  const personalLeaveSummary = employee.getByTestId('personal-leave-summary');
  await personalLeaveSummary.getByRole('heading', { name: 'Request time off', exact: true }).waitFor({ state: 'visible' });
  await personalLeaveSummary.getByRole('heading', { name: 'Available leave breakdown', exact: true }).waitFor({ state: 'visible' });
  const unavailableTypesData = JSON.parse(process.env.HRIS_LOCAL_UNAVAILABLE_LEAVE_TYPES_JSON);
  const unavailableType = unavailableTypesData.find(row => String(row.id) === process.env.HRIS_LOCAL_UNAVAILABLE_LEAVE_TYPE_ID);
  if (!unavailableType || unavailableType.availability_reason_code !== 'profile_eligibility') {
    throw new Error('The authenticated leave dashboard did not provide the expected profile-eligibility explanation.');
  }
  const unavailableTypesPanel = personalLeaveSummary.getByTestId('personal-leave-unavailable-types');
  const unavailableTypeCard = personalLeaveSummary.getByTestId(`personal-leave-unavailable-type-${process.env.HRIS_LOCAL_UNAVAILABLE_LEAVE_TYPE_ID}`);
  await unavailableTypesPanel.getByRole('heading', { name: 'Unavailable leave types', exact: true }).waitFor({ state: 'visible' });
  await unavailableTypeCard.getByText(unavailableType.name, { exact: true }).waitFor({ state: 'visible' });
  const unavailableReason = unavailableTypeCard.getByTestId('personal-leave-unavailability-reason');
  await unavailableReason.waitFor({ state: 'visible' });
  if (await unavailableReason.innerText() !== 'This leave type does not meet the eligibility requirements for your employee profile.') {
    throw new Error('The unavailable leave reason did not match the English eligibility explanation.');
  }
  const mobileSummaryColumns = await personalLeaveSummary.evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
  if (mobileSummaryColumns !== 1) throw new Error(`Personal leave summary mobile layout has ${mobileSummaryColumns} columns instead of one.`);
  const primaryHistoryBeforeCalendar = await employee.evaluate(() => {
    const historySection = document.querySelector('[data-testid="personal-leave-history"]');
    const calendarHeading = document.querySelector('#personal-leave-calendar-heading');
    return Boolean(historySection && calendarHeading
      && (historySection.compareDocumentPosition(calendarHeading) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  if (!primaryHistoryBeforeCalendar) throw new Error('Personal leave history should precede the calendar on the Figma-aligned page.');
  await employee.setViewportSize({ width: 1280, height: 900 });
  await unavailableReason.waitFor({ state: 'visible' });
  const personalLeaveSummaryColumns = await personalLeaveSummary.evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
  if (personalLeaveSummaryColumns !== 2) throw new Error(`Personal leave summary desktop layout has ${personalLeaveSummaryColumns} columns instead of two.`);
  await employee.setViewportSize({ width: 1920, height: 1080 });
  const requestSummaryPane = await personalLeaveSummary.locator(':scope > section[aria-labelledby="personal-leave-heading"]').boundingBox();
  const balanceSummaryPane = await personalLeaveSummary.locator(':scope > section[aria-labelledby="personal-leave-balance-heading"]').boundingBox();
  if (Math.abs((requestSummaryPane?.width ?? 0) - 358) >= 1
      || Math.abs((balanceSummaryPane?.x ?? 0) - ((requestSummaryPane?.x ?? 0) + (requestSummaryPane?.width ?? 0))) >= 1) {
    throw new Error(`Personal leave summary does not match Figma's 358px request panel at 1920px: ${JSON.stringify({ requestSummaryPane, balanceSummaryPane })}.`);
  }
  await employee.setViewportSize({ width: 375, height: 812 });
  const balanceDetail = personalLeaveSummary.getByTestId(`personal-leave-balance-${process.env.HRIS_LOCAL_LEAVE_BALANCE_TYPE_ID}`);
  const localizedBalance = (raw, locale) => Number(raw).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US');
  const availableBalance = balanceDetail.getByTestId('personal-leave-available-balance');
  await availableBalance.waitFor({ state: 'visible' });
  if (await availableBalance.innerText() !== localizedBalance(process.env.HRIS_LOCAL_LEAVE_BALANCE_AVAILABLE_DAYS, 'en')) {
    throw new Error('The personal leave page did not render the persisted available balance in English.');
  }
  await balanceDetail.getByText('Used', { exact: true }).waitFor({ state: 'visible' });
  await balanceDetail.getByText(`${localizedBalance(process.env.HRIS_LOCAL_LEAVE_BALANCE_USED_DAYS, 'en')} days`, { exact: true }).waitFor({ state: 'visible' });
  await balanceDetail.getByText('Pending', { exact: true }).waitFor({ state: 'visible' });
  await balanceDetail.getByText(`${localizedBalance(process.env.HRIS_LOCAL_LEAVE_BALANCE_PENDING_DAYS, 'en')} days`, { exact: true }).waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await unavailableTypesPanel.getByRole('heading', { name: 'যেসব ছুটির ধরন পাওয়া যাচ্ছে না', exact: true }).waitFor({ state: 'visible' });
  await unavailableReason.waitFor({ state: 'visible' });
  if (await unavailableReason.innerText() !== 'আপনার কর্মী প্রোফাইলের যোগ্যতার শর্তের সঙ্গে এই ছুটির ধরন মেলে না।') {
    throw new Error('The unavailable leave reason did not match the Bengali eligibility explanation.');
  }
  await balanceDetail.getByText('ব্যবহৃত', { exact: true }).waitFor({ state: 'visible' });
  await balanceDetail.getByText(`${localizedBalance(process.env.HRIS_LOCAL_LEAVE_BALANCE_USED_DAYS, 'bn')} দিন`, { exact: true }).waitFor({ state: 'visible' });
  await balanceDetail.getByText('অপেক্ষমাণ', { exact: true }).waitFor({ state: 'visible' });
  await balanceDetail.getByText(`${localizedBalance(process.env.HRIS_LOCAL_LEAVE_BALANCE_PENDING_DAYS, 'bn')} দিন`, { exact: true }).waitFor({ state: 'visible' });
  if (await availableBalance.innerText() !== localizedBalance(process.env.HRIS_LOCAL_LEAVE_BALANCE_AVAILABLE_DAYS, 'bn')) {
    throw new Error('The personal leave page did not render the persisted available balance in Bengali.');
  }
  await employee.getByRole('button', { name: 'Switch language to English' }).click();
  await employee.getByRole('heading', { name: 'Personal leave' }).waitFor({ state: 'visible' });
  await employee.reload();
  await navigateTo(employee, 'My Leave');
  await employee.getByRole('heading', { name: 'Personal leave' }).waitFor({ state: 'visible' });
  await employee.getByTestId(`personal-leave-unavailable-type-${process.env.HRIS_LOCAL_UNAVAILABLE_LEAVE_TYPE_ID}`)
    .getByText('This leave type does not meet the eligibility requirements for your employee profile.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(employee, 'Employee leave availability explanation mobile after refresh');
  console.log('LEAVE_BALANCE_DETAIL_BROWSER_ACCEPTANCE=PASS');
  console.log('Personal leave summary mobile and desktop layouts passed.');
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
  await requestDialog.getByText('After submission, an authorized leave manager in this organization reviews your request.', { exact: true })
    .waitFor({ state: 'visible' });
  const expectedLeaveTypeIds = JSON.parse(process.env.HRIS_LOCAL_LEAVE_TYPES_JSON).map(row => String(row.id)).sort();
  const actualLeaveTypeIds = (await requestDialog.locator('#personal-leave-type option').evaluateAll(options =>
    options.map(option => option.value).filter(Boolean))).sort();
  if (JSON.stringify(actualLeaveTypeIds) !== JSON.stringify(expectedLeaveTypeIds)) {
    throw new Error(`Employee leave-type options did not match the active employee-scoped contract: ${JSON.stringify({ actualLeaveTypeIds, expectedLeaveTypeIds })}.`);
  }
  if (actualLeaveTypeIds.includes(process.env.HRIS_LOCAL_UNAVAILABLE_LEAVE_TYPE_ID)) {
    throw new Error('An unavailable leave type appeared in the request form options.');
  }
  console.log('LEAVE_TYPES_VISIBLE_BROWSER_ACCEPTANCE=PASS');
  await requestDialog.getByLabel('Leave type').selectOption({ label: 'Synthetic evidence-required leave' });
  const selectedLeaveTypeId = await requestDialog.locator('#personal-leave-type').inputValue();
  const selectedLedgerBalance = JSON.parse(process.env.HRIS_LOCAL_LEAVE_BALANCES_JSON)
    .find(row => String(row.leave_type_id) === selectedLeaveTypeId);
  if (!selectedLedgerBalance || !Number.isFinite(Number(selectedLedgerBalance.available_days))) {
    throw new Error('The real employee leave form has no persisted selected-type balance for its pre-submission check.');
  }
  const previewValue = requestDialog.getByTestId('leave-request-days-preview-value');
  const setPreviewDate = async date => {
    await requestDialog.locator('#personal-leave-from').fill(date);
    await requestDialog.locator('#personal-leave-to').fill(date);
  };
  // The preview is derived from asynchronous Auth/RPC leave-policy data.
  // Wait for the exact calculation instead of capturing the prior render.
  // A wrong final value still fails closed within a bounded timeout.
  const settledPreviewDays = async (expected, context) => {
    try {
      await expect.poll(async () => Number(await previewValue.innerText()), {
        message: context, timeout: 7000,
      }).toBe(expected);
    } catch {
      throw new Error(`${context}: ${Number(await previewValue.innerText())}.`);
    }
    return Number(await previewValue.innerText());
  };
  await setPreviewDate(process.env.HRIS_LOCAL_LEAVE_PREVIEW_HOLIDAY_DATE);
  const holidayDays = await settledPreviewDays(0, 'Tenant-wide weekday holiday was not excluded from the leave preview');
  await setPreviewDate(process.env.HRIS_LOCAL_LEAVE_PREVIEW_WEEKEND_DATE);
  const weekendDays = await settledPreviewDays(0, 'The employee weekly-off day was not excluded from the leave preview');
  await setPreviewDate('2026-10-20');
  const requestedDaysPreview = await settledPreviewDays(1, 'The full-day leave preview did not match the selected working date');
  await requestDialog.locator('#personal-leave-portion').selectOption('first_half');
  const requestedHalfDayPreview = await settledPreviewDays(0.5, 'The half-day preview did not match the selected working date');
  await requestDialog.locator('#personal-leave-portion').selectOption('full');
  if (requestedDaysPreview !== 1 || requestedHalfDayPreview !== 0.5) {
    throw new Error(`The full/half-day estimate does not match the selected working date: ${JSON.stringify({ requestedDaysPreview, requestedHalfDayPreview })}.`);
  }
  const selectedAvailableDays = Number(selectedLedgerBalance.available_days);
  const previewedBalanceSufficient = selectedAvailableDays >= requestedDaysPreview;
  const balanceStatusText = previewedBalanceSufficient
    ? 'The current balance covers this request; the server will check again.'
    : 'This request exceeds the current balance; the server will check again.';
  await requestDialog.getByText(balanceStatusText, { exact: true }).waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(employee, 'Employee leave request preview mobile');
  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoHorizontalOverflow(employee, 'Employee leave request preview desktop');
  await employee.setViewportSize({ width: 375, height: 812 });
  await requestDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await requestDialog.waitFor({ state: 'hidden' });
  await employee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await employee.getByRole('button', { name: 'ছুটির আবেদন', exact: true }).click();
  const bengaliRequestDialog = employee.getByRole('dialog');
  await bengaliRequestDialog.getByText('জমা দেওয়ার পর এই প্রতিষ্ঠানের অনুমোদিত ছুটি ব্যবস্থাপক আপনার আবেদন পর্যালোচনা করবেন।', { exact: true })
    .waitFor({ state: 'visible' });
  console.log('E08_APPROVAL_ROUTE_BROWSER_ACCEPTANCE=PASS');
  const bengaliPreview = bengaliRequestDialog.getByTestId('leave-request-days-preview');
  await bengaliPreview.getByText('হিসাব করা ছুটির দিন:', { exact: true }).waitFor({ state: 'visible' });
  if (!(await bengaliPreview.innerText()).includes('১ দিন')) {
    throw new Error(`Bengali leave day preview did not localize its persisted-policy count: ${await bengaliPreview.innerText()}.`);
  }
  await bengaliRequestDialog.getByText(previewedBalanceSufficient
    ? 'বর্তমান অবশিষ্ট ছুটি এই আবেদনের জন্য যথেষ্ট; সার্ভার জমা দেওয়ার সময় আবার যাচাই করবে।'
    : 'এই আবেদন বর্তমান অবশিষ্ট ছুটির চেয়ে বেশি; সার্ভার জমা দেওয়ার সময় আবার যাচাই করবে।', { exact: true }).waitFor({ state: 'visible' });
  await bengaliRequestDialog.getByRole('button', { name: 'বাতিল', exact: true }).click();
  await bengaliRequestDialog.waitFor({ state: 'hidden' });
  await employee.getByRole('button', { name: 'Switch language to English' }).click();
  await employee.getByRole('button', { name: 'Request for leave', exact: true }).click();
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
  console.log(`LEAVE_UI_REQUEST_ACCEPTANCE=${JSON.stringify({ id: uiLeaveRequestId, path: uiEvidencePath, reason: uiEvidenceReason,
    previewedRequestedDays: requestedDaysPreview, previewedHalfDayDays: requestedHalfDayPreview,
    previewedHolidayDays: holidayDays, previewedWeekendDays: weekendDays,
    previewedBalanceSufficient, selectedAvailableDays })}`);
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
  await reopenedRequestDialog.waitFor({ state: 'hidden' });
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
  const policyFormButton = manager.getByRole('button', { name: 'Add leave type', exact: true }).first();
  await policyFormButton.click();
  const policyForm = manager.getByRole('form', { name: 'Add a leave type' });
  await policyForm.getByLabel('Leave type name').fill('Synthetic browser leave policy');
  await policyForm.getByLabel('Code').fill(`SYNUI-${Date.now()}`);
  await policyForm.getByLabel('Default annual entitlement (days)').fill('10');
  await policyForm.getByLabel('Minimum advance notice (days)').fill('1');
  await policyForm.getByLabel('Supporting evidence required').check();
  let failPolicyCreateOnce = true;
  await manager.route('**/rest/v1/rpc/hris_save_leave_type', async route => {
    if (failPolicyCreateOnce && route.request().method() === 'POST') {
      failPolicyCreateOnce = false;
      return route.fulfill({ status: 503, contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-client-info',
        },
        body: JSON.stringify({ code: 'XX000', message: 'Synthetic policy persistence outage.' }) });
    }
    return route.continue();
  });
  const browserPolicyCreateResponse = manager.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/hris_save_leave_type'), { timeout: 10000 });
  await policyForm.getByRole('button', { name: 'Add leave type', exact: true }).click();
  const browserPolicyFailed = await browserPolicyCreateResponse;
  if (browserPolicyFailed.status() !== 503) throw new Error('The policy persistence recovery check did not inject its expected one-time outage.');
  const failedPolicyPayload = browserPolicyFailed.request().postDataJSON();
  const policySaveError = manager.getByRole('alert').filter({ hasText: /Synthetic policy persistence outage\.|Unable to save this leave type\./ });
  await policySaveError.waitFor({ state: 'visible' });
  await policyForm.getByLabel('Leave type name').waitFor({ state: 'visible' });
  if (await policyForm.getByLabel('Leave type name').inputValue() !== 'Synthetic browser leave policy'
      || await policyForm.getByLabel('Default annual entitlement (days)').inputValue() !== '10') {
    throw new Error('The leave policy form discarded its values after a failed save.');
  }
  const retryPolicyCreateResponse = manager.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/hris_save_leave_type'), { timeout: 10000 });
  await policyForm.getByRole('button', { name: 'Add leave type', exact: true }).click();
  const browserPolicyCreated = await retryPolicyCreateResponse;
  if (!browserPolicyCreated.ok()) throw new Error(`Manager leave policy creation returned ${browserPolicyCreated.status()}.`);
  const browserPolicyPayload = browserPolicyCreated.request().postDataJSON();
  const browserPolicyId = browserPolicyPayload?.p_leave_type_id;
  const browserPolicyRow = manager.getByRole('row', { name: /Synthetic browser leave policy/ });
  await browserPolicyRow.waitFor({ state: 'visible' });
  if (browserPolicyPayload?.p_tenant_id !== process.env.HRIS_LOCAL_LEAVE_TENANT_ID
      || failedPolicyPayload?.p_leave_type_id !== browserPolicyId
      || browserPolicyPayload?.p_payload?.annual_entitlement !== 10
      || browserPolicyPayload?.p_payload?.min_days_notice !== 1
      || browserPolicyPayload?.p_payload?.requires_document_proof !== true
      || !browserPolicyId) {
    throw new Error('The leave policy form did not persist the selected tenant and configured fields.');
  }
  await manager.unroute('**/rest/v1/rpc/hris_save_leave_type');
  await browserPolicyRow.getByRole('button', { name: 'Edit Synthetic browser leave policy' }).click();
  const editPolicyForm = manager.getByRole('form', { name: 'Edit leave type' });
  await editPolicyForm.getByLabel('Default annual entitlement (days)').fill('11.5');
  await editPolicyForm.getByLabel('Minimum advance notice (days)').fill('3');
  const browserPolicyUpdateResponse = manager.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/hris_save_leave_type'), { timeout: 10000 });
  await editPolicyForm.getByRole('button', { name: 'Save changes', exact: true }).click();
  const browserPolicyUpdated = await browserPolicyUpdateResponse;
  if (!browserPolicyUpdated.ok()) throw new Error(`Manager leave policy update returned ${browserPolicyUpdated.status()}.`);
  const browserPolicyUpdatePayload = browserPolicyUpdated.request().postDataJSON();
  if (browserPolicyUpdatePayload?.p_tenant_id !== process.env.HRIS_LOCAL_LEAVE_TENANT_ID
      || browserPolicyUpdatePayload?.p_leave_type_id !== browserPolicyId
      || browserPolicyUpdatePayload?.p_expected?.annual_entitlement !== 10
      || browserPolicyUpdatePayload?.p_payload?.annual_entitlement !== 11.5) {
    throw new Error('The leave policy edit did not send its original values for stale-write protection.');
  }
  await manager.getByRole('status').filter({ hasText: 'Leave type updated.' }).waitFor({ state: 'visible' });
  await manager.getByRole('button', { name: 'Refresh leave type policies' }).click();
  await manager.getByRole('row', { name: /Synthetic browser leave policy.*11\.5.*3/ }).waitFor({ state: 'visible' });
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

  const overlapContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await routeOnlyLocalServices(overlapContext);
  const overlapEmployee = await overlapContext.newPage();
  await signIn(overlapEmployee, process.env.HRIS_LOCAL_LEAVE_EMPLOYEE_EMAIL);
  await navigateTo(overlapEmployee, 'My Leave');
  await overlapEmployee.getByRole('heading', { name: 'Personal leave' }).waitFor({ state: 'visible' });
  const overlapHistory = overlapEmployee.getByRole('table', {
    name: `Personal leave history for ${process.env.HRIS_LOCAL_LEAVE_HISTORY_YEAR}`,
  });
  // The application intentionally renders localized short dates (for example, "Oct 20")
  // rather than ISO strings. Anchor this journey to the request created above instead.
  await overlapHistory.locator(`[data-leave-request-id="${uiLeaveRequestId}"]`)
    .waitFor({ state: 'visible' });
  await overlapEmployee.getByRole('button', { name: 'Request for leave', exact: true }).click();
  let overlapDialog = overlapEmployee.getByRole('dialog', { name: 'Request for leave' });
  await overlapDialog.getByLabel('Leave type').selectOption({ label: 'Synthetic annual leave' });
  await overlapDialog.locator('#personal-leave-from').fill('2026-10-20');
  await overlapDialog.locator('#personal-leave-to').fill('2026-10-20');
  const overlapMessage = 'These dates overlap with an existing pending or approved leave request.';
  await overlapDialog.getByRole('alert').filter({ hasText: overlapMessage }).waitFor({ state: 'visible' });
  await overlapDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await overlapDialog.waitFor({ state: 'hidden' });
  await overlapEmployee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await overlapEmployee.getByRole('button', { name: 'ছুটির আবেদন', exact: true }).click();
  overlapDialog = overlapEmployee.getByRole('dialog');
  await overlapDialog.locator('#personal-leave-type').selectOption({ label: 'Synthetic annual leave' });
  await overlapDialog.locator('#personal-leave-from').fill('2026-10-20');
  await overlapDialog.locator('#personal-leave-to').fill('2026-10-20');
  const bengaliOverlapMessage = 'নির্বাচিত তারিখের সঙ্গে আগের অপেক্ষমাণ বা অনুমোদিত ছুটির আবেদন মিলে যাচ্ছে।';
  await overlapDialog.getByRole('alert').filter({ hasText: bengaliOverlapMessage }).waitFor({ state: 'visible' });
  await overlapDialog.getByRole('button', { name: 'বাতিল', exact: true }).click();
  await overlapDialog.waitFor({ state: 'hidden' });
  await overlapEmployee.getByRole('button', { name: 'Switch language to English' }).click();
  await overlapEmployee.getByRole('button', { name: 'Request for leave', exact: true }).click();
  overlapDialog = overlapEmployee.getByRole('dialog', { name: 'Request for leave' });
  await overlapDialog.getByLabel('Leave type').selectOption({ label: 'Synthetic annual leave' });
  await overlapDialog.locator('#personal-leave-from').fill('2026-10-20');
  await overlapDialog.locator('#personal-leave-to').fill('2026-10-20');
  await overlapDialog.getByRole('alert').filter({ hasText: overlapMessage }).waitFor({ state: 'visible' });
  await overlapDialog.getByLabel('Reason').fill('Synthetic duplicate overlap attempt');
  await overlapEmployee.setViewportSize({ width: 1280, height: 900 });
  await assertNoHorizontalOverflow(overlapEmployee, 'Existing leave overlap desktop');
  await overlapEmployee.setViewportSize({ width: 375, height: 812 });
  await assertNoHorizontalOverflow(overlapEmployee, 'Existing leave overlap mobile');
  const overlapSubmitResponse = overlapEmployee.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/hris_employee_submit_leave_request'),
  { timeout: 10000 });
  await overlapDialog.getByRole('button', { name: 'Send request', exact: true }).click();
  const overlapRejected = await overlapSubmitResponse;
  const overlapError = await overlapRejected.json();
  // PostgREST maps a PostgreSQL unique_violation to HTTP 409 Conflict.
  // Keep the assertion aligned with the server's conflict response instead
  // of masking a correct overlap denial as a browser failure.
  if (overlapRejected.status() !== 409 || overlapError?.code !== '23505') {
    throw new Error(`The server did not enforce the existing leave overlap: ${JSON.stringify({ status: overlapRejected.status(), code: overlapError?.code })}.`);
  }
  const overlapAlerts = await overlapDialog.getByRole('alert').allTextContents();
  if (overlapAlerts.filter(message => message.includes(overlapMessage)).length < 2) {
    throw new Error(`The confirmed overlap error was not presented beside the form: ${JSON.stringify(overlapAlerts)}.`);
  }
  await overlapDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  console.log('E08_OVERLAP_BROWSER_ACCEPTANCE=PASS');
  await overlapContext.close();

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

  const managerRangeResponse = manager.waitForResponse(response => {
    if (response.request().method() !== 'POST'
        || !new URL(response.url()).pathname.endsWith('/rest/v1/rpc/hris_get_tenant_leave_data')) return false;
    const payload = response.request().postDataJSON();
    return payload?.p_tenant_id === process.env.HRIS_LOCAL_LEAVE_TENANT_ID
      && payload?.p_start === '2026-10-20' && payload?.p_end === '2026-10-20';
  }, { timeout: 10000 });
  await manager.locator('#leave-request-from').fill('2026-10-20');
  await manager.locator('#leave-request-to').fill('2026-10-20');
  await manager.getByRole('button', { name: 'Apply date range', exact: true }).click();
  const managerRange = await managerRangeResponse;
  if (!managerRange.ok()) throw new Error(`Same-tenant manager date filter returned ${managerRange.status()}.`);
  const managerRangeData = await managerRange.json();
  const rangedUiRequest = Array.isArray(managerRangeData?.requests)
    ? managerRangeData.requests.find(item => item.id === uiLeaveRequestId)
    : null;
  if (!rangedUiRequest || rangedUiRequest.status !== 'approved') {
    throw new Error('The real manager date filter did not return the approved UI request overlapping 2026-10-20.');
  }
  await uiManagerRow.getByRole('cell').filter({ hasText: 'approved' }).waitFor({ state: 'visible' });
  await manager.getByRole('button', { name: 'Clear dates', exact: true }).click();
  await managerRow.waitFor({ state: 'visible' });
  await rejectionRow.waitFor({ state: 'visible' });

  const calendarMonth = manager.locator('#leave-absence-month');
  await calendarMonth.fill('2026-11');
  await manager.getByRole('region', { name: 'Absence calendar November 2026' }).waitFor({ state: 'visible' });
  const octoberCalendarResponse = manager.waitForResponse(response => {
    if (response.request().method() !== 'POST'
        || !new URL(response.url()).pathname.endsWith('/rest/v1/rpc/hris_get_tenant_leave_data')) return false;
    const payload = response.request().postDataJSON();
    return payload?.p_tenant_id === process.env.HRIS_LOCAL_LEAVE_TENANT_ID
      && payload?.p_start === '2026-10-01' && payload?.p_end === '2026-10-31';
  }, { timeout: 10000 });
  await calendarMonth.fill('2026-10');
  const octoberResponse = await octoberCalendarResponse;
  if (!octoberResponse.ok()) throw new Error(`Same-tenant manager absence calendar returned ${octoberResponse.status()}.`);
  const octoberData = await octoberResponse.json();
  const octoberRequests = Array.isArray(octoberData?.requests) ? octoberData.requests : [];
  const approvedEvidenceRequest = octoberRequests.find(item => item.id === process.env.HRIS_LOCAL_LEAVE_REQUEST_ID);
  const approvedUiRequest = octoberRequests.find(item => item.id === uiLeaveRequestId);
  const rejectedRequest = octoberRequests.find(item => item.id === process.env.HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID);
  if (approvedEvidenceRequest?.status !== 'approved' || approvedUiRequest?.status !== 'approved'
      || rejectedRequest?.status !== 'rejected') {
    throw new Error('The real tenant-scoped October response did not preserve both approvals and the rejection.');
  }
  const octoberCalendar = manager.getByRole('region', { name: 'Absence calendar October 2026' });
  await octoberCalendar.waitFor({ state: 'visible' });
  const october19 = octoberCalendar.getByRole('button', { name: /October 19, 2026, \d+ people on leave/ });
  await october19.click();
  const selectedOctober19 = manager.getByRole('heading', { name: /Approved absences on/ }).locator('..');
  await selectedOctober19.getByText('Synthetic Employee A').waitFor({ state: 'visible' });
  const october22 = octoberCalendar.getByRole('button', { name: /October 22, 2026,/ });
  await october22.click();
  const selectedOctober22 = manager.getByRole('heading', { name: /Approved absences on/ }).locator('..');
  await selectedOctober22.getByText('No approved absences on this date.').waitFor({ state: 'visible' });
  if ((await selectedOctober22.innerText()).includes('Synthetic Employee A')) {
    throw new Error('The absence calendar displayed the employee’s rejected request as approved leave.');
  }

  await assertNoHorizontalOverflow(manager, 'Manager leave requests desktop');
  await manager.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await manager.setViewportSize({ width: 375, height: 812 });
  await manager.getByRole('heading', { name: 'অনুপস্থিতির ক্যালেন্ডার' }).waitFor({ state: 'visible' });
  await manager.getByLabel('মাস', { exact: true }).waitFor({ state: 'visible' });
  await manager.getByRole('button', { name: 'আগের মাস' }).waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(manager, 'Manager absence calendar Bengali mobile');
  await managerContext.close();

  const refreshedEmployeeContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await routeOnlyLocalServices(refreshedEmployeeContext);
  const refreshedEmployee = await refreshedEmployeeContext.newPage();
  await signIn(refreshedEmployee, process.env.HRIS_LOCAL_LEAVE_EMPLOYEE_EMAIL);
  await navigateTo(refreshedEmployee, 'My Leave');
  await refreshedEmployee.getByRole('heading', { name: 'Personal leave' }).waitFor({ state: 'visible' });
  const personalCalendarDate = process.env.HRIS_LOCAL_LEAVE_REQUEST_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(personalCalendarDate || '')) {
    throw new Error('The isolated leave calendar fixture has no valid approved request date.');
  }
  const personalCalendarMonth = personalCalendarDate.slice(0, 7);
  const personalCalendarMonthLabel = new Date(`${personalCalendarMonth}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const personalCalendar = refreshedEmployee.getByRole('region', {
    name: `My leave calendar ${personalCalendarMonthLabel}`,
  });
  const personalCalendarMonthInput = refreshedEmployee.getByLabel('Month', { exact: true });
  await personalCalendarMonthInput.fill(personalCalendarMonth);
  await personalCalendar.waitFor({ state: 'visible' });
  const personalLeaveDay = new Date(`${personalCalendarDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  const personalLeaveDayButton = personalCalendar.getByRole('button', { name: new RegExp(personalLeaveDay) });
  await personalLeaveDayButton.waitFor({ state: 'visible' });
  await personalLeaveDayButton.click();
  const ownApprovedLeaveDetails = refreshedEmployee.getByRole('heading', { name: /My approved leave on/ }).locator('..');
  await ownApprovedLeaveDetails.getByText('Synthetic evidence-required leave').waitFor({ state: 'visible' });
  if ((await ownApprovedLeaveDetails.innerText()).includes('Synthetic evidence-backed leave request')) {
    throw new Error('The personal calendar exposed a private leave request reason.');
  }
  const holidayDate = process.env.HRIS_LOCAL_LEAVE_CALENDAR_HOLIDAY_DATE;
  const holidayDayLabel = new Date(`${holidayDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  await personalCalendar.getByRole('button', { name: new RegExp(holidayDayLabel) }).click();
  const holidayDetails = refreshedEmployee.getByRole('heading', { name: /Organization holidays on/ }).locator('..');
  await holidayDetails.getByText('Synthetic personal calendar holiday').waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Employee personal leave calendar mobile');
  await refreshedEmployee.setViewportSize({ width: 1280, height: 900 });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Employee personal leave calendar desktop');
  await refreshedEmployee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await refreshedEmployee.getByRole('heading', { name: 'ব্যক্তিগত ছুটি' }).waitFor({ state: 'visible' });
  const personalCalendarMonthLabelBn = new Date(`${personalCalendarMonth}-01T12:00:00Z`).toLocaleDateString('bn-BD', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  await refreshedEmployee.getByRole('region', { name: `আমার ছুটির ক্যালেন্ডার ${personalCalendarMonthLabelBn}` }).waitFor({ state: 'visible' });
  await refreshedEmployee.getByLabel('মাস', { exact: true }).waitFor({ state: 'visible' });
  await refreshedEmployee.setViewportSize({ width: 375, height: 812 });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Employee personal leave calendar Bengali mobile');
  await refreshedEmployee.getByRole('button', { name: 'Switch language to English' }).click();
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
  await refreshedEmployee.getByRole('button', { name: 'Request for leave', exact: true }).click();
  const refreshedRequestDialog = refreshedEmployee.getByRole('dialog', { name: 'Request for leave' });
  await refreshedRequestDialog.getByLabel('Leave type').selectOption({ label: 'Synthetic browser leave policy' });
  await refreshedRequestDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await refreshedRequestDialog.waitFor({ state: 'hidden' });

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
  await refreshedEmployee.getByRole('heading', { name: 'ব্যক্তিগত ছুটি' }).waitFor({ state: 'visible' });
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

  let documentRpcAttempts = 0;
  await refreshedEmployee.route('**/rest/v1/rpc/hris_get_my_employee_documents', async route => {
    documentRpcAttempts += 1;
    if (documentRpcAttempts === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic temporary outage.' }) });
      return;
    }
    await route.continue();
  });
  await navigateTo(refreshedEmployee, 'My Documents');
  await refreshedEmployee.getByRole('heading', { name: 'My Documents' }).waitFor({ state: 'visible' });
  await refreshedEmployee.getByRole('alert').filter({ hasText: 'Unable to load your documents.' }).waitFor({ state: 'visible' });
  await refreshedEmployee.getByRole('button', { name: 'Retry', exact: true }).click();
  const ownDocumentCard = refreshedEmployee.locator(`[data-employee-document-id="${process.env.HRIS_LOCAL_DOCUMENT_ID}"]`);
  const rejectedDocumentCard = refreshedEmployee.locator('[data-employee-document-id="a3333333-3333-4333-8333-333333333334"]');
  await ownDocumentCard.getByText(process.env.HRIS_LOCAL_DOCUMENT_NAME, { exact: true }).waitFor({ state: 'visible' });
  await rejectedDocumentCard.getByText(process.env.HRIS_LOCAL_DOCUMENT_REJECTED_NAME, { exact: true }).waitFor({ state: 'visible' });
  await rejectedDocumentCard.getByText(process.env.HRIS_LOCAL_DOCUMENT_REJECTION_REASON, { exact: false }).waitFor({ state: 'visible' });
  await ownDocumentCard.getByText('Verified', { exact: true }).waitFor({ state: 'visible' });
  await refreshedEmployee.unroute('**/rest/v1/rpc/hris_get_my_employee_documents');
  await refreshedEmployee.getByRole('button', { name: 'Refresh documents' }).click();
  await ownDocumentCard.waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Employee document self-service desktop');
  await refreshedEmployee.setViewportSize({ width: 375, height: 812 });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Employee document self-service mobile');
  await refreshedEmployee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await refreshedEmployee.getByRole('heading', { name: 'আমার নথি' }).waitFor({ state: 'visible' });
  await rejectedDocumentCard.getByText('সংশোধনের কারণ', { exact: false }).waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Employee documents Bengali mobile');
  await refreshedEmployee.getByRole('button', { name: 'Switch language to English' }).click();
  const documentDownload = refreshedEmployee.waitForEvent('download');
  await ownDocumentCard.getByRole('button', { name: 'Download', exact: true }).click();
  await assertDownloadedEvidence(refreshedEmployee, await documentDownload,
    'Synthetic Employee A document', 'synthetic employee document');
  await refreshedEmployee.setViewportSize({ width: 1280, height: 900 });
  await assertNoHorizontalOverflow(refreshedEmployee, 'Employee document self-service refreshed desktop');
  await refreshedEmployee.getByRole('button', { name: 'Refresh documents' }).click();
  await ownDocumentCard.waitFor({ state: 'visible' });
  await refreshedEmployeeContext.close();

  console.log('Real local Auth/Postgres/Storage leave flow passed: employee UI submits proof-backed leave, employee and manager retrieve its private evidence, manager approves and rejects, refreshed employee history and owner-only decision notifications persist, Bengali and English notification actions return to the matching request on mobile and desktop.');
  console.log('LEAVE_EVIDENCE_BROWSER_ACCEPTANCE=PASS');
  console.log('EMPLOYEE_DOCUMENTS_BROWSER_ACCEPTANCE=PASS');
} finally {
  if (browser) await browser.close();
  await stopChildProcess(server);
}
