// Verifies the real password-reset email and Auth callback against disposable
// local Supabase Auth + Mailpit. It uses its own allowlisted Vite port and never
// occupies or navigates the user's port 3000 app.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY',
  'HRIS_LOCAL_TEST_PASSWORD', 'HRIS_LOCAL_RECOVERY_EMAIL', 'HRIS_LOCAL_MAILPIT_URL',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing local recovery setting ${key}.`);

const repo = process.cwd();
async function findAvailableLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not reserve a local browser port.')));
        return;
      }
      probe.close(error => error ? reject(error) : resolve(String(address.port)));
    });
  });
}

const vitePort = await findAvailableLoopbackPort();
const viteOrigin = `http://127.0.0.1:${vitePort}`;
const redirectOrigin = viteOrigin;
const authUrl = new URL(process.env.HRIS_LOCAL_SUPABASE_URL);
const mailpitUrl = new URL(process.env.HRIS_LOCAL_MAILPIT_URL);
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', vitePort, '--strictPort'], {
  cwd: repo,
  env: {
    ...process.env,
    DISABLE_HMR: 'true',
    VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY,
  },
  stdio: 'ignore',
});

let browser;
let stage = 'starting local web server';
let safeFailureDetail = '';
let serverSpawnErrorCode = '';
let serverExitInfo = '';
server.once('error', error => { serverSpawnErrorCode = error.code || error.name || 'spawn_error'; });
server.once('exit', (code, signal) => {
  serverExitInfo = `exit=${code ?? 'none'}${signal ? ` signal=${signal}` : ''}`;
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverSpawnErrorCode) throw new Error(`Local web server spawn failed (${serverSpawnErrorCode}).`);
    if (server.exitCode !== null) throw new Error(`Local HRIS web server exited before recovery testing (${serverExitInfo || 'exit status unavailable'}).`);
    try {
      const response = await fetch(viteOrigin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* the local web server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for the local HRIS web server (${serverExitInfo || 'process still running'}).`);
}

function stringsDeep(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsDeep(item, output);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) stringsDeep(item, output);
  return output;
}

function decodeHtml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&#x3D;', '=').replaceAll('&#61;', '=')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'");
}

function recoveryLinkFrom(message, detail) {
  const texts = stringsDeep([message, detail]).map(decodeHtml);
  const candidates = [];
  for (const text of texts) {
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) candidates.push(match[0].replace(/[),.;]+$/, ''));
    for (const match of text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.origin === authUrl.origin && url.pathname === '/auth/v1/verify'
          && url.searchParams.get('type') === 'recovery' && url.searchParams.has('token')) return url.href;
    } catch { /* ignore non-URL email content */ }
  }
  return null;
}

async function latestRecoveryLink(email) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    let listing;
    try {
      const response = await fetch(new URL('/api/v1/messages?limit=50', mailpitUrl));
      if (!response.ok) throw new Error();
      listing = await response.json();
    } catch { throw new Error('The disposable local Mailpit service could not be read.'); }
    for (const message of listing.messages || []) {
      if (!JSON.stringify(message).toLowerCase().includes(email.toLowerCase())) continue;
      const id = message.ID || message.id;
      if (!id) continue;
      let detail;
      for (const path of [`/api/v1/message/${encodeURIComponent(id)}`, `/api/v1/messages/${encodeURIComponent(id)}`]) {
        const response = await fetch(new URL(path, mailpitUrl));
        if (response.ok) { detail = await response.json(); break; }
      }
      const link = recoveryLinkFrom(message, detail || {});
      if (link) return link;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('A fresh recovery email did not arrive in the disposable local Mailpit inbox.');
}

async function assertNoOverflow(page, label) {
  const sizes = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (sizes.document > sizes.viewport) throw new Error(`${label} has horizontal overflow.`);
}

async function run() {
  await waitForServer();
  stage = 'opening the local HRIS recovery page';
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let recoveryHttpStatus = null;
  let recoveryErrorCode = '';
  let recoveryErrorDetail = '';
  let recoveryRequestObserved = false;
  let recoveryRequestMethod = '';
  let recoveryRequestFailure = '';
  let browserReportedCorsFailure = false;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === authUrl.origin && url.pathname.endsWith('/recover')) {
      recoveryRequestObserved = true;
      recoveryRequestMethod = request.method();
    }
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === authUrl.origin && url.pathname.endsWith('/recover')) recoveryRequestFailure = request.failure()?.errorText || 'network request failed';
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== authUrl.origin || !url.pathname.endsWith('/recover')) return;
    recoveryHttpStatus = response.status();
    void response.json().then(body => {
      recoveryErrorCode = String(body.error_code || body.code || '');
      recoveryErrorDetail = String(body.msg || body.message || '')
        .replace(process.env.HRIS_LOCAL_RECOVERY_EMAIL, '[synthetic account]')
        .replace(/https?:\/\/[^\s"']+/g, '[local URL]');
    }).catch(() => {});
  });
  page.on('console', message => {
    if (message.type() === 'error' && /blocked by CORS policy/i.test(message.text())) browserReportedCorsFailure = true;
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === viteOrigin || url.origin === authUrl.origin || url.origin === mailpitUrl.origin || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    if (url.hostname === 'fonts.googleapis.com') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }
    await route.abort();
  });

  await page.goto(redirectOrigin);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  stage = 'submitting a recovery-email request to local Auth';
  await page.getByLabel('Account email').fill(process.env.HRIS_LOCAL_RECOVERY_EMAIL);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const status = page.getByRole('status').filter({ hasText: 'a reset link has been requested' });
  const requestAlert = page.getByRole('alert');
  const requestDeadline = Date.now() + 15000;
  while (Date.now() < requestDeadline && !(await status.isVisible().catch(() => false))) {
    if (await requestAlert.isVisible().catch(() => false)) {
      const visibleAlert = (await requestAlert.innerText()).replace(process.env.HRIS_LOCAL_RECOVERY_EMAIL, '[synthetic account]');
      safeFailureDetail = `${visibleAlert} (local Auth ${recoveryRequestMethod || 'no'} request ${recoveryRequestObserved ? 'observed' : 'not observed'}, HTTP ${recoveryHttpStatus ?? 'no response'}${recoveryErrorCode ? `, ${recoveryErrorCode}` : ''}${recoveryErrorDetail ? `: ${recoveryErrorDetail}` : ''}${recoveryRequestFailure ? `, ${recoveryRequestFailure}` : ''}${browserReportedCorsFailure ? ', browser reported CORS denial' : ''})`;
      throw new Error('Local Auth rejected the recovery request.');
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!(await status.isVisible().catch(() => false))) throw new Error('Local Auth did not confirm the recovery request.');
  await assertNoOverflow(page, 'Mobile password-recovery request');

  stage = 'reading the fresh message from local Mailpit';
  const link = await latestRecoveryLink(process.env.HRIS_LOCAL_RECOVERY_EMAIL);
  stage = 'redeeming the local recovery email';
  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Choose a new password' }).waitFor({ state: 'visible', timeout: 20000 });
  await assertNoOverflow(page, 'Mobile password-update form');

  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Desktop password-update form');
  await page.getByLabel('New password').fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page.getByRole('button', { name: 'Update password' }).click();
  if (!(await page.getByLabel('New password').evaluate(input => input.validity.tooShort))) {
    throw new Error('The password-reset form did not reject a short password.');
  }

  const newPassword = `Synesis-Local-${Date.now()}-Reset!`;
  await page.getByLabel('New password').fill(newPassword);
  await page.getByLabel('Confirm password').fill(`${newPassword}-mismatch`);
  await page.getByRole('button', { name: 'Update password' }).click();
  await page.getByRole('alert').filter({ hasText: 'Passwords do not match.' }).waitFor({ state: 'visible' });
  await page.getByLabel('Confirm password').fill(newPassword);
  stage = 'saving the new password through Auth';
  await page.getByRole('button', { name: 'Update password' }).click();
  await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor({ state: 'visible', timeout: 15000 });
  if (new URL(page.url()).search || new URL(page.url()).hash) throw new Error('Recovery credentials remained in the browser URL after password update.');

  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_RECOVERY_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  stage = 'signing in with the updated password';
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'No authorized HRIS organization' }).waitFor({ state: 'visible', timeout: 20000 });
  await assertNoOverflow(page, 'Desktop sign-in after recovery');
  console.log('Fresh local Mailpit recovery email completed the mobile password reset and desktop sign-in journey.');
}

try {
  await run();
} catch (error) {
  const safeStartupError = stage === 'starting local web server'
    ? String(error?.message || 'unknown startup error').replace(/[^a-zA-Z0-9 _=().:-]/g, '').slice(0, 180)
    : '';
  console.error(`Local password-recovery journey failed while ${stage}${safeFailureDetail ? `: ${safeFailureDetail}` : ''}${safeStartupError ? `: ${safeStartupError}` : ''}; recovery URLs and tokens were suppressed.`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
