// Exercises the existing HR-only candidate activation screen against the
// disposable Supabase Auth and Postgres stack established by run-local.mjs.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_HR01_EMPLOYEE_MANAGER_EMAIL', 'HRIS_LOCAL_HR01_EMPLOYEE_TENANT_ID',
  'HRIS_LOCAL_HR01_APPLICATION_ID', 'HRIS_LOCAL_HR01_CANDIDATE_NAME', 'HRIS_LOCAL_HR01_EMPLOYEE_NUMBER',
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
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_HR01_EMPLOYEE_MANAGER_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
}

async function openPreboardingQueue(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Onboarding', exact: true }).click();
  await page.getByRole('heading', { name: 'Preboarding handoffs', exact: true }).waitFor({ state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const activationCalls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/rpc/hris_activate_candidate_employee')) {
      activationCalls.push({ method: request.method(), payload: JSON.parse(request.postData() || '{}') });
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(page);
  await openPreboardingQueue(page);
  const candidateRow = page.getByText(process.env.HRIS_LOCAL_HR01_CANDIDATE_NAME, { exact: true }).locator('xpath=ancestor::li');
  await candidateRow.waitFor({ state: 'visible' });
  const packetRequest = page.waitForRequest(request => request.url().includes('/rest/v1/rpc/hris_get_candidate_preboarding_queue'));
  await page.getByRole('button', { name: 'Refresh preboarding handoffs', exact: true }).click();
  await packetRequest;
  await candidateRow.waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'HR01-01 preboarding mobile');
  await candidateRow.getByLabel('Employee number', { exact: true }).fill(process.env.HRIS_LOCAL_HR01_EMPLOYEE_NUMBER);
  await candidateRow.getByLabel('Confirm joining date', { exact: true }).fill('2020-01-01');
  await candidateRow.getByLabel('I verified the submitted details and confirm the employee number and joining date.', { exact: true }).check();
  const activationResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_activate_candidate_employee'));
  await candidateRow.getByRole('button', { name: 'Activate employee', exact: true }).click();
  const response = await activationResponse;
  const responseBody = await response.text();
  let payload;
  try { payload = JSON.parse(responseBody); }
  catch { payload = { response: responseBody }; }
  if (!response.ok()) throw new Error(`HR activation RPC failed with HTTP ${response.status()}: ${JSON.stringify(payload)}.`);
  if (payload?.success !== true || payload?.idempotent !== false || !payload?.employee_id) {
    throw new Error(`HR activation returned an unexpected result: ${JSON.stringify(payload)}.`);
  }
  await page.getByRole('status').getByText('Employee activated. The candidate keeps the same sign-in identity.', { exact: true }).waitFor({ state: 'visible' });
  await candidateRow.waitFor({ state: 'detached' });
  if (activationCalls.length !== 1 || activationCalls[0].method !== 'POST'
      || activationCalls[0].payload.p_tenant_id !== process.env.HRIS_LOCAL_HR01_EMPLOYEE_TENANT_ID
      || activationCalls[0].payload.p_application_id !== process.env.HRIS_LOCAL_HR01_APPLICATION_ID
      || activationCalls[0].payload.p_employee_number !== process.env.HRIS_LOCAL_HR01_EMPLOYEE_NUMBER
      || activationCalls[0].payload.p_joining_date !== '2020-01-01'
      || activationCalls[0].payload.p_details_verified !== true) {
    throw new Error(`Expected one authenticated activation POST, observed ${JSON.stringify(activationCalls)}.`);
  }
  await assertNoOverflow(page, 'HR01-01 activation result mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'HR01-01 activation result desktop');
  console.log('HR01-01_PARTIAL_CANDIDATE_ACTIVATION_BROWSER_PASS');
  console.log('X03-07_PARTIAL_HR_ONBOARDING_ACTIVATION_BROWSER_PASS');
  console.log('X03-08_PARTIAL_CANDIDATE_DATA_REUSE_BROWSER_PASS');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
