// Exercises project-allocation submission, per-project review, and scoped
// rejected-portion correction using disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_TIMESHEET_EMPLOYEE_EMAIL', 'HRIS_LOCAL_TIMESHEET_MANAGER_EMAIL',
  'HRIS_LOCAL_TIMESHEET_TENANT_ID', 'HRIS_LOCAL_TIMESHEET_ALLOCATION_ID',
  'HRIS_LOCAL_TIMESHEET_PROJECT_NAME', 'HRIS_LOCAL_TIMESHEET_WORK_DATE',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select an available loopback port for the timesheet browser journey.')));
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
let serverStderr = '';
let serverSpawnError = '';
server.stderr.on('data', chunk => { serverStderr = `${serverStderr}${chunk.toString()}`.slice(-4000); });
server.on('error', error => { serverSpawnError = error.message; });

function safeServerDiagnostic() {
  let diagnostic = serverStderr;
  for (const key of required) {
    const value = process.env[key];
    if (value) diagnostic = diagnostic.replaceAll(value, '[REDACTED]');
  }
  return diagnostic.replace(/\beyJ[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:sb_secret|sb_publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
    .replace(/(authorization:\s*bearer\s+)\S+/gi, '$1[REDACTED]').trim().slice(-1200);
}

let browser;
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverSpawnError) throw new Error(`Local Vite server could not start: ${serverSpawnError}.`);
    if (server.exitCode !== null) {
      const diagnostic = safeServerDiagnostic();
      throw new Error(`Local Vite server exited with ${server.exitCode}.${diagnostic ? ` Startup diagnostic: ${diagnostic}` : ''}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server is starting */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
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

async function signIn(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible', timeout: 15000 });
}

async function openPage(page, label) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: label, exact: true }).click();
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

let employeeSaveOutage = true;
let employeeCorrectionOutage = true;
let managerQueueOutage = true;
const calls = [];
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employeePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await isolateExternalRequests(employeePage);
  await employeePage.route('**/rest/v1/rpc/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    calls.push(endpoint);
    if (endpoint === 'hris_save_my_timesheet' && employeeSaveOutage) {
      employeeSaveOutage = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic timesheet draft outage.' }) });
    }
    if (endpoint === 'hris_resubmit_rejected_project_timesheet' && employeeCorrectionOutage) {
      employeeCorrectionOutage = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic project correction outage.' }) });
    }
    return route.continue();
  });
  await signIn(employeePage, process.env.HRIS_LOCAL_TIMESHEET_EMPLOYEE_EMAIL);
  await openPage(employeePage, 'My Timesheets');
  await employeePage.getByRole('button', { name: 'New timesheet', exact: true }).click();
  await employeePage.getByLabel('Period type', { exact: true }).selectOption('daily');
  await employeePage.getByLabel('Period start', { exact: true }).fill(process.env.HRIS_LOCAL_TIMESHEET_WORK_DATE);
  await employeePage.getByRole('button', { name: 'Add entry', exact: true }).click();
  await employeePage.getByLabel('Activity', { exact: true }).selectOption({ label: 'QA Project Work · QA-PROJECT' });
  await employeePage.getByLabel('Project allocation (required)', { exact: true }).selectOption(process.env.HRIS_LOCAL_TIMESHEET_ALLOCATION_ID);
  await employeePage.getByLabel('Work date', { exact: true }).fill(process.env.HRIS_LOCAL_TIMESHEET_WORK_DATE);
  await employeePage.getByLabel('Hours', { exact: true }).fill('3');
  const marker = 'Synthetic project timesheet browser acceptance';
  await employeePage.getByLabel('Note (optional)', { exact: true }).fill(marker);
  await employeePage.getByRole('button', { name: 'Save draft', exact: true }).click();
  await employeePage.getByRole('alert').filter({ hasText: 'Synthetic timesheet draft outage.' }).waitFor({ state: 'visible' });
  const timesheetCard = employeePage.locator('[data-timesheet-id]').filter({ hasText: marker });
  await employeePage.getByRole('button', { name: 'Save draft', exact: true }).click();
  await employeePage.getByText('Timesheet draft saved.', { exact: true }).waitFor({ state: 'visible' });
  await timesheetCard.waitFor({ state: 'visible' });
  await timesheetCard.getByRole('button', { name: 'Submit timesheet', exact: true }).click();
  await employeePage.getByText('Timesheet submitted for review.', { exact: true }).waitFor({ state: 'visible' });
  await employeePage.reload();
  await openPage(employeePage, 'My Timesheets');
  const persistedCard = employeePage.locator('[data-timesheet-id]').filter({ hasText: marker });
  await persistedCard.getByText('Submitted', { exact: true }).waitFor({ state: 'visible' });
  await noOverflow(employeePage, 'employee timesheet mobile view');

  const managerPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await isolateExternalRequests(managerPage);
  await managerPage.route('**/rest/v1/rpc/hris_get_my_project_timesheet_reviews', async route => {
    if (managerQueueOutage) {
      managerQueueOutage = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic project review queue outage.' }) });
    }
    return route.continue();
  });
  await signIn(managerPage, process.env.HRIS_LOCAL_TIMESHEET_MANAGER_EMAIL);
  await openPage(managerPage, 'My Projects');
  const reviewSection = managerPage.locator('section[aria-labelledby="project-timesheet-reviews-heading"]');
  await managerPage.getByRole('alert').filter({ hasText: 'Synthetic project review queue outage.' }).waitFor({ state: 'visible' });
  await reviewSection.getByRole('button', { name: 'Retry', exact: true }).click();
  const reviewCard = reviewSection.locator('article').filter({ hasText: marker });
  await reviewCard.getByText(process.env.HRIS_LOCAL_TIMESHEET_PROJECT_NAME, { exact: true }).waitFor({ state: 'visible' });
  await managerPage.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await managerPage.getByRole('heading', { name: 'প্রকল্প টাইমশিট পর্যালোচনা', exact: true }).waitFor({ state: 'visible' });
  await managerPage.getByRole('button', { name: 'Switch language to English' }).click();
  await managerPage.getByLabel('Rejection reason (required when rejecting)', { exact: true }).fill('Please adjust the project estimate.');
  await managerPage.getByRole('button', { name: 'Reject project hours', exact: true }).click();
  await reviewCard.getByText('Rejected', { exact: true }).waitFor({ state: 'visible' });
  await noOverflow(managerPage, 'project review mobile view');

  await employeePage.getByRole('button', { name: 'Refresh', exact: true }).click();
  await persistedCard.getByText('Rejected', { exact: true }).waitFor({ state: 'visible' });
  await persistedCard.getByRole('button', { name: 'Correct this project portion', exact: true }).click();
  await employeePage.getByLabel('Hours', { exact: true }).fill('4');
  await employeePage.getByLabel('Note (optional)', { exact: true }).fill(`${marker} corrected`);
  await employeePage.getByRole('button', { name: 'Save and resubmit project hours', exact: true }).click();
  await employeePage.getByRole('alert').filter({ hasText: 'Synthetic project correction outage.' }).waitFor({ state: 'visible' });
  await employeePage.getByRole('button', { name: 'Save and resubmit project hours', exact: true }).click();
  await employeePage.getByText('Project hours corrected and resubmitted.', { exact: true }).waitFor({ state: 'visible' });
  await persistedCard.getByText('Submitted', { exact: true }).waitFor({ state: 'visible' });

  await managerPage.setViewportSize({ width: 1280, height: 900 });
  await reviewSection.getByRole('button', { name: 'Refresh', exact: true }).click();
  await reviewCard.getByText('Feedback pending', { exact: true }).waitFor({ state: 'visible' });
  await managerPage.getByRole('button', { name: 'Approve project hours', exact: true }).click();
  await reviewCard.getByText('Approved', { exact: true }).waitFor({ state: 'visible' });
  await noOverflow(managerPage, 'project review desktop view');

  await employeePage.setViewportSize({ width: 1280, height: 900 });
  await employeePage.getByRole('button', { name: 'Refresh', exact: true }).click();
  await persistedCard.getByText('Approved', { exact: true }).waitFor({ state: 'visible' });
  await noOverflow(employeePage, 'employee timesheet desktop view');

  if (employeeSaveOutage || employeeCorrectionOutage || managerQueueOutage) throw new Error('The browser recovery path did not exercise every injected outage.');
  if (!calls.includes('hris_resubmit_rejected_project_timesheet')) throw new Error('The employee correction did not use the project-scoped resubmission RPC.');
  console.log('Real Auth/Postgres project timesheet journey passed: allocation-bound submission, PM-only rejection/approval, scoped correction, outage retry, refresh persistence, EN/BN, and 375px/1280px layouts.');
} finally {
  if (browser) await browser.close();
  await stopChildProcess(server);
}
