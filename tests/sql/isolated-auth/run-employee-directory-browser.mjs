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
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  try {
    await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  } catch (error) {
    const timeout = String(error?.message || 'sign-in timed out').split('\n', 1)[0];
    const headings = (await page.getByRole('heading').allTextContents()).join(' | ').slice(0, 200);
    const alerts = (await page.getByRole('alert').allInnerTexts()).join(' | ')
      .replaceAll(email, '[synthetic account]').slice(0, 200);
    throw new Error(`Employee directory sign-in did not reach workspace: ${sanitize(timeout)}; headings=${headings || '[none]'}; alerts=${alerts || '[none]'}; Auth=${authTrace.join('; ') || 'no Auth response/error observed'}.`);
  }
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
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_employee_directory') && request.method() === 'POST') {
      rpcPayloads.push(request.postDataJSON());
    }
  });
  page.on('response', async response => {
    if (response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory') && response.ok()) {
      try { rpcPayloads.push(await response.json()); } catch { /* response body is not required for rendering */ }
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_employee_directory')
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
  const searchResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await searchResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  if (await page.getByText('personal-a@hris.test', { exact: true }).count()) {
    throw new Error('Employee-view directory exposed a private contact field.');
  }
  await page.getByLabel('Filter employees by department').selectOption('eeeeeeee-0000-4000-8000-000000000001');
  await page.getByLabel('Filter employees by employment status').selectOption('active');
  const filterResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await filterResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee directory filtered mobile');

  await page.getByLabel('Search employees').fill('No matching employee in this fixture');
  const emptyResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await emptyResponse;
  await page.getByText('No employees found', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Search employees').fill('Synthetic Employee A');
  const restoreResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await restoreResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Refresh employee directory' }).click();
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee directory desktop');
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

  const managerPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let managerContactReadCalls = 0;
  let managerContactWriteCalls = 0;
  const managerContactReadPayloads = [];
  const managerContactPayloads = [];
  await managerPage.route('**/*', async route => {
    const url = new URL(route.request().url());
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (local && url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_employee_contact_details')
      && route.request().method() === 'POST') {
      managerContactReadCalls += 1;
      managerContactReadPayloads.push(route.request().postDataJSON());
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
  await managerDetails.getByLabel('Home address').fill('Unsaved address that should be discarded');
  managerPage.once('dialog', dialog => dialog.accept());
  await managerDetails.getByRole('button', { name: 'Cancel', exact: true }).click();
  await managerDetails.getByText('QA A home address', { exact: true }).waitFor({ state: 'visible' });
  await managerDetails.getByRole('button', { name: 'Edit contact details' }).click();
  await managerDetails.getByLabel('Official email').fill('invalid-email');
  await managerDetails.getByRole('button', { name: 'Save contact details' }).click();
  await managerDetails.getByRole('alert').getByText('Enter a valid official email and a valid personal email when provided.', { exact: true }).waitFor({ state: 'visible' });
  if (managerContactWriteCalls !== 0) throw new Error('Invalid contact email reached the update RPC.');

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
  })) await managerDetails.getByLabel(label, { exact: true }).fill(value);
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
  await managerPage.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await managerDetailsAfterRefresh.getByText('যোগাযোগের তথ্য', { exact: true }).waitFor({ state: 'visible' });
  await managerDetailsAfterRefresh.getByText('অফিসিয়াল ইমেইল', { exact: true }).waitFor({ state: 'visible' });
  await managerPage.getByRole('button', { name: 'কর্মচারীর রেকর্ড বন্ধ করুন' }).click();
  if (managerContactReadCalls < 3) throw new Error(`Contact read recovery/refresh made too few RPC attempts: ${managerContactReadCalls}.`);

  const requestTenants = rpcPayloads.filter(value => value && typeof value.p_tenant_id === 'string').map(value => value.p_tenant_id);
  if (requestTenants.some(id => id !== process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID)) {
    throw new Error(`Employee directory requested a different tenant: ${requestTenants.join(', ')}.`);
  }
  console.log('Local Auth-to-Postgres employee directory and contact-editing journey passed with manager-only contact access, save/cancel/error recovery, persisted refresh, EN/BN parity, and 375px mobile/1280px desktop layouts.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
