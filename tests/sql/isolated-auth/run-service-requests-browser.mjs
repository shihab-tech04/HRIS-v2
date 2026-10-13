// Runs an employee service-request submission and refresh-recovery journey on disposable local Auth/Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_SERVICE_EMPLOYEE_EMAIL',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48379';
const origin = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: repo,
  env: { ...process.env, VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY },
  stdio: 'ignore',
});
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function isolateExternalRequests(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
}

async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(size)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employee = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await isolateExternalRequests(employee);
  await employee.goto(origin);
  await employee.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_SERVICE_EMPLOYEE_EMAIL);
  await employee.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await employee.getByRole('button', { name: 'Sign in', exact: true }).click();
  await employee.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const nav = employee.getByRole('navigation', { name: 'HRIS modules' });
  await employee.getByRole('button', { name: 'Open navigation menu' }).click();
  await nav.getByRole('button', { name: 'My Requests', exact: true }).click();
  await employee.getByRole('heading', { name: 'My Service Requests', exact: true }).waitFor({ state: 'visible' });

  await employee.getByLabel('Reason or details').fill('This entry should be cleared without being sent.');
  const initialCount = await employee.locator('[data-service-request]').count();
  await employee.getByRole('button', { name: 'Clear', exact: true }).click();
  if (await employee.getByLabel('Reason or details').inputValue()) throw new Error('Clear did not cancel the unsent request text.');
  if (await employee.locator('[data-service-request]').count() !== initialCount) throw new Error('Clearing the form changed persisted requests.');

  const reason = `Local employee service request ${Date.now()}`;
  await employee.getByLabel('Request type').selectOption({ label: 'Employment certificate' });
  await employee.getByLabel('Reason or details').fill(reason);
  const submitResponsePromise = employee.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_my_service_request'));
  await employee.getByRole('button', { name: 'Submit request', exact: true }).click();
  const response = await submitResponsePromise;
  const saved = await response.json();
  if (!response.ok() || !saved?.id || saved.status !== 'pending') {
    throw new Error(`Service request did not persist as pending: ${JSON.stringify(saved)}.`);
  }
  const card = employee.locator(`[data-service-request="${saved.id}"]`);
  await card.waitFor({ state: 'visible' });
  await card.getByText(reason, { exact: true }).waitFor({ state: 'visible' });
  await card.getByText('Pending', { exact: true }).waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'Refresh my service requests' }).click();
  await card.getByText(reason, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Service request mobile');
  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employee, 'Service request desktop');

  console.log(`SERVICE_REQUEST_ACCEPTANCE_ID=${saved.id}`);
  console.log('Local employee service-request submission and refreshed status history persisted across mobile and desktop.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
