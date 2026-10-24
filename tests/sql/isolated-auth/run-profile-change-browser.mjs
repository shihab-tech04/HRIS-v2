// Exercises the existing employee profile-change RPCs through the mounted HRIS UI.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_PROFILE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_PROFILE_MANAGER_EMAIL',
];
for (const key of required) if (!process.env[key]) throw new Error('Missing integration setting ' + key + '.');

const repo = process.cwd();
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select an available loopback port for the profile browser journey.')));
      return;
    }
    probe.close(error => error ? reject(error) : resolvePort(String(address.port)));
  });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [resolve(repo, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: process.cwd(),
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
    if (server.exitCode !== null) throw new Error('Profile request UI server exited unexpectedly.');
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* local server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the profile request UI.');
}
async function signIn(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible', timeout: 30000 });
}
async function openNav(page, label) {
  const nav = page.getByRole('navigation', { name: 'HRIS modules' });
  const isMobileViewport = await page.evaluate(() => window.innerWidth < 1024);
  if (isMobileViewport) {
    if (!(await nav.isVisible())) {
      const openMenu = page.getByRole('button', { name: 'Open navigation menu' });
      await openMenu.waitFor({ state: 'visible' });
      await openMenu.click();
    }
  } else {
    await nav.waitFor({ state: 'visible' });
  }
  await nav.getByRole('button', { name: label, exact: true }).click();
  return nav;
}
async function noOverflow(page, name) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport) throw new Error(name + ' overflowed: ' + JSON.stringify(size));
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employee = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await signIn(employee, process.env.HRIS_LOCAL_PROFILE_EMPLOYEE_EMAIL);
  await openNav(employee, 'Profile requests');
  await employee.getByRole('heading', { name: 'Profile change requests' }).waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'Submit request', exact: true }).click();
  await employee.getByRole('alert').filter({ hasText: 'Select a field and enter both the proposed value and reason.' }).waitFor({ state: 'visible' });
  await employee.getByLabel('Profile field').selectOption({ label: 'Personal email' });
  await employee.getByLabel('Proposed value').fill('discarded-value@hris.test');
  await employee.getByLabel('Reason for this correction').fill('Cancel recovery check.');
  await employee.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (await employee.getByLabel('Proposed value').inputValue()) throw new Error('Cancel did not clear the unsaved profile correction.');
  const proposed = 'e02-browser-' + Date.now() + '@hris.test';
  await employee.getByLabel('Profile field').selectOption({ label: 'Personal email' });
  await employee.getByLabel('Proposed value').fill(proposed);
  await employee.getByLabel('Reason for this correction').fill('Synthetic browser acceptance correction.');
  await employee.getByRole('button', { name: 'Submit request', exact: true }).click();
  await employee.getByRole('status').filter({ hasText: 'Request submitted for HR review.' }).waitFor({ state: 'visible' });
  await employee.getByText('Pending', { exact: true }).waitFor({ state: 'visible' });
  if ((await employee.locator('body').innerText()).includes(proposed)) throw new Error('Employee history exposed a proposed profile value.');
  await noOverflow(employee, 'Employee profile requests at 375px');
  await employee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await employee.locator('main h2').filter({ hasText: /^প্রোফাইল পরিবর্তনের অনুরোধ$/ }).first().waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'Switch language to English' }).click();
  await employee.getByRole('heading', { name: 'Profile change requests' }).waitFor({ state: 'visible' });
  await employee.setViewportSize({ width: 1280, height: 900 });
  await noOverflow(employee, 'Employee profile requests at 1280px');
  await employee.reload();
  await openNav(employee, 'Profile requests');
  await employee.getByText('Pending', { exact: true }).waitFor({ state: 'visible' });

  const manager = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await signIn(manager, process.env.HRIS_LOCAL_PROFILE_MANAGER_EMAIL);
  let failQueueOnce = true;
  await manager.route('**/rest/v1/rpc/admin_list_profile_change_requests', async route => {
    if (failQueueOnce) {
      failQueueOnce = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic transient reviewer queue outage.' }) });
      return;
    }
    await route.continue();
  });
  await openNav(manager, 'Profile corrections');
  await manager.getByRole('heading', { name: 'Profile correction review' }).waitFor({ state: 'visible' });
  await manager.getByRole('alert').filter({ hasText: 'Profile correction review is unavailable.' }).waitFor({ state: 'visible' });
  await manager.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
  const requestRow = manager.locator('li').filter({ hasText: proposed });
  await requestRow.waitFor({ state: 'visible' });
  await requestRow.getByLabel('Reviewer note (optional)').fill('Reviewed synthetic correction.');
  await requestRow.getByRole('button', { name: 'Approve correction', exact: true }).click();
  await manager.getByRole('status').filter({ hasText: 'Profile correction approved.' }).waitFor({ state: 'visible' });
  await noOverflow(manager, 'Reviewer profile queue at 375px');
  await manager.setViewportSize({ width: 1280, height: 900 });
  await noOverflow(manager, 'Reviewer profile queue at 1280px');

  await employee.reload();
  await openNav(employee, 'Profile requests');
  const approved = employee.locator('li').filter({ hasText: 'Reviewed synthetic correction.' });
  await approved.getByText('Approved', { exact: true }).waitFor({ state: 'visible' });
  if ((await approved.innerText()).includes(proposed)) throw new Error('Employee history exposed the proposed value after review.');
  console.log('E02_PROFILE_CHANGE_BROWSER_ACCEPTANCE=PASS');
} finally {
  try {
    await browser?.close();
  } finally {
    await stopChildProcess(server);
  }
}
