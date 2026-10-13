// Exercises the released-payslip journey against the disposable local Supabase
// Auth and Postgres stack established by run-local.mjs.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_PAYSLIP_EMAIL', 'HRIS_LOCAL_PAYSLIP_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48378';
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
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_PAYSLIP_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
}

async function openPayslips(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Payslips', exact: true }).click();
  await page.getByRole('heading', { name: 'My Payslips', exact: true }).waitFor({ state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let outagePending = true;
  let mockedOutageCount = 0;
  let rpcCalls = 0;
  const rpcTenants = [];
  const directPayslipTableReads = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
        && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_payslips')
        && route.request().method() === 'POST') {
      rpcCalls += 1;
      const body = route.request().postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
      if (outagePending) {
        outagePending = false;
        mockedOutageCount += 1;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary payslip outage.' }) });
        return;
      }
    }
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
        && /\/rest\/v1\/payslips(?:\?|$)/.test(url.pathname + url.search)) {
      directPayslipTableReads.push(url.pathname + url.search);
    }
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await signIn(page);
  await openPayslips(page);
  await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible' });
  if (rpcCalls !== 1 || mockedOutageCount !== 1) {
    throw new Error(`Expected one synthetic initial RPC outage before retry; calls=${rpcCalls}, mockedOutages=${mockedOutageCount}.`);
  }
  await assertNoOverflow(page, 'Mobile payslip error');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const history = page.getByLabel('Released payslip history');
  const september = history.locator('article[data-payslip="99999999-0000-4000-8000-000000000101"]');
  await september.waitFor({ state: 'visible' });
  await september.getByText('September 2026', { exact: true }).waitFor({ state: 'visible' });
  const summaryAmounts = september.locator('dl').first();
  await summaryAmounts.getByText(/152,000\.00/).waitFor({ state: 'visible' });
  await summaryAmounts.getByText(/167,000\.00/).waitFor({ state: 'visible' });
  if (await history.locator('article[data-payslip]').count() !== 1) throw new Error('The employee saw unexpected payslip rows.');
  await assertNoOverflow(page, 'Mobile payslip history');
  await september.locator('summary').click();
  await september.getByRole('region', { name: 'Earnings' }).waitFor({ state: 'visible' });
  await september.getByRole('region', { name: 'Deductions' }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Mobile payslip breakdown');
  const visibleBody = await page.locator('body').innerText();
  for (const privateValue of ['Synthetic Account 001', 'SYN-TAX-001', 'Synthetic Bank']) {
    if (visibleBody.includes(privateValue)) throw new Error(`Private source field was rendered: ${privateValue}.`);
  }

  await page.getByRole('button', { name: 'Refresh payslips' }).click();
  await summaryAmounts.getByText(/152,000\.00/).waitFor({ state: 'visible' });
  const refreshButton = page.getByRole('button', { name: 'Refresh payslips' });
  await refreshButton.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === 'Refresh payslips');
    return button && !button.disabled;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'My Payslips', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Desktop payslip history');
  if (rpcCalls !== 3 || rpcTenants.length !== 3 || rpcTenants.some(id => id !== process.env.HRIS_LOCAL_PAYSLIP_TENANT_ID)) {
    throw new Error(`Expected the failure, retry, and refresh to use the employee tenant RPC; calls=${rpcCalls}, tenants=${JSON.stringify(rpcTenants)}.`);
  }
  if (directPayslipTableReads.length) throw new Error(`UI bypassed the scoped RPC with direct payslip reads: ${directPayslipTableReads.join(', ')}.`);
  console.log('Local Auth-to-Postgres employee payslip journey passed: outage retry, released period and persisted amounts, private-field omission, refresh recovery, and 375px mobile/1280px desktop layouts.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
