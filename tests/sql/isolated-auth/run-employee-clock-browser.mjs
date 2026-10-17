// Exercises employee web check-in/out against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_CLOCK_EMPLOYEE_EMAIL', 'HRIS_LOCAL_CLOCK_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing isolated clock setting ${key}.`);

const repo = process.cwd();
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select an available loopback port for the clock journey.')));
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
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error('Timed out waiting for the isolated employee clock UI.');
}

async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(size)}.`);
}

const eventCalls = [];
let failNextClockIn = true;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/rpc/hris_employee_record_attendance_event') && request.method() === 'POST') {
      const payload = request.postDataJSON();
      eventCalls.push({ tenant: payload?.p_tenant_id, event: payload?.p_event });
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (failNextClockIn && url.pathname.endsWith('/rest/v1/rpc/hris_employee_record_attendance_event')
          && route.request().method() === 'POST'
          && route.request().postDataJSON()?.p_event === 'check_in') {
        failNextClockIn = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic one-time attendance failure.',
        }) });
        return;
      }
      return route.continue();
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_CLOCK_EMPLOYEE_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  const today = page.locator('section[aria-labelledby="employee-today-heading"]');
  await today.getByText('You have not checked in today.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, '375px employee check-in');

  const failedMutation = page.waitForResponse(response =>
    response.url().endsWith('/rest/v1/rpc/hris_employee_record_attendance_event') && response.status() === 503);
  await today.getByRole('button', { name: 'Check in', exact: true }).click();
  await failedMutation;
  await today.getByRole('alert').getByText('Synthetic one-time attendance failure.', { exact: true }).waitFor({ state: 'visible' });
  await today.getByText('You have not checked in today.', { exact: true }).waitFor({ state: 'visible' });
  if (failNextClockIn) throw new Error('The one-time check-in failure was not injected.');

  const checkInResponse = page.waitForResponse(response =>
    response.url().endsWith('/rest/v1/rpc/hris_employee_record_attendance_event') && response.status() === 200);
  await today.getByRole('button', { name: 'Check in', exact: true }).click();
  await checkInResponse;
  await today.getByRole('status').getByText('You are checked in for today.', { exact: true }).waitFor({ state: 'visible' });
  await today.getByText(/Checked in at/).waitFor({ state: 'visible' });
  await today.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await today.getByRole('button', { name: 'চেক-আউট করুন', exact: true }).waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, '1280px employee check-out');

  const checkOutResponse = page.waitForResponse(response =>
    response.url().endsWith('/rest/v1/rpc/hris_employee_record_attendance_event') && response.status() === 200);
  await today.getByRole('button', { name: 'চেক-আউট করুন', exact: true }).click();
  await checkOutResponse;
  await today.getByRole('status').getByText('আজকের জন্য আপনার চেক-আউট হয়েছে।', { exact: true }).waitFor({ state: 'visible' });
  await page.reload();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  const recoveredToday = page.locator('section[aria-labelledby="employee-today-heading"]');
  await recoveredToday.getByText(/পর্যন্ত উপস্থিতি নথিভুক্ত হয়েছে/).waitFor({ state: 'visible' });
  if (await recoveredToday.getByRole('button', { name: 'চেক-আউট করুন', exact: true }).count()) {
    throw new Error('A completed check-out returned to an actionable state after refresh.');
  }

  if (eventCalls.length !== 3 || eventCalls.some(call => call.tenant !== process.env.HRIS_LOCAL_CLOCK_TENANT_ID)
      || eventCalls.map(call => call.event).join(',') !== 'check_in,check_in,check_out') {
    throw new Error(`Unexpected tenant-scoped attendance actions: ${JSON.stringify(eventCalls)}.`);
  }
  console.log('E05-01_AUTH_POSTGRES_BROWSER_PASS');
  console.log('E05-02_AUTH_POSTGRES_BROWSER_PASS');
  console.log('E05-03_AUTH_POSTGRES_BROWSER_PASS');
  console.log('EMPLOYEE_CLOCK_BROWSER_ACCEPTANCE=PASS');
} finally {
  if (browser) await browser.close();
  await stopChildProcess(server);
}
