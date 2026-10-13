// Exercises the employee learning workflow against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_LEARNING_EMAIL', 'HRIS_LOCAL_LEARNING_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48376';
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
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_LEARNING_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
}

async function openLearning(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Learning', exact: true }).click();
  await page.getByRole('heading', { name: 'My Learning', exact: true }).waitFor({ state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

async function rpcBody(response) {
  const data = await response.json();
  if (!response.ok || typeof data?.id !== 'string') throw new Error(`Learning RPC failed to persist an ID: ${JSON.stringify(data)}.`);
  return data;
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let contextCalls = 0;
  let blockInitialContext = true;
  const rpcTenants = [];
  const directLearningTableReads = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_learning_context') && request.method() === 'POST') {
      contextCalls += 1;
      const body = request.postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
    }
    if (/\/rest\/v1\/(learning_programs|learning_sessions|learning_enrollments)(\?|$)/.test(url.pathname + url.search)) {
      directLearningTableReads.push(url.pathname);
    }
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(hris_employee_(?:enroll|request|cancel)_learning)$/);
    if (rpc && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_learning_context')
      && route.request().method() === 'POST' && blockInitialContext) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary learning outage.' }) });
      return;
    }
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await signIn(page);
  await openLearning(page);
  await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible' });
  if (contextCalls < 1) throw new Error('Expected the initial learning load to call its tenant RPC.');
  await assertNoOverflow(page, 'Learning mobile load error');
  blockInitialContext = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const directProgram = page.locator('[data-learning-program="90000000-0000-4000-8000-000000000001"]');
  const requestProgram = page.locator('[data-learning-program="90000000-0000-4000-8000-000000000002"]');
  await directProgram.getByRole('heading', { name: 'QA A Direct Learning' }).waitFor({ state: 'visible' });
  await requestProgram.getByRole('heading', { name: 'QA A Approval Learning' }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'QA B Private Learning' }).waitFor({ state: 'detached' });
  await assertNoOverflow(page, 'Learning catalog mobile');

  await directProgram.getByLabel('Choose session for QA A Direct Learning').selectOption('91000000-0000-4000-8000-000000000001');
  const enrollmentResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_enroll_learning'));
  await directProgram.getByRole('button', { name: 'Enroll now' }).click();
  const enrollment = await rpcBody(await enrollmentResponse);
  const enrollmentCard = page.locator(`[data-learning-enrollment="${enrollment.id}"]`);
  await enrollmentCard.getByText('QA A Direct Learning', { exact: true }).waitFor({ state: 'visible' });
  await enrollmentCard.getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });

  await requestProgram.getByLabel('Choose session for QA A Approval Learning').selectOption('91000000-0000-4000-8000-000000000002');
  await requestProgram.getByLabel('Reason for QA A Approval Learning').fill('Practice leadership with my team.');
  const requestResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_request_learning'));
  await requestProgram.getByRole('button', { name: 'Request approval' }).click();
  const request = await rpcBody(await requestResponse);
  const requestCard = page.locator(`[data-learning-enrollment="${request.id}"]`);
  await requestCard.getByText('QA A Approval Learning', { exact: true }).waitFor({ state: 'visible' });
  await requestCard.getByText('Requested', { exact: true }).waitFor({ state: 'visible' });
  await requestCard.getByText('Practice leadership with my team.', { exact: false }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Learning actions mobile');

  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await page.locator(`[data-learning-enrollment="${enrollment.id}"]`).getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  await page.locator(`[data-learning-enrollment="${request.id}"]`).getByText('Requested', { exact: true }).waitFor({ state: 'visible' });

  const enrollmentHistory = page.locator(`[data-learning-enrollment="${enrollment.id}"]`);
  await enrollmentHistory.getByRole('button', { name: 'Cancel enrollment' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();
  await enrollmentHistory.getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  await enrollmentHistory.getByRole('button', { name: 'Cancel enrollment' }).click();
  const cancelResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_cancel_learning'));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm cancellation' }).click();
  await cancelResponse;
  await page.locator(`[data-learning-enrollment="${enrollment.id}"]`).getByText('Cancelled', { exact: true }).waitFor({ state: 'visible' });

  await page.locator(`[data-learning-enrollment="${request.id}"]`).getByRole('button', { name: 'Cancel enrollment' }).click();
  const cancelRequestResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_cancel_learning'));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm cancellation' }).click();
  await cancelRequestResponse;
  await page.locator(`[data-learning-enrollment="${request.id}"]`).getByText('Cancelled', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await page.locator(`[data-learning-enrollment="${enrollment.id}"]`).getByText('Cancelled', { exact: true }).waitFor({ state: 'visible' });
  await page.locator(`[data-learning-enrollment="${request.id}"]`).getByText('Cancelled', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Learning history mobile persistence');

  await page.getByLabel('Search learning programs').fill('no learning program will match this');
  await page.getByText('No learning programs match your search.', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Search learning programs').fill('');
  await page.locator('[data-learning-program="90000000-0000-4000-8000-000000000001"]').waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await page.locator(`[data-learning-enrollment="${request.id}"]`).getByText('Cancelled', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Learning desktop workspace');
  if (rpcTenants.some(id => id !== process.env.HRIS_LOCAL_LEARNING_TENANT_ID)) {
    throw new Error(`Learning UI requested an unexpected tenant: ${rpcTenants.join(', ')}.`);
  }
  if (directLearningTableReads.length) throw new Error(`Learning UI bypassed its tenant-scoped RPCs: ${directLearningTableReads.join(', ')}.`);
  console.log('Local Auth-to-Postgres learning enrollment, approval request, cancellation, refresh, and mobile/desktop journey passed.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
