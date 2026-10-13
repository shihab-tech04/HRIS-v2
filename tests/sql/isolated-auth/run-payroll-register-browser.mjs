// Exercises the authorized payroll-view journey against disposable local
// Supabase Auth and Postgres established by run-local.mjs.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_PAYROLL_VIEWER_EMAIL', 'HRIS_LOCAL_PAYROLL_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48379';
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
    } catch { /* the local server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function signIn(page) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_PAYROLL_VIEWER_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
}

async function openRegister(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Payroll register', exact: true }).click();
  await page.getByRole('heading', { name: 'Payroll register', exact: true }).waitFor({ state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

async function waitForCards(page, count) {
  await page.waitForFunction(expected => {
    const list = document.querySelector('[aria-label="Tenant payroll register cards"]');
    return list && list.querySelectorAll('article[data-payslip]').length === expected;
  }, count);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let outagePending = true;
  let mockedOutageCount = 0;
  let rpcCalls = 0;
  const rpcTenants = [];
  const rpcRequestUrls = [];
  const directPayslipReads = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('hris_get_tenant_payroll_register')) rpcRequestUrls.push(`${route.request().method()} ${url.href}`);
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
        && url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_payroll_register')
        && route.request().method() === 'POST') {
      rpcCalls += 1;
      const body = route.request().postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
      if (outagePending) {
        outagePending = false;
        mockedOutageCount += 1;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic payroll register outage.' }) });
        return;
      }
    }
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
        && /\/rest\/v1\/payslips(?:\?|$)/.test(url.pathname + url.search)) directPayslipReads.push(url.pathname + url.search);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await signIn(page);
  await openRegister(page);
  const retry = page.getByRole('button', { name: 'Retry', exact: true });
  const cards = page.getByLabel('Tenant payroll register cards');
  const initialState = await Promise.race([
    retry.waitFor({ state: 'visible', timeout: 12000 }).then(() => 'retry').catch(() => null),
    cards.locator('article[data-payslip]').first().waitFor({ state: 'visible', timeout: 12000 }).then(() => 'rows').catch(() => null),
  ]);
  if (initialState !== 'retry' || rpcCalls !== 1 || mockedOutageCount !== 1) {
    throw new Error(`Expected one mocked initial RPC outage and visible Retry; state=${initialState}, calls=${rpcCalls}, mocked=${mockedOutageCount}, requests=${JSON.stringify(rpcRequestUrls)}, page=${(await page.locator('body').innerText()).slice(-1200)}.`);
  }
  await assertNoOverflow(page, 'Mobile payroll register error');
  await retry.click();
  await cards.locator('article[data-payslip]').first().waitFor({ state: 'visible' });
  if (await cards.locator('article[data-payslip]').count() !== 3) throw new Error('Payroll viewer did not receive the three expected tenant A rows.');
  await page.getByText('Read only', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Mobile payroll register cards');

  await page.getByLabel('Search payroll employees').fill('QA-A-001');
  await page.getByRole('button', { name: 'Apply search' }).click();
  await waitForCards(page, 2);
  await page.getByLabel('Filter payroll by payslip status').selectOption('released');
  await waitForCards(page, 1);
  await page.getByLabel('Filter payroll by pay period').selectOption('99999999-0000-4000-8000-000000000001');
  await waitForCards(page, 1);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await waitForCards(page, 3);
  const bodyText = await page.locator('body').innerText();
  for (const privateValue of ['Synthetic Account 001', 'SYN-TAX-001', 'Synthetic Bank']) {
    if (bodyText.includes(privateValue)) throw new Error(`Payroll register rendered an excluded private source field: ${privateValue}.`);
  }

  await page.getByRole('button', { name: 'Refresh payroll register' }).click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === 'Refresh payroll register');
    return button && !button.disabled;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const table = page.getByRole('table', { name: 'Tenant payroll register' });
  await table.waitFor({ state: 'visible' });
  if (await table.locator('tbody tr[data-payslip]').count() !== 3) throw new Error('Desktop register did not render the three authorized rows.');
  await assertNoOverflow(page, 'Desktop payroll register');
  if (rpcCalls !== 7 || rpcTenants.length !== 7 || rpcTenants.some(id => id !== process.env.HRIS_LOCAL_PAYROLL_TENANT_ID)) {
    throw new Error(`Expected seven tenant-scoped RPC calls (outage, retry, filters, clear, refresh); calls=${rpcCalls}, tenants=${JSON.stringify(rpcTenants)}.`);
  }
  if (directPayslipReads.length) throw new Error(`UI bypassed the scoped register RPC: ${directPayslipReads.join(', ')}.`);
  console.log('Local Auth-to-Postgres payroll-view journey passed: permission-gated register, outage retry, persisted employee rows, search/status/period filters, clear/refresh recovery, private-field omission, and 375px mobile/1280px desktop layouts.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
