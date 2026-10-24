// Verify the recruiter rejection confirmation against the already confirmed local replacement interview.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_RECRUITMENT_EMAIL', 'HRIS_LOCAL_APPLICATION_A2_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48374';
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

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_RECRUITMENT_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });

  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Candidate pipeline', exact: true }).click();
  await page.getByRole('heading', { name: 'Candidate pipeline' }).waitFor({ state: 'visible' });
  const application = page.locator(`[data-application-id="${process.env.HRIS_LOCAL_APPLICATION_A2_ID}"]`);
  await application.getByText('Candidate A Two', { exact: true }).waitFor({ state: 'visible' });
  await application.getByText('Interview Scheduled', { exact: true }).first().waitFor({ state: 'visible' });
  let rejectedStageRequests = 0;
  page.on('request', request => {
    if (request.url().includes('/rest/v1/rpc/hris_update_candidate_application_stage')) rejectedStageRequests += 1;
  });
  await application.getByText('Update application progress', { exact: true }).click();
  await application.getByLabel('Next application stage for Candidate A Two').selectOption('rejected');
  await application.getByRole('button', { name: 'Save stage', exact: true }).click();
  await application.getByRole('alertdialog', { name: 'Confirm application rejection' }).waitFor({ state: 'visible' });
  await application.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (await application.getByRole('alertdialog', { name: 'Confirm application rejection' }).count()) {
    throw new Error('Rejection confirmation did not cancel.');
  }
  if (rejectedStageRequests !== 0) throw new Error('Cancelling rejection unexpectedly wrote a stage transition.');

  await application.getByRole('button', { name: 'Save stage', exact: true }).click();
  await application.getByRole('alertdialog', { name: 'Confirm application rejection' }).waitFor({ state: 'visible' });
  const stageResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_update_candidate_application_stage'));
  await application.getByRole('button', { name: 'Confirm rejection', exact: true }).click();
  const savedStageResponse = await stageResponse;
  if (!savedStageResponse.ok()) throw new Error(`Application rejection RPC failed with HTTP ${savedStageResponse.status()}.`);
  await application.getByText('Rejected', { exact: true }).first().waitFor({ state: 'visible' });
  if (rejectedStageRequests !== 1) throw new Error(`Expected one stage RPC after confirmation, received ${rejectedStageRequests}.`);
  let dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`Mobile rejection flow overflowed: ${JSON.stringify(dimensions)}.`);

  await page.getByRole('button', { name: 'Refresh candidate applications' }).click();
  await application.getByText('Rejected', { exact: true }).first().waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1280, height: 900 });
  dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`Desktop rejection flow overflowed: ${JSON.stringify(dimensions)}.`);
  console.log('Recruiter rejection confirmation, cancellation, persistence, refresh, and mobile/desktop states passed after candidate confirmation.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
