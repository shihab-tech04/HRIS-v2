// Verifies the holiday administration journey against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_HOLIDAY_MANAGER_EMAIL', 'HRIS_LOCAL_HOLIDAY_TENANT_ID',
  'HRIS_LOCAL_HOLIDAY_EMPLOYEE_EMAIL',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48377';
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
  throw new Error('Timed out waiting for the local holiday UI server.');
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let failInitialCalendarRead = true;
  const tenantIds = [];
  const calendarRpcPaths = [];
  const directHolidayTableRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/rest\/v1\/rpc\/hris_(?:get_org_holiday_calendar|save_org_holiday)$/.test(url.pathname)
        && request.method() === 'POST') {
      calendarRpcPaths.push(url.pathname);
      const body = request.postDataJSON();
      if (body?.p_tenant_id) tenantIds.push(body.p_tenant_id);
    }
    if (/\/rest\/v1\/holidays(?:\?|$)/.test(url.pathname + url.search)) directHolidayTableRequests.push(url.pathname);
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (failInitialCalendarRead && url.pathname.endsWith('/rest/v1/rpc/hris_get_org_holiday_calendar')
          && route.request().method() === 'POST') {
        failInitialCalendarRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary holiday calendar outage.' }) });
        return;
      }
      return route.continue();
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  page.on('dialog', dialog => dialog.accept());

  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_HOLIDAY_MANAGER_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Holiday calendar', exact: true }).click();
  await page.getByRole('heading', { name: 'Holiday calendar', exact: true }).waitFor({ state: 'visible' });
  const outageAlert = page.getByRole('alert');
  try {
    await outageAlert.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    throw new Error(`Holiday outage recovery state was not shown. Injected=${!failInitialCalendarRead}; RPC paths=${JSON.stringify(calendarRpcPaths)}; page=${(await page.locator('main').innerText()).slice(0, 700)}.`);
  }
  if (failInitialCalendarRead) throw new Error(`The synthetic outage was not injected. RPC paths=${JSON.stringify(calendarRpcPaths)}.`);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByText('Loading holiday calendar…', { exact: true }).waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await page.getByRole('heading', { name: 'ছুটির ক্যালেন্ডার', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'ছুটি যোগ করুন', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: 'ছুটির ক্যালেন্ডার খুঁজুন' }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Holiday calendar mobile Bengali');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Holiday calendar desktop Bengali');
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.getByRole('heading', { name: 'Holiday calendar', exact: true }).waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 375, height: 812 });

  await page.getByRole('button', { name: 'Add holiday', exact: true }).first().click();
  const form = page.locator('form[aria-labelledby="holiday-form-heading"]');
  await form.waitFor({ state: 'visible' });
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (await form.isVisible()) throw new Error('Cancelling the holiday form should close it without saving.');

  const title = `Local Browser Holiday ${Date.now()}`;
  const startDate = '2099-12-20';
  await page.getByRole('button', { name: 'Add holiday', exact: true }).first().click();
  await page.locator('#holiday-name').fill(title);
  await page.getByLabel('Type', { exact: true }).fill('Synthetic QA');
  await page.getByLabel('Start date *', { exact: true }).fill(startDate);
  await page.getByLabel('End date *', { exact: true }).fill(startDate);
  await form.getByRole('button', { name: 'Add holiday', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Holiday added to the organization calendar.' }).waitFor({ state: 'visible' });
  const search = page.getByRole('textbox', { name: 'Search holiday calendar' });
  await search.fill(title);
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: `Edit ${title}` }).click();
  await page.getByLabel('Description', { exact: true }).fill('Saved from the local responsive acceptance journey.');
  await page.locator('form[aria-labelledby="holiday-form-heading"]').getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Holiday updated.' }).waitFor({ state: 'visible' });
  await page.getByText('Saved from the local responsive acceptance journey.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Holiday calendar mobile');

  await page.getByRole('button', { name: `Deactivate ${title}` }).click();
  await page.getByRole('status').filter({ hasText: 'Holiday deactivated.' }).waitFor({ state: 'visible' });
  await page.getByLabel('Filter holiday status').selectOption('inactive');
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: `Activate ${title}` }).click();
  await page.getByRole('status').filter({ hasText: 'Holiday activated.' }).waitFor({ state: 'visible' });
  await page.getByLabel('Filter holiday status').selectOption('active');
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Refresh holiday calendar' }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'visible' });

  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Holiday calendar desktop');
  await search.fill('no such synthetic holiday');
  await page.getByRole('heading', { name: 'No holidays match this search', exact: true }).waitFor({ state: 'visible' });
  if (tenantIds.length < 5 || tenantIds.some(id => id !== process.env.HRIS_LOCAL_HOLIDAY_TENANT_ID)) {
    throw new Error(`Holiday RPC tenant scope was unexpected: ${JSON.stringify(tenantIds)}.`);
  }
  if (directHolidayTableRequests.length) throw new Error(`Holiday UI bypassed RPCs: ${JSON.stringify(directHolidayTableRequests)}.`);

  const employeePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const employeeDashboardTenantIds = [];
  const employeeDirectHolidayTableRequests = [];
  employeePage.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_dashboard_data') && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) employeeDashboardTenantIds.push(body.p_tenant_id);
    }
    if (/\/rest\/v1\/holidays(?:\?|$)/.test(url.pathname + url.search)) employeeDirectHolidayTableRequests.push(url.pathname);
  });
  await employeePage.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await employeePage.goto(origin);
  await employeePage.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_HOLIDAY_EMPLOYEE_EMAIL);
  await employeePage.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await employeePage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await employeePage.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const employeeNavigation = employeePage.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await employeeNavigation.isVisible())) await employeePage.getByRole('button', { name: 'Open navigation menu' }).click();
  await employeeNavigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await employeePage.getByRole('heading', { name: 'Upcoming holidays', exact: true }).waitFor({ state: 'visible' });
  await employeePage.getByText(title, { exact: true }).waitFor({ state: 'visible' });
  if (await employeePage.getByText('Synthetic QA holiday B', { exact: true }).count()) {
    throw new Error('The employee holiday view exposed a holiday from another tenant.');
  }
  if (!employeeDashboardTenantIds.length
      || employeeDashboardTenantIds.some(id => id !== process.env.HRIS_LOCAL_HOLIDAY_TENANT_ID)) {
    throw new Error(`Employee dashboard tenant scope was unexpected: ${JSON.stringify(employeeDashboardTenantIds)}.`);
  }
  if (employeeDirectHolidayTableRequests.length) {
    throw new Error(`Employee holiday view bypassed the linked-employee dashboard RPC: ${JSON.stringify(employeeDirectHolidayTableRequests)}.`);
  }
  await assertNoOverflow(employeePage, 'Employee holiday view mobile');
  console.log('Local Auth/Postgres holiday calendar journey passed: outage retry, cancel, manager create/edit/deactivate/activate, EN/BN mobile/desktop, persisted employee upcoming-holiday visibility, tenant isolation, and refresh.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
