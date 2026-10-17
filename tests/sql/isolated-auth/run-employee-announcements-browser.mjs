import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_ANNOUNCEMENT_EMPLOYEE_EMAIL', 'HRIS_LOCAL_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select an available loopback port for announcements acceptance.')));
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
let failInitialRead = true;
let armInitialReadFailure = false;
let injectedInitialReadFailure = false;
let showEmptyOnNextRead = false;
const noticeRequests = [];
const inFlightFullNoticeReads = new Set();
let fullNoticeReadCount = 0;
const isNoticeRead = request => request.method() === 'GET'
  && new URL(request.url()).pathname.replace(/\/+$/, '').endsWith('/rest/v1/notices');
const isFullNoticeRead = request => isNoticeRead(request)
  && (new URL(request.url()).searchParams.get('select') || '').includes('body,attachment_url');
async function waitForFullNoticeReadsToSettle() {
  const deadline = Date.now() + 8_000;
  let quietSince = 0;
  while (Date.now() < deadline) {
    if (inFlightFullNoticeReads.size === 0) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 500) return;
    } else quietSince = 0;
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  throw new Error(`Full announcement reads did not settle before injecting the refresh outage: ${inFlightFullNoticeReads.size} still active.`);
}
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server is starting */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error('Timed out waiting for the employee announcements UI server.');
}
async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (isNoticeRead(request)) noticeRequests.push(url.search);
    if (isFullNoticeRead(request)) {
      fullNoticeReadCount += 1;
      inFlightFullNoticeReads.add(request);
    }
  });
  page.on('requestfinished', request => inFlightFullNoticeReads.delete(request));
  page.on('requestfailed', request => inFlightFullNoticeReads.delete(request));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (isFullNoticeRead(route.request())) {
        if (failInitialRead && armInitialReadFailure) {
          failInitialRead = false;
          injectedInitialReadFailure = true;
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
            code: 'XX000', message: 'Synthetic temporary notice read outage.',
          }) });
          return;
        }
        if (showEmptyOnNextRead) {
          showEmptyOnNextRead = false;
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
          return;
        }
      }
      return route.continue();
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_ANNOUNCEMENT_EMPLOYEE_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Announcements', exact: true }).click();
  await page.getByRole('heading', { name: 'Announcements', exact: true }).waitFor({ state: 'visible' });
  const pinnedNotice = page.locator('[data-announcement-id="b1111111-1111-4111-8111-111111111111"]');
  const departmentNotice = page.locator('[data-announcement-id="b1111111-1111-4111-8111-111111111112"]');
  await pinnedNotice.waitFor({ state: 'visible' });
  await departmentNotice.waitFor({ state: 'visible' });
  await waitForFullNoticeReadsToSettle();
  const fullNoticeReadCountBeforeFailure = fullNoticeReadCount;
  armInitialReadFailure = true;
  const failedReadResponse = page.waitForResponse(response => isFullNoticeRead(response.request()) && response.status() === 503);
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click();
  const outageResponse = await failedReadResponse;
  await waitForFullNoticeReadsToSettle();
  if (!injectedInitialReadFailure) throw new Error(`The isolated notices endpoint was not intercepted; observed reads=${noticeRequests.length}.`);
  if (fullNoticeReadCount !== fullNoticeReadCountBeforeFailure + 1 || inFlightFullNoticeReads.size !== 0) {
    throw new Error(`The refresh outage raced another notice read: before=${fullNoticeReadCountBeforeFailure}, after=${fullNoticeReadCount}, active=${inFlightFullNoticeReads.size}, request=${outageResponse.url()}.`);
  }
  const outageAlert = page.getByRole('alert').filter({ hasText: /Announcements are unavailable\.|ঘোষণাগুলো এখন পাওয়া যাচ্ছে না/ });
  try {
    await outageAlert.waitFor({ state: 'visible' });
  } catch {
    const sectionState = await page.locator('section[aria-labelledby="my-announcements-heading"]').evaluate(section => ({
      text: section.innerText,
      alerts: Array.from(section.querySelectorAll('[role="alert"]')).map(element => element.textContent),
      loading: Boolean(section.querySelector('[role="status"]')),
      items: section.querySelectorAll('[data-announcement-id]').length,
    }));
    throw new Error(`The refresh-triggered 503 completed, but the employee UI did not show its retry alert. Full reads=${fullNoticeReadCount}; recent reads=${JSON.stringify(noticeRequests.slice(-6))}; announcement section=${JSON.stringify(sectionState)}; page errors=${JSON.stringify(pageErrors)}.`);
  }
  if (failInitialRead) throw new Error('The injected initial announcement read outage was not observed.');
  armInitialReadFailure = false;
  await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();

  await pinnedNotice.waitFor({ state: 'visible' });
  await departmentNotice.waitFor({ state: 'visible' });
  if (await page.locator('[data-announcement-id]').count() !== 2) throw new Error('Audience filtering exposed an unexpected announcement count.');
  await pinnedNotice.getByText('Pinned notice', { exact: true }).waitFor({ state: 'visible' });
  const attachment = departmentNotice.getByRole('link', { name: 'Open attachment', exact: true });
  if ((await attachment.getAttribute('href')) !== 'https://example.test/qa-notice.pdf'
      || (await attachment.getAttribute('rel')) !== 'noopener noreferrer') {
    throw new Error('The employee announcement attachment link is missing or unsafe.');
  }
  await assertNoOverflow(page, 'Employee announcements mobile');

  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click();
  await pinnedNotice.waitFor({ state: 'visible' });
  await page.reload();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Announcements', exact: true }).click();
  await departmentNotice.waitFor({ state: 'visible' });
  if (noticeRequests.length < 4) throw new Error('Refresh and recovery did not reload the authorized announcement collection.');

  showEmptyOnNextRead = true;
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click();
  await page.getByText('No active announcements are available.', { exact: true }).waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  await page.getByRole('heading', { name: 'ঘোষণা', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee announcements desktop and Bengali');
  await page.getByRole('button', { name: 'Switch language to English', exact: true }).click();
  await page.getByRole('heading', { name: 'Announcements', exact: true }).waitFor({ state: 'visible' });
  console.log('Local Auth-to-Postgres employee announcements journey passed at 375px mobile and 1280px desktop, EN/BN, retry, refresh, empty, audience and attachment states.');
} finally {
  if (browser) await browser.close();
  await stopChildProcess(server);
}
