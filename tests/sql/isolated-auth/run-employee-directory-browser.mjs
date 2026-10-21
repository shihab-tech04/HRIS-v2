// Exercises the employee directory against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_EMPLOYEE_DIRECTORY_EMAIL', 'HRIS_LOCAL_EMPLOYEE_DIRECTORY_MANAGER_EMAIL',
  'HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48374';
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
    } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function signIn(page, email = process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_EMAIL) {
  const sessionSetting = email === process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_MANAGER_EMAIL
    ? process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_MANAGER_SESSION
    : process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_VIEWER_SESSION;
  if (sessionSetting) {
    const session = JSON.parse(sessionSetting);
    if (!session?.access_token || !session?.refresh_token || session.user?.email !== email) {
      throw new Error('The supplied local Auth session does not match the synthetic browser identity.');
    }
    const projectRef = new URL(process.env.HRIS_LOCAL_SUPABASE_URL).hostname.split('.')[0];
    await page.goto(origin);
    await page.evaluate(({ storageKey, value }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    }, { storageKey: `sb-${projectRef}-auth-token`, value: session });
    await page.reload();
    await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
    return;
  }
  const authTrace = [];
  const sanitize = value => String(value || '')
    .replaceAll(email, '[synthetic account]')
    .replaceAll(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[token redacted]');
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/auth/v1/')) authTrace.push(`Auth request started: ${request.method()} ${url.pathname}`);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      authTrace.push(`password token response HTTP ${response.status()}`);
    }
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/auth/v1/')) {
      authTrace.push(`Auth request failed: ${sanitize(request.failure()?.errorText || 'network error')}`);
    }
  });
  page.on('console', message => {
    if (message.type() === 'error' && /auth|cors|fetch|network/i.test(message.text())) {
      authTrace.push(`Browser console: ${sanitize(message.text()).slice(0, 180)}`);
    }
  });
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  let signInError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await submit.click();
    try {
      await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
      return;
    } catch (error) {
      signInError = error;
      const alerts = (await page.getByRole('alert').allInnerTexts()).join(' | ')
        .replaceAll(email, '[synthetic account]').slice(0, 200);
      const retryableTimeout = attempt === 0
        && authTrace.some(item => item === 'password token response HTTP 504')
        && /timed out, please retry after a moment/i.test(alerts);
      if (retryableTimeout) continue;
      const timeout = String(signInError?.message || 'sign-in timed out').split('\n', 1)[0];
      const headings = (await page.getByRole('heading').allTextContents()).join(' | ').slice(0, 200);
      throw new Error(`Employee directory sign-in did not reach workspace: ${sanitize(timeout)}; headings=${headings || '[none]'}; alerts=${alerts || '[none]'}; Auth=${authTrace.join('; ') || 'no Auth response/error observed'}.`);
    }
  }
  const alerts = (await page.getByRole('alert').allInnerTexts()).join(' | ')
    .replaceAll(email, '[synthetic account]').slice(0, 200);
  throw new Error(`Employee directory sign-in did not reach workspace after one retry: ${String(signInError?.message || 'sign-in timed out').split('\n', 1)[0]}; alerts=${alerts || '[none]'}; Auth=${authTrace.join('; ') || 'no Auth response/error observed'}.`);
}

async function openEmployeeDirectory(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Employees', exact: true }).click();
  await page.getByRole('heading', { name: 'Employee directory' }).waitFor({ state: 'visible' });
}

function employeeInCurrentLayout(page, name) {
  return page.evaluate(() => window.innerWidth < 768).then(isMobile => isMobile
    ? page.locator('ul.divide-y').getByText(name, { exact: true })
    : page.getByRole('table', { name: 'Organization employee directory' }).getByText(name, { exact: true }));
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

async function assertFocused(locator, description) {
  await locator.waitFor({ state: 'visible' });
  const focusRecovered = await locator.evaluate(async element => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (element === document.activeElement) return true;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return element === document.activeElement;
  });
  if (!focusRecovered) throw new Error(`${description} did not receive keyboard focus.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const forbiddenDirectoryReads = [];
  const rpcPayloads = [];
  let rpcCalls = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/employees')
      && url.searchParams.get('select') === 'id,full_name,employee_number,employment_status') {
      forbiddenDirectoryReads.push('employees');
    }
    if (url.pathname.endsWith('/rest/v1/departments')) forbiddenDirectoryReads.push('departments');
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_employee_directory_v2') && request.method() === 'POST') {
      rpcPayloads.push(request.postDataJSON());
    }
  });
  page.on('response', async response => {
    if (response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2') && response.ok()) {
      try { rpcPayloads.push(await response.json()); } catch { /* response body is not required for rendering */ }
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_employee_directory_v2')
      && route.request().method() === 'POST') {
      rpcCalls += 1;
      if (rpcCalls === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary directory outage.' }),
        });
        return;
      }
      return route.continue();
    }
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await signIn(page);
  await openEmployeeDirectory(page);
  await page.getByRole('alert').getByRole('button', { name: 'Retry' }).waitFor({ state: 'visible' });
  if (rpcCalls !== 1) throw new Error(`Expected the isolated first request to fail once; got ${rpcCalls} calls.`);
  await assertNoOverflow(page, 'Employee directory mobile error recovery');
  await page.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  await (await employeeInCurrentLayout(page, 'Synthetic Employee B')).waitFor({ state: 'detached' });
  const mobileDetailTrigger = page.getByRole('button', { name: 'View details for Synthetic Employee A' });
  await mobileDetailTrigger.click();
  const mobileDetails = page.getByRole('dialog', { name: 'Synthetic Employee A' });
  await mobileDetails.waitFor({ state: 'visible' });
  const mobileCloseRecord = mobileDetails.getByRole('button', { name: 'Close employee record' });
  const mobileFooterClose = mobileDetails.getByRole('button', { name: 'Close', exact: true });
  await assertFocused(mobileCloseRecord, 'Employee detail dialog initial focus');
  await page.getByRole('heading', { name: 'Employee directory', exact: true }).evaluate(element => element.focus());
  await page.keyboard.press('Tab');
  await assertFocused(mobileCloseRecord, 'Employee detail dialog focus recovery from outside');
  await page.keyboard.press('Shift+Tab');
  await assertFocused(mobileFooterClose, 'Employee detail dialog reverse focus wrap');
  await page.keyboard.press('Tab');
  await assertFocused(mobileCloseRecord, 'Employee detail dialog forward focus wrap');
  for (const field of ['Employee record', 'QA-A-001', 'QA A department', 'QA A designation', 'QA A Team', 'Active']) {
    if (!(await mobileDetails.getByText(field, { exact: false }).count())) throw new Error(`Employee details did not show the authorized field: ${field}.`);
  }
  await assertNoOverflow(page, 'Employee detail sheet mobile');
  await page.keyboard.press('Escape');
  await mobileDetails.waitFor({ state: 'detached' });
  if (!(await mobileDetailTrigger.evaluate(element => document.activeElement === element))) {
    throw new Error('Closing employee details with Escape did not return focus to the opening action.');
  }
  await mobileDetailTrigger.click();
  await page.getByRole('button', { name: 'Close employee record' }).click();
  await mobileDetails.waitFor({ state: 'detached' });
  for (const marker of ['employee-a@hris.test', 'official_email', 'joining_date', 'gender']) {
    if (await page.getByText(marker, { exact: false }).count()) throw new Error(`Sensitive employee data was rendered: ${marker}.`);
  }
  if (forbiddenDirectoryReads.length) throw new Error(`Employee-only role triggered legacy directory reads: ${forbiddenDirectoryReads.join(', ')}.`);

  await page.getByLabel('Search employees').fill('Synthetic Employee A');
  const searchResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await searchResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  if (await page.getByText('personal-a@hris.test', { exact: true }).count()) {
    throw new Error('Employee-view directory exposed a private contact field.');
  }
  await page.getByLabel('Filter employees by department').selectOption('eeeeeeee-0000-4000-8000-000000000001');
  await page.getByLabel('Filter employees by employment status').selectOption('active');
  const filterResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await filterResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  await page.getByLabel('Search employees').fill('');
  await page.getByLabel('Filter employees by employment status').selectOption('');
  await page.getByLabel('Filter employees by team').selectOption('dddddddd-0000-4000-8000-000000000001');
  const firstTeamResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await firstTeamResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  await (await employeeInCurrentLayout(page, 'Synthetic WFH Employee A')).waitFor({ state: 'detached' });
  await page.getByLabel('Filter employees by team').selectOption('dddddddd-0000-4000-8000-000000000003');
  const otherTeamResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await otherTeamResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic WFH Employee A')).waitFor({ state: 'visible' });
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'detached' });
  const teamDownloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export current page' }).click();
  const teamDownload = await teamDownloadWait;
  const teamDownloadStream = await teamDownload.createReadStream();
  const teamChunks = [];
  for await (const chunk of teamDownloadStream) teamChunks.push(chunk);
  const teamExportCsv = Buffer.concat(teamChunks).toString('utf8');
  if (!teamExportCsv.includes('Synthetic WFH Employee A') || teamExportCsv.includes('Synthetic Employee A')) {
    throw new Error('Employee directory team-filter CSV did not match the authorized filtered page.');
  }
  await assertNoOverflow(page, 'Employee directory filtered mobile');

  const statusFilter = page.getByLabel('Filter employees by employment status');
  const statusCases = [
    { value: 'active', label: 'Active', employee: 'Synthetic Employee A' },
    { value: 'inactive', label: 'Inactive', employee: 'Synthetic Absent Employee A' },
    { value: 'probation', label: 'Probation', employee: 'Synthetic Late Employee A' },
    { value: 'notice', label: 'Notice', employee: 'Synthetic Leave Employee A' },
    { value: 'exited', label: 'Exited', employee: 'Synthetic WFH Employee A' },
    { value: 'custom_configured', label: 'Custom Configured', employee: 'Synthetic Clock Employee' },
  ];
  const availableStatusOptions = await statusFilter.locator('option').evaluateAll(options =>
    options.map(option => ({ value: option.value, label: option.textContent?.trim() || '' })));
  if (availableStatusOptions.some(option => option.value === 'tenant_b_only')) {
    throw new Error('The employee directory exposed an employment status configured only in tenant B.');
  }
  for (const statusCase of statusCases) {
    if (!availableStatusOptions.some(option => option.value === statusCase.value && option.label === statusCase.label)) {
      throw new Error(`Tenant status ${statusCase.value} was not presented as ${statusCase.label}.`);
    }
  }
  await page.getByLabel('Filter employees by department').selectOption('');
  await page.getByLabel('Filter employees by team').selectOption('');
  for (const statusCase of statusCases) {
    await statusFilter.selectOption(statusCase.value);
    const statusResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await statusResponse;
    await (await employeeInCurrentLayout(page, statusCase.employee)).waitFor({ state: 'visible' });
    for (const otherCase of statusCases.filter(item => item.employee !== statusCase.employee)) {
      await (await employeeInCurrentLayout(page, otherCase.employee)).waitFor({ state: 'detached' });
    }
    if (!rpcPayloads.some(payload => payload?.p_tenant_id === process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID
      && payload?.p_status === statusCase.value)) {
      throw new Error(`Directory API request did not carry the tenant and status filter for ${statusCase.value}.`);
    }
  }
  await statusFilter.selectOption('');
  const restoreAllStatusesResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await restoreAllStatusesResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  const safeBulkExportWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export current page' }).click();
  const safeBulkExport = await safeBulkExportWait;
  const safeBulkExportStream = await safeBulkExport.createReadStream();
  const safeBulkExportChunks = [];
  for await (const chunk of safeBulkExportStream) safeBulkExportChunks.push(chunk);
  const safeBulkExportCsv = Buffer.concat(safeBulkExportChunks).toString('utf8');
  const safeBulkExportLines = safeBulkExportCsv.split(/\r?\n/).filter(Boolean);
  const allowedBulkExportHeader = '"Employee","Employee number","Department","Designation","Team","Employment status"';
  const expectedBulkExportEmployees = statusCases.map(item => item.employee);
  const privateBulkExportValues = [
    'employee-a@hris.test', 'employee-b@hris.test', 'personal-a@hris.test',
    'QA A home address', 'QA A emergency contact', 'Synthetic Employee B',
  ];
  if (safeBulkExportLines[0] !== allowedBulkExportHeader || safeBulkExportLines.length !== expectedBulkExportEmployees.length + 1
    || expectedBulkExportEmployees.some(name => !safeBulkExportCsv.includes(`"${name}"`))
    || privateBulkExportValues.some(value => safeBulkExportCsv.includes(value))) {
    throw new Error(`HR01-07 safe employee export exceeded its permitted current page: ${JSON.stringify({
      header: safeBulkExportLines[0], rowCount: safeBulkExportLines.length - 1,
      expectedRowCount: expectedBulkExportEmployees.length,
      missingEmployees: expectedBulkExportEmployees.filter(name => !safeBulkExportCsv.includes(`"${name}"`)),
      leakedPrivateValues: privateBulkExportValues.filter(value => safeBulkExportCsv.includes(value)),
    })}.`);
  }
  console.log('HR01-07_SAFE_BULK_EXPORT_BROWSER_PASS');

  await page.getByLabel('Search employees').fill('No matching employee in this fixture');
  const emptyResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await emptyResponse;
  await page.getByText('No employees found', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Search employees').fill('Synthetic Employee A');
  await page.getByLabel('Filter employees by team').selectOption('');
  const restoreResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await restoreResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Refresh employee directory' }).click();
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee directory desktop');
  await page.getByLabel('Search employees').fill('');
  await statusFilter.selectOption('notice');
  const desktopStatusResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await desktopStatusResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Leave Employee A')).waitFor({ state: 'visible' });
  const desktopStatusRow = page.getByRole('table', { name: 'Organization employee directory' })
    .getByRole('row').filter({ hasText: 'Synthetic Leave Employee A' });
  await desktopStatusRow.getByText('Notice', { exact: true }).waitFor({ state: 'visible' });
  await statusFilter.selectOption('');
  const restoreDesktopStatusesResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await restoreDesktopStatusesResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  console.log('HR01-04_EMPLOYMENT_STATUS_VISIBILITY_BROWSER_PASS');
  await page.getByLabel('Search employees').fill('');
  await page.getByLabel('Filter employees by team').selectOption('dddddddd-0000-4000-8000-000000000003');
  const desktopTeamResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await desktopTeamResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic WFH Employee A')).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Refresh employee directory' }).click();
  await (await employeeInCurrentLayout(page, 'Synthetic WFH Employee A')).waitFor({ state: 'visible' });
  await page.getByLabel('Filter employees by team').selectOption('');
  await page.getByLabel('Search employees').fill('Synthetic Employee A');
  const restoreDesktopResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory_v2'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await restoreDesktopResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  const desktopDetailTrigger = page.getByRole('button', { name: 'View details for Synthetic Employee A' });
  await desktopDetailTrigger.click();
  const desktopDetails = page.getByRole('dialog', { name: 'Synthetic Employee A' });
  await desktopDetails.waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee details desktop');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await desktopDetails.waitFor({ state: 'detached' });
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export current page' }).click();
  const download = await downloadWait;
  if (!download.suggestedFilename().startsWith('employee-directory-')) throw new Error('Employee directory export filename was not generated.');
  const downloadStream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of downloadStream) chunks.push(chunk);
  const exportCsv = Buffer.concat(chunks).toString('utf8');
  if (!exportCsv.includes('Synthetic Employee A') || exportCsv.includes('Synthetic Employee B')) {
    throw new Error('Employee directory export did not contain only the currently authorized filtered page.');
  }

  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await page.getByRole('heading', { name: 'কর্মচারী ডিরেক্টরি', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'বিস্তারিত দেখুন: Synthetic Employee A' }).click();
  const bengaliDetails = page.getByRole('dialog', { name: 'Synthetic Employee A' });
  await bengaliDetails.waitFor({ state: 'visible' });
  await bengaliDetails.getByText('কর্মচারীর রেকর্ড', { exact: true }).waitFor({ state: 'visible' });
  await bengaliDetails.getByText('কর্মচারী নম্বর', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'কর্মচারীর রেকর্ড বন্ধ করুন' }).click();
  await bengaliDetails.waitFor({ state: 'detached' });
  const bengaliDownloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'বর্তমান পৃষ্ঠা রপ্তানি করুন' }).click();
  const bengaliDownload = await bengaliDownloadWait;
  const bengaliDownloadStream = await bengaliDownload.createReadStream();
  const bengaliChunks = [];
  for await (const chunk of bengaliDownloadStream) bengaliChunks.push(chunk);
  const bengaliExport = Buffer.concat(bengaliChunks).toString('utf8');
  if (!bengaliExport.includes('কর্মচারী নম্বর')) throw new Error('Employee directory CSV headers did not follow the Bengali locale.');
  if (await page.evaluate(() => localStorage.getItem('synesis-hris-locale')) !== 'bn') {
    throw new Error('Employee directory Bengali locale did not persist.');
  }
  console.log('HR01-03_WORKFORCE_SEARCH_FILTER_BROWSER_PASS');

  const managerPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let managerContactReadCalls = 0;
  let managerContactWriteCalls = 0;
  let missingContactReadApi = false;
  let missingContactWriteApi = false;
  const managerContactReadPayloads = [];
  const managerContactPayloads = [];
  await managerPage.route('**/*', async route => {
    const url = new URL(route.request().url());
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (local && url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_employee_contact_details')
      && route.request().method() === 'POST') {
      managerContactReadCalls += 1;
      managerContactReadPayloads.push(route.request().postDataJSON());
      if (missingContactReadApi) {
        await route.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the requested contact read function in the schema cache.' }) });
        return;
      }
      if (managerContactReadCalls === 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
        await route.fulfill({ status: 503, contentType: 'application/json',
          body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary contact read outage.' }) });
        return;
      }
      return route.continue();
    }
    if (local && url.pathname.endsWith('/rest/v1/rpc/hris_update_tenant_employee_contact_details')
      && route.request().method() === 'POST') {
      managerContactWriteCalls += 1;
      managerContactPayloads.push(route.request().postDataJSON());
      if (missingContactWriteApi) {
        await route.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the requested contact update function in the schema cache.' }) });
        return;
      }
      if (managerContactWriteCalls === 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
        await route.fulfill({ status: 503, contentType: 'application/json',
          body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary contact save outage.' }) });
        return;
      }
      return route.continue();
    }
    if (local) return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(managerPage, process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_MANAGER_EMAIL);
  await openEmployeeDirectory(managerPage);
  await (await employeeInCurrentLayout(managerPage, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  await managerPage.getByRole('button', { name: 'View details for Synthetic Employee A' }).click();
  const managerDetails = managerPage.getByRole('dialog', { name: 'Synthetic Employee A' });
  await managerDetails.waitFor({ state: 'visible' });
  await managerDetails.getByRole('button', { name: 'View contact details' }).click();
  await managerDetails.getByRole('status').getByText('Loading contact details…', { exact: true }).waitFor({ state: 'visible' });
  await managerDetails.getByRole('alert').getByRole('button', { name: 'Retry contact details' }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Employee contact read error on mobile');
  await managerDetails.getByRole('button', { name: 'Retry contact details' }).click();
  await managerDetails.getByText('employee-a@hris.test', { exact: true }).waitFor({ state: 'visible' });
  await managerDetails.getByText('QA A home address', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Employee contact details on mobile');
  await managerDetails.getByRole('button', { name: 'Edit contact details' }).click();
  const contactEditor = managerDetails.locator('form');
  await contactEditor.waitFor({ state: 'visible', timeout: 5000 });
  const editorLabels = await contactEditor.locator('label').allTextContents();
  if (!editorLabels.some(label => label.includes('Home address'))) {
    throw new Error(`Contact editor labels do not include Home address: ${JSON.stringify(editorLabels)}.`);
  }
  try {
    await contactEditor.getByLabel('Home address', { exact: true }).fill('Unsaved address that should be discarded');
  } catch (error) {
    const labelText = await contactEditor.locator('label').allTextContents();
    const controls = await contactEditor.locator('textarea').evaluateAll(elements => elements.map(element => ({
      id: element.id,
      name: element.getAttribute('name'),
      ariaLabel: element.getAttribute('aria-label'),
      labelledBy: element.getAttribute('aria-labelledby'),
      labels: element.labels ? [...element.labels].map(label => label.innerText) : [],
      disabled: element.disabled,
      placeholder: element.getAttribute('placeholder'),
    })));
    throw new Error(`Home address field is not accessible through its visible label: ${String(error?.message || error).split('\n', 1)[0]}; labels=${JSON.stringify(labelText)}; controls=${JSON.stringify(controls)}.`);
  }
  managerPage.once('dialog', dialog => dialog.accept());
  await managerDetails.getByRole('button', { name: 'Cancel', exact: true }).click();
  await managerDetails.getByText('QA A home address', { exact: true }).waitFor({ state: 'visible' });
  await managerDetails.getByRole('button', { name: 'Edit contact details' }).click();
  await managerDetails.getByLabel('Official email').fill('invalid-email');
  await managerDetails.getByRole('button', { name: 'Save contact details' }).click();
  await managerDetails.getByRole('alert').getByText('Enter a valid official email and a valid personal email when provided.', { exact: true }).waitFor({ state: 'visible' });
  if (managerContactWriteCalls !== 0) throw new Error('Invalid contact email reached the update RPC.');
  const exactHomeAddressCount = await managerDetails.getByLabel('Home address', { exact: true }).count();
  if (exactHomeAddressCount !== 1) {
    const formLabels = await managerDetails.locator('form label').allTextContents();
    throw new Error(`Home address accessibility label changed after validation: ${JSON.stringify({ exactHomeAddressCount, formLabels })}.`);
  }

  const editedContact = {
    official_email: 'employee-a-updated@hris.test', personal_email: 'employee-a-new@hris.test',
    phone: '+880 1700 000002', official_phone: '+880 2 5550002', address: 'QA A updated home address',
    mailing_address: 'QA A updated mailing address', emergency_contact_name: 'QA A updated contact',
    emergency_contact_phone: '+880 1700 000102', emergency_contact_relation: 'Sibling',
  };
  for (const [label, value] of Object.entries({
    'Official email': editedContact.official_email, 'Personal email': editedContact.personal_email,
    Phone: editedContact.phone, 'Official phone': editedContact.official_phone,
    'Home address': editedContact.address, 'Mailing address': editedContact.mailing_address,
    'Emergency contact name': editedContact.emergency_contact_name,
    'Emergency contact phone': editedContact.emergency_contact_phone,
    'Emergency contact relationship': editedContact.emergency_contact_relation,
  })) {
    const field = managerDetails.getByLabel(label, { exact: true });
    try {
      await field.waitFor({ state: 'visible', timeout: 5000 });
      if (!(await field.isEnabled())) throw new Error('field is disabled');
      await field.fill(value);
    } catch (error) {
      const formLabels = await managerDetails.locator('form label').allTextContents();
      throw new Error(`Contact field ${JSON.stringify(label)} was not ready for editing: ${String(error?.message || error).split('\n', 1)[0]}; formLabels=${JSON.stringify(formLabels)}.`);
    }
  }
  await managerDetails.getByRole('button', { name: 'Save contact details' }).click();
  await managerDetails.getByRole('button', { name: 'Saving contact details…' }).waitFor({ state: 'visible' });
  await managerDetails.getByRole('alert').getByText('Contact update failed. Check your employee-management access and retry.', { exact: true }).waitFor({ state: 'visible' });
  if (await managerDetails.getByLabel('Official email').inputValue() !== editedContact.official_email) {
    throw new Error('A temporary contact save error did not preserve the draft for retry.');
  }
  await managerDetails.getByRole('button', { name: 'Save contact details' }).click();
  await managerDetails.getByRole('status').getByText('Contact details updated.', { exact: true }).waitFor({ state: 'visible' });
  await managerDetails.getByText(editedContact.official_email, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Saved employee contact details on mobile');
  console.log('HR01-06_CONTACT_AUDIT_BROWSER_PASS');
  console.log('HR01-02_CONTACT_ONLY_UPDATE_SCOPE_BROWSER_PASS');
  const allowedContactFields = Object.keys(editedContact).sort().join(',');
  const readsWrongTenant = managerContactReadPayloads.some(payload => payload.p_tenant_id !== process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID);
  const writesWrongTenant = managerContactPayloads.some(payload => payload.p_tenant_id !== process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID);
  const writesExtraFields = managerContactPayloads.some(payload => Object.keys(payload.p_contact_details || {}).sort().join(',') !== allowedContactFields);
  if (managerContactWriteCalls !== 2 || readsWrongTenant || writesWrongTenant || writesExtraFields) {
    throw new Error('Contact updates did not use the active tenant or the expected retry count.');
  }

  await managerPage.getByRole('button', { name: 'Close employee record' }).click();
  await managerPage.reload();
  await managerPage.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  await openEmployeeDirectory(managerPage);
  await (await employeeInCurrentLayout(managerPage, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  await managerPage.setViewportSize({ width: 1280, height: 900 });
  await managerPage.getByRole('button', { name: 'View details for Synthetic Employee A' }).click();
  const managerDetailsAfterRefresh = managerPage.getByRole('dialog', { name: 'Synthetic Employee A' });
  await managerDetailsAfterRefresh.getByRole('button', { name: 'View contact details' }).click();
  await managerDetailsAfterRefresh.getByText(editedContact.official_email, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Employee contact details after desktop refresh recovery');
  await managerDetailsAfterRefresh.getByRole('button', { name: 'Close', exact: true }).click();

  await managerPage.getByRole('button', { name: 'View details for Synthetic Employee A' }).click();
  const missingApiDetails = managerPage.getByRole('dialog', { name: 'Synthetic Employee A' });
  missingContactReadApi = true;
  await missingApiDetails.getByRole('button', { name: 'View contact details' }).click();
  await missingApiDetails.getByRole('alert').getByText(
    'Contact editing is currently unavailable. Contact your administrator.', { exact: true }).waitFor({ state: 'visible' });
  if (await missingApiDetails.getByRole('button', { name: 'Edit contact details' }).count() !== 0) {
    throw new Error('A missing production contact-read RPC exposed the edit action.');
  }
  missingContactReadApi = false;
  await missingApiDetails.getByRole('button', { name: 'Retry contact details' }).click();
  await missingApiDetails.getByText(editedContact.official_email, { exact: true }).waitFor({ state: 'visible' });
  await missingApiDetails.getByRole('button', { name: 'Edit contact details' }).click();
  await missingApiDetails.getByLabel('Official email').fill('retry-after-missing-api@hris.test');
  missingContactWriteApi = true;
  await missingApiDetails.getByRole('button', { name: 'Save contact details' }).click();
  await missingApiDetails.getByRole('alert').getByText(
    'Contact editing is currently unavailable. Contact your administrator.', { exact: true }).waitFor({ state: 'visible' });
  if (await missingApiDetails.getByLabel('Official email').inputValue() !== 'retry-after-missing-api@hris.test') {
    throw new Error('A missing production contact-update RPC did not preserve the unsaved draft.');
  }
  if (await missingApiDetails.getByText('Contact details updated.', { exact: true }).count() !== 0) {
    throw new Error('A missing production contact-update RPC was reported as a successful update.');
  }
  missingContactWriteApi = false;
  managerPage.once('dialog', dialog => dialog.accept());
  await missingApiDetails.getByRole('button', { name: 'Cancel', exact: true }).click();
  await missingApiDetails.getByRole('button', { name: 'Close', exact: true }).click();
  console.log('HR01-06_PGRST202_CONTACT_READ_SAFE_BROWSER_PASS');
  console.log('HR01-06_PGRST202_CONTACT_UPDATE_SAFE_BROWSER_PASS');

  await managerPage.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await managerPage.getByRole('button', { name: 'বিস্তারিত দেখুন: Synthetic Employee A' }).click();
  const managerDetailsBengali = managerPage.getByRole('dialog', { name: 'Synthetic Employee A' });
  await managerDetailsBengali.getByRole('button', { name: 'যোগাযোগের তথ্য দেখুন' }).click();
  await managerDetailsBengali.getByText(editedContact.official_email, { exact: true }).waitFor({ state: 'visible' });
  await managerDetailsBengali.getByText('যোগাযোগের তথ্য', { exact: true }).waitFor({ state: 'visible' });
  await managerDetailsBengali.getByText('অফিসিয়াল ইমেইল', { exact: true }).waitFor({ state: 'visible' });
  await managerPage.getByRole('button', { name: 'কর্মচারীর রেকর্ড বন্ধ করুন' }).click();
  if (managerContactReadCalls < 3) throw new Error(`Contact read recovery/refresh made too few RPC attempts: ${managerContactReadCalls}.`);

  const requestTenants = rpcPayloads.filter(value => value && typeof value.p_tenant_id === 'string').map(value => value.p_tenant_id);
  if (requestTenants.some(id => id !== process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID)) {
    throw new Error(`Employee directory requested a different tenant: ${requestTenants.join(', ')}.`);
  }
  console.log('Local Auth-to-Postgres employee directory and contact-editing journey passed with tenant-scoped team filtering, filtered CSV, manager-only contact access, save/cancel/error recovery, persisted refresh, EN/BN parity, and 375px mobile/1280px desktop layouts.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
