// Runs employee and manager travel journeys against disposable local Auth/Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_TRAVEL_EMPLOYEE_EMAIL', 'HRIS_LOCAL_TRAVEL_MANAGER_EMAIL', 'HRIS_LOCAL_TRAVEL_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48377';
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

async function signIn(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (await page.evaluate(() => window.innerWidth) < 1024) {
    await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  } else {
    await page.getByRole('navigation', { name: 'HRIS modules' }).waitFor({ state: 'visible' });
  }
}

async function navigateTo(page, label) {
  const nav = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await nav.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await nav.getByRole('button', { name: label, exact: true }).click();
}

async function rpcUuid(response) {
  const value = await response.json();
  if (!response.ok || typeof value !== 'string') throw new Error(`Travel RPC did not persist an ID: ${JSON.stringify(value)}.`);
  return value;
}

async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(size)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employeePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const directTravelEndpoints = [];
  employeePage.on('request', request => {
    const url = new URL(request.url());
    if (/\/rest\/v1\/(travel_requests|travel_status_history)(\?|$)/.test(url.pathname + url.search)) {
      directTravelEndpoints.push(`${request.method()} ${url.pathname}`);
    }
  });
  await isolateExternalRequests(employeePage);
  await signIn(employeePage, process.env.HRIS_LOCAL_TRAVEL_EMPLOYEE_EMAIL);
  await navigateTo(employeePage, 'My Travel');
  await employeePage.getByRole('heading', { name: 'My Travel Requests' }).waitFor({ state: 'visible' });
  await employeePage.getByRole('button', { name: 'New travel request', exact: true }).waitFor({ state: 'visible' });

  await employeePage.getByRole('button', { name: 'New travel request', exact: true }).click();
  await employeePage.getByRole('button', { name: 'Cancel', exact: true }).click();
  await employeePage.getByRole('dialog').waitFor({ state: 'detached' });
  await employeePage.getByRole('button', { name: 'New travel request', exact: true }).click();
  const destination = `Local QA visit ${Date.now()}`;
  await employeePage.getByLabel('Destination').fill(destination);
  await employeePage.getByLabel('Departure date').fill('2026-12-10');
  await employeePage.getByLabel('Return date').fill('2026-12-12');
  await employeePage.getByLabel('Purpose').fill('Complete the isolated employee and manager travel journey.');
  await employeePage.getByLabel('Estimated cost').fill('825');
  await employeePage.getByLabel('Currency').fill('BDT');
  const draftResponse = employeePage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_my_travel_request'));
  await employeePage.getByRole('button', { name: 'Save draft', exact: true }).click();
  const requestId = await rpcUuid(await draftResponse);
  const employeeCard = employeePage.locator(`[data-travel-request="${requestId}"]`);
  await employeeCard.waitFor({ state: 'visible' });
  await employeeCard.getByText('Draft', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('825 BDT', { exact: false }).waitFor({ state: 'visible' });
  await assertNoOverflow(employeePage, 'Travel draft mobile');

  const submitResponse = employeePage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_my_travel_request'));
  await employeeCard.getByRole('button', { name: 'Submit for review' }).click();
  if (await rpcUuid(await submitResponse) !== requestId) throw new Error('Submitted travel request ID changed.');
  await employeeCard.getByText('Submitted', { exact: true }).waitFor({ state: 'visible' });

  const managerPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const managerRpcTrace = [];
  managerPage.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/rest/v1/rpc/')) managerRpcTrace.push(`request ${request.method()} ${url.pathname}`);
  });
  managerPage.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/rest/v1/rpc/')) managerRpcTrace.push(`response ${response.status()} ${url.pathname}`);
  });
  managerPage.on('pageerror', error => managerRpcTrace.push(`pageerror ${error.message}`));
  await isolateExternalRequests(managerPage);
  await signIn(managerPage, process.env.HRIS_LOCAL_TRAVEL_MANAGER_EMAIL);
  await navigateTo(managerPage, 'Travel requests');
  await managerPage.getByRole('heading', { name: 'Travel requests', exact: true }).waitFor({ state: 'visible' });
  const managerCard = managerPage.locator(`[data-travel-queue-request="${requestId}"]`);
  await managerCard.waitFor({ state: 'visible' });
  await managerCard.getByRole('heading', { name: destination }).waitFor({ state: 'visible' });
  await managerCard.getByRole('button', { name: 'Return for changes' }).click();
  await managerPage.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await managerCard.waitFor({ state: 'visible' });
  await managerCard.getByRole('button', { name: 'Return for changes' }).click();
  await managerPage.getByRole('alertdialog').getByLabel('Note').fill('Please clarify the visit objective.');
  const rejectResponsePromise = managerPage.waitForResponse(
    response => response.url().includes('/rest/v1/rpc/hris_resolve_travel_request'), { timeout: 10000 },
  );
  let rejectResponse;
  try {
    await managerPage.getByRole('alertdialog').getByRole('button', { name: 'Confirm return' }).click();
    rejectResponse = await rejectResponsePromise;
  } catch (cause) {
    await rejectResponsePromise.catch(() => {});
    throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; manager RPC trace: ${JSON.stringify(managerRpcTrace)}`);
  }
  const rejected = await rejectResponse.json();
  if (!rejectResponse.ok() || rejected?.id !== requestId || rejected?.status !== 'rejected') {
    throw new Error(`Manager return was not confirmed: ${JSON.stringify(rejected)}.`);
  }
  await managerCard.waitFor({ state: 'detached' });
  await assertNoOverflow(managerPage, 'Travel manager queue desktop');

  await employeePage.getByRole('button', { name: 'Refresh my travel requests' }).click();
  await employeeCard.getByText('Returned for changes', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('Reviewer note: Please clarify the visit objective.', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByRole('button', { name: 'Revise request' }).click();
  await employeePage.getByLabel('Purpose').fill('Clarified objective: review the delivery work with the client team.');
  const reviseResponse = employeePage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_my_travel_request'));
  await employeePage.getByRole('button', { name: 'Save draft', exact: true }).click();
  if (await rpcUuid(await reviseResponse) !== requestId) throw new Error('Revised travel request did not retain its ID.');
  await employeeCard.getByText('Draft', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('Reviewer note: Please clarify the visit objective.', { exact: true }).waitFor({ state: 'visible' });
  const resubmitResponse = employeePage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_my_travel_request'));
  await employeeCard.getByRole('button', { name: 'Submit for review' }).click();
  await rpcUuid(await resubmitResponse);
  await employeeCard.getByText('Submitted', { exact: true }).waitFor({ state: 'visible' });

  await managerPage.setViewportSize({ width: 375, height: 812 });
  await managerPage.getByRole('button', { name: 'Refresh travel requests' }).click();
  await managerCard.waitFor({ state: 'visible' });
  await managerCard.getByRole('button', { name: 'Approve', exact: true }).click();
  const approveResponsePromise = managerPage.waitForResponse(
    response => response.url().includes('/rest/v1/rpc/hris_resolve_travel_request'), { timeout: 10000 },
  );
  let approveResponse;
  try {
    await managerPage.getByRole('alertdialog').getByRole('button', { name: 'Confirm approval' }).click();
    approveResponse = await approveResponsePromise;
  } catch (cause) {
    await approveResponsePromise.catch(() => {});
    throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; manager RPC trace: ${JSON.stringify(managerRpcTrace)}`);
  }
  const approved = await approveResponse.json();
  if (!approveResponse.ok() || approved?.id !== requestId || approved?.status !== 'approved') throw new Error(`Manager approval was not confirmed: ${JSON.stringify(approved)}.`);
  await managerCard.waitFor({ state: 'detached' });
  await assertNoOverflow(managerPage, 'Travel manager queue mobile');

  await employeePage.setViewportSize({ width: 1280, height: 900 });
  await employeePage.getByRole('button', { name: 'Refresh my travel requests' }).click();
  await employeeCard.getByText('Approved', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('Clarified objective: review the delivery work with the client team.', { exact: false }).waitFor({ state: 'visible' });
  await employeeCard.getByText('Request history', { exact: true }).click();
  await employeeCard.getByText('Submitted → Returned for changes', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('Submitted → Approved', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employeePage, 'Travel history desktop');
  if (directTravelEndpoints.length) throw new Error(`Travel UI bypassed tenant-scoped RPCs: ${directTravelEndpoints.join(', ')}.`);
  console.log(`TRAVEL_ACCEPTANCE_ID=${requestId}`);
  console.log('Local Auth-to-Postgres travel workflow persisted employee draft, submission, manager return, employee recovery, resubmission, approval, and history across mobile and desktop.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
