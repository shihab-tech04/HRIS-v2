// Exercises the employee directory against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_EMPLOYEE_DIRECTORY_EMAIL', 'HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID',
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

async function signIn(page) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
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
  for (const marker of ['employee-a@hris.test', 'official_email', 'joining_date', 'gender']) {
    if (await page.getByText(marker, { exact: false }).count()) throw new Error(`Sensitive employee data was rendered: ${marker}.`);
  }
  if (forbiddenDirectoryReads.length) throw new Error(`Employee-only role triggered legacy directory reads: ${forbiddenDirectoryReads.join(', ')}.`);

  await page.getByLabel('Search employees').fill('Synthetic Employee A');
  const searchResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_employee_directory'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await searchResponse;
  await (await employeeInCurrentLayout(page, 'Synthetic Employee A')).waitFor({ state: 'visible' });
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

  const requestTenants = rpcPayloads.filter(value => value && typeof value.p_tenant_id === 'string').map(value => value.p_tenant_id);
  if (requestTenants.some(id => id !== process.env.HRIS_LOCAL_EMPLOYEE_DIRECTORY_TENANT_ID)) {
    throw new Error(`Employee directory requested a different tenant: ${requestTenants.join(', ')}.`);
  }
  console.log('Local Auth-to-Postgres employee directory journey passed at 375px mobile and 1280px desktop.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
