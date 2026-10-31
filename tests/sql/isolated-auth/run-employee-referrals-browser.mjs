// Full employee referral submission and recruiter review against isolated Auth, Storage, RPC, and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_REFERRAL_EMPLOYEE_EMAIL', 'HRIS_LOCAL_REFERRAL_MANAGER_EMAIL', 'HRIS_LOCAL_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
// Expense acceptance also used 48378 and its npx wrapper may outlive SIGTERM.
// Reserve an unused loopback port and launch Vite directly, as the existing
// project-timesheets browser harness does, so later tests cannot collide.
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select a loopback port for employee referrals.')));
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
function safeStartupDiagnostic() {
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
      const diagnostic = safeStartupDiagnostic();
      throw new Error(`Local Vite server exited with ${server.exitCode}.${diagnostic ? ` Startup diagnostic: ${diagnostic}` : ''}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function signIn(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  const authResponsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password';
  }, { timeout: 15000 });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const authResponse = await authResponsePromise;
  if (!authResponse.ok()) throw new Error(`Local Auth sign-in returned HTTP ${authResponse.status()} for the synthetic browser user.`);
  try {
    if (await page.evaluate(() => window.innerWidth) < 1024) {
      await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible', timeout: 15000 });
    } else {
      await page.getByRole('navigation', { name: 'HRIS modules' }).waitFor({ state: 'visible', timeout: 15000 });
    }
  } catch {
    const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
    const bodyText = await page.locator('body').innerText().catch(() => 'unavailable');
    throw new Error(`Local Auth accepted the synthetic user but the HRIS shell did not become ready; alerts=${JSON.stringify(alerts)}; page=${bodyText.slice(0, 900)}`);
  }
}

async function openReferrals(page, label) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('heading', { name: label === 'My Referrals' ? 'My Referrals' : 'Employee Referral Requests' }).waitFor({ state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  const employee = await context.newPage();
  await signIn(employee, process.env.HRIS_LOCAL_REFERRAL_EMPLOYEE_EMAIL);
  await openReferrals(employee, 'My Referrals');
  await employee.getByRole('button', { name: 'Refer a candidate' }).click();
  const dialog = employee.getByRole('dialog', { name: 'Employee Information' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByLabel('Name').fill('Browser Referral Candidate');
  await dialog.getByLabel('Personal Email').fill('browser-referral@candidate.test');
  await dialog.getByLabel('Phone Number').fill('+8801700000101');
  await dialog.getByLabel('Candidate Relationship').fill('Former teammate');
  await dialog.getByLabel('LinkedIn/Portfolio URL').fill('https://example.test/browser-referral');
  await dialog.getByLabel('Job Opening').selectOption('a1111111-1111-4111-8111-111111111111');
  await dialog.getByLabel('Preferred Department').selectOption('eeeeeeee-0000-4000-8000-000000000001');
  await dialog.getByLabel('Why are you referring this candidate?').fill('Browser journey for the private referral workflow.');
  await dialog.locator('#referral-resume').setInputFiles({
    name: 'browser-referral-resume.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nSynthetic browser resume\n'),
  });
  const submission = employee.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_employee_referral'));
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  if (!(await (await submission).ok())) throw new Error('Employee referral submit RPC did not succeed.');
  await employee.getByText('Browser Referral Candidate', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Employee referral list mobile');

  const referralCard = employee.getByText('Browser Referral Candidate', { exact: true }).locator('xpath=ancestor::li');
  await referralCard.getByRole('button', { name: 'View details' }).click();
  const details = employee.getByRole('dialog', { name: 'Referral Details' });
  await details.waitFor({ state: 'visible' });
  const resumeLink = details.getByRole('link', { name: /Download browser-referral-resume\.pdf/ });
  await resumeLink.waitFor({ state: 'visible' });
  const signedResume = new URL(await resumeLink.getAttribute('href'));
  if (!signedResume.pathname.includes('/storage/v1/object/sign/employee-referral-files/')) {
    throw new Error('Employee resume link did not use the private Storage signed-download route.');
  }
  const employeeResumeDownload = await employee.request.get(signedResume.href);
  if (!employeeResumeDownload.ok() || !(await employeeResumeDownload.body()).toString().includes('Synthetic browser resume')) {
    throw new Error('Employee private resume link did not return the uploaded document.');
  }
  await assertNoOverflow(employee, 'Employee referral detail mobile');
  await details.getByRole('button', { name: 'Close referral details' }).click();

  const managerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await managerContext.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  const manager = await managerContext.newPage();
  await signIn(manager, process.env.HRIS_LOCAL_REFERRAL_MANAGER_EMAIL);
  await openReferrals(manager, 'Employee referrals');
  await manager.getByText('Browser Referral Candidate', { exact: true }).waitFor({ state: 'visible' });
  const managerCard = manager.getByText('Browser Referral Candidate', { exact: true }).locator('xpath=ancestor::li');
  await managerCard.getByRole('button', { name: 'View details' }).click();
  const managerDetails = manager.getByRole('dialog', { name: 'Referral Details' });
  await managerDetails.waitFor({ state: 'visible' });
  await managerDetails.getByRole('link', { name: /Download browser-referral-resume\.pdf/ }).waitFor({ state: 'visible' });
  await managerDetails.getByLabel('Review note (optional)').fill('Review started from the browser journey.');
  const review = manager.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_mark_employee_referral_in_review'));
  await managerDetails.getByRole('button', { name: 'Mark in review' }).click();
  if (!(await (await review).ok())) throw new Error('Manager referral review RPC did not succeed.');
  await managerCard.getByText('in review', { exact: true }).waitFor({ state: 'visible' });
  await manager.getByRole('status').filter({ hasText: 'now in review' }).waitFor({ state: 'visible' });
  await assertNoOverflow(manager, 'Recruiter referral queue desktop');

  console.log('Local Auth-to-Postgres employee referral journey passed at 375px mobile and 1280px desktop.');
  await managerContext.close();
  await context.close();
} finally {
  if (browser) await browser.close();
  await stopChildProcess(server);
}
