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

async function switchLanguage(page, locale) {
  await page.getByRole('button', {
    name: locale === 'bn' ? 'Switch language to Bengali' : 'Switch language to English',
  }).click();
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
  let personalContextReads = 0;
  await employeePage.route('**/rest/v1/rpc/hris_get_my_travel_context', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    personalContextReads += 1;
    if (personalContextReads === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, prefer',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
        body: JSON.stringify({ message: 'Temporary test outage' }),
      });
    }
    return route.continue();
  });
  const outageResponse = employeePage.waitForResponse(response =>
    response.url().includes('/rest/v1/rpc/hris_get_my_travel_context') && response.status() === 503);
  await navigateTo(employeePage, 'My Travel');
  await employeePage.getByRole('heading', { name: 'My Travel Requests' }).waitFor({ state: 'visible' });
  await outageResponse;
  const loadError = employeePage.getByRole('alert');
  await loadError.waitFor({ state: 'visible' });
  if (!(await loadError.innerText()).trim()) throw new Error('The failed travel load must present a readable recovery message.');
  if (personalContextReads !== 1) throw new Error(`Expected the first travel context read to fail, got ${personalContextReads} reads.`);
  await employeePage.getByRole('button', { name: 'Retry', exact: true }).click();
  await employeePage.getByRole('alert').waitFor({ state: 'detached' });
  if (personalContextReads !== 2) throw new Error(`Expected one failed and one successful history read, got ${personalContextReads}.`);
  await employeePage.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await employeePage.getByRole('heading', { name: 'আমার ভ্রমণ অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  await employeePage.getByRole('button', { name: 'নতুন ভ্রমণ অনুরোধ', exact: true }).waitFor({ state: 'visible' });

  await employeePage.getByRole('button', { name: 'নতুন ভ্রমণ অনুরোধ', exact: true }).click();
  await employeePage.getByRole('button', { name: 'বাতিল', exact: true }).click();
  await employeePage.getByRole('dialog').waitFor({ state: 'detached' });
  await employeePage.getByRole('button', { name: 'নতুন ভ্রমণ অনুরোধ', exact: true }).click();
  const destination = `Local QA visit ${Date.now()}`;
  await employeePage.getByLabel('গন্তব্য').fill(destination);
  await employeePage.getByLabel('যাত্রার তারিখ').fill('2026-12-10');
  await employeePage.getByLabel('ফেরার তারিখ').fill('2026-12-12');
  await employeePage.getByLabel('উদ্দেশ্য').fill('Complete the isolated employee and manager travel journey.');
  await employeePage.getByLabel('আনুমানিক খরচ').fill('825');
  await employeePage.getByLabel('মুদ্রা').fill('BDT');
  const draftResponse = employeePage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_my_travel_request'));
  await employeePage.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  const requestId = await rpcUuid(await draftResponse);
  const employeeCard = employeePage.locator(`[data-travel-request="${requestId}"]`);
  await employeeCard.waitFor({ state: 'visible' });
  await employeeCard.getByText('খসড়া', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText(/৮২৫ BDT/).waitFor({ state: 'visible' });
  await assertNoOverflow(employeePage, 'Travel draft mobile');

  const submitResponse = employeePage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_my_travel_request'));
  await employeeCard.getByRole('button', { name: 'পর্যালোচনার জন্য জমা দিন' }).click();
  if (await rpcUuid(await submitResponse) !== requestId) throw new Error('Submitted travel request ID changed.');
  await employeeCard.getByText('জমা দেওয়া হয়েছে', { exact: true }).waitFor({ state: 'visible' });

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
  const managerQueueLoad = managerPage.waitForResponse(response =>
    response.url().includes('/rest/v1/rpc/hris_get_tenant_travel_requests') && response.status() === 200);
  await navigateTo(managerPage, 'Travel requests');
  await managerPage.getByRole('heading', { name: 'Travel requests', exact: true }).waitFor({ state: 'visible' });
  await managerQueueLoad;
  const managerCard = managerPage.locator(`[data-travel-queue-request="${requestId}"]`);
  await managerCard.waitFor({ state: 'visible' });
  await managerCard.getByRole('heading', { name: destination }).waitFor({ state: 'visible' });
  await managerPage.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await managerPage.getByRole('heading', { name: 'ভ্রমণ অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  await managerCard.getByRole('button', { name: 'সংশোধনের জন্য ফেরত দিন' }).click();
  await managerPage.getByRole('alertdialog').getByRole('button', { name: 'বাতিল', exact: true }).click();
  await managerCard.waitFor({ state: 'visible' });
  await managerCard.getByRole('button', { name: 'সংশোধনের জন্য ফেরত দিন' }).click();
  await managerPage.getByRole('alertdialog').getByLabel('নোট').fill('Please clarify the visit objective.');
  const rejectResponsePromise = managerPage.waitForResponse(
    response => response.url().includes('/rest/v1/rpc/hris_resolve_travel_request'), { timeout: 10000 },
  );
  let rejectResponse;
  try {
    await managerPage.getByRole('alertdialog').getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }).click();
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

  await employeePage.getByRole('button', { name: 'আমার ভ্রমণ অনুরোধ রিফ্রেশ করুন' }).click();
  await employeeCard.getByText('সংশোধনের জন্য ফেরত', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('পর্যালোচকের নোট: Please clarify the visit objective.', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByRole('button', { name: 'অনুরোধ সংশোধন করুন' }).click();
  await employeePage.getByLabel('উদ্দেশ্য').fill('Clarified objective: review the delivery work with the client team.');
  const reviseResponse = employeePage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_my_travel_request'));
  await employeePage.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  if (await rpcUuid(await reviseResponse) !== requestId) throw new Error('Revised travel request did not retain its ID.');
  await employeeCard.getByText('খসড়া', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('পর্যালোচকের নোট: Please clarify the visit objective.', { exact: true }).waitFor({ state: 'visible' });
  const resubmitResponse = employeePage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_my_travel_request'));
  await employeeCard.getByRole('button', { name: 'পর্যালোচনার জন্য জমা দিন' }).click();
  await rpcUuid(await resubmitResponse);
  await employeeCard.getByText('জমা দেওয়া হয়েছে', { exact: true }).waitFor({ state: 'visible' });

  await managerPage.setViewportSize({ width: 375, height: 812 });
  await managerPage.getByRole('button', { name: 'Switch language to English' }).click();
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
  await employeePage.getByRole('button', { name: 'Switch language to English' }).click();
  await employeePage.getByRole('button', { name: 'Refresh my travel requests' }).click();
  await employeeCard.getByText('Approved', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('Clarified objective: review the delivery work with the client team.', { exact: false }).waitFor({ state: 'visible' });
  await employeeCard.getByText('Request history', { exact: true }).click();
  await employeeCard.getByText('Submitted → Returned for changes', { exact: true }).waitFor({ state: 'visible' });
  await employeeCard.getByText('Submitted → Approved', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employeePage, 'Travel history desktop');

  await employeePage.setViewportSize({ width: 375, height: 812 });
  let inboxReads = 0;
  await employeePage.route('**/rest/v1/rpc/hris_get_my_notifications', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    inboxReads += 1;
    if (inboxReads === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, prefer',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
        body: JSON.stringify({ message: 'Temporary test outage' }),
      });
    }
    return route.continue();
  });
  const inboxFailure = employeePage.waitForResponse(response =>
    response.url().includes('/rest/v1/rpc/hris_get_my_notifications') && response.status() === 503);
  await navigateTo(employeePage, 'Notifications');
  await employeePage.getByRole('heading', { name: 'Notifications', exact: true }).waitFor({ state: 'visible' });
  await inboxFailure;
  await employeePage.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
  await employeePage.getByRole('alert').waitFor({ state: 'detached' });
  if (inboxReads !== 2) throw new Error(`Expected one failed and one recovered inbox read, got ${inboxReads}.`);
  const approvedTravelNotification = employeePage.locator('article[data-notification-source="travel_decision"][data-notification-kind="approved"]');
  const rejectedTravelNotification = employeePage.locator('article[data-notification-source="travel_decision"][data-notification-kind="rejected"]');
  await approvedTravelNotification.getByText(destination, { exact: true }).waitFor({ state: 'visible' });
  await rejectedTravelNotification.getByText(destination, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employeePage, 'Travel decisions notification mobile');
  await employeePage.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await approvedTravelNotification.getByRole('heading', { name: 'ভ্রমণ অনুরোধ অনুমোদিত', exact: true }).waitFor({ state: 'visible' });
  await rejectedTravelNotification.getByRole('heading', { name: 'ভ্রমণ অনুরোধ প্রত্যাখ্যাত', exact: true }).waitFor({ state: 'visible' });
  await employeePage.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employeePage, 'Travel decisions notification desktop');
  await approvedTravelNotification.getByRole('button', { name: 'ভ্রমণ খুলুন', exact: true }).click();
  await employeePage.getByRole('heading', { name: 'আমার ভ্রমণ অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  await employeePage.locator(`[data-travel-request="${requestId}"]`).waitFor({ state: 'visible' });
  if (directTravelEndpoints.length) throw new Error(`Travel UI bypassed tenant-scoped RPCs: ${directTravelEndpoints.join(', ')}.`);
  console.log(`TRAVEL_ACCEPTANCE_ID=${requestId}`);
  console.log('Local Auth-to-Postgres travel workflow persisted employee draft, submission, manager return, employee recovery, resubmission, approval, and history in EN/BN across mobile and desktop; failed history read recovered on retry.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
