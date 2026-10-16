// Exercises the persisted interview closeout as a recruiter against local Auth/Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_RECRUITMENT_EMAIL', 'HRIS_LOCAL_COMPLETION_INTERVIEW_ID', 'HRIS_LOCAL_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const port = '48374';
const origin = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY,
  },
  stdio: 'ignore',
});

let browser;
let failNextCompletion = true;
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

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/rest/v1/rpc/hris_complete_candidate_interview') && failNextCompletion) {
      failNextCompletion = false;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic one-time completion failure.' }) });
    }
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
  const section = page.getByRole('region', { name: 'Interview responses' });
  const card = section.locator(`[data-interview-id="${process.env.HRIS_LOCAL_COMPLETION_INTERVIEW_ID}"]`);
  await card.waitFor({ state: 'visible' });
  await card.getByText('Candidate accepted', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Interview completion mobile');

  let completionResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_complete_candidate_interview'));
  await card.getByRole('button', { name: 'Mark interview complete', exact: true }).click();
  const failedResponse = await completionResponse;
  if (failedResponse.status() !== 500) throw new Error(`Expected an injected one-time completion failure, received ${failedResponse.status()}.`);
  await card.getByRole('alert').waitFor({ state: 'visible' });
  await card.getByRole('button', { name: 'Mark interview complete', exact: true }).waitFor({ state: 'enabled' });

  completionResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_complete_candidate_interview'));
  await card.getByRole('button', { name: 'Mark interview complete', exact: true }).click();
  const savedResponse = await completionResponse;
  if (!savedResponse.ok()) throw new Error(`Interview completion RPC failed with HTTP ${savedResponse.status()}.`);
  await card.getByText('Interview completed. The application is under evaluation.', { exact: true }).waitFor({ state: 'visible' });
  await card.getByText('Interview completed', { exact: true }).waitFor({ state: 'visible' });
  if (await card.getByRole('button', { name: 'Mark interview complete', exact: true }).count()) throw new Error('Completed interview still offers the completion action.');

  let refreshResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_candidate_interview_responses'));
  await section.getByRole('button', { name: 'Refresh interview responses', exact: true }).click();
  await refreshResponse;
  await card.getByText('Interview completed. The application is under evaluation.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Interview completion refresh mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Interview completion desktop');

  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  const sectionBn = page.getByRole('region', { name: 'সাক্ষাৎকারের উত্তর' });
  const cardBn = sectionBn.locator(`[data-interview-id="${process.env.HRIS_LOCAL_COMPLETION_INTERVIEW_ID}"]`);
  await cardBn.getByText('সাক্ষাৎকার সম্পন্ন', { exact: true }).waitFor({ state: 'visible' });
  await cardBn.getByText('সাক্ষাৎকার সম্পন্ন হয়েছে। আবেদনটি মূল্যায়নাধীন।', { exact: true }).waitFor({ state: 'visible' });
  if (await cardBn.getByRole('button', { name: 'সাক্ষাৎকার সম্পন্ন হিসেবে চিহ্নিত করুন', exact: true }).count()) throw new Error('Bengali completed interview still offers the completion action.');
  await assertNoOverflow(page, 'Interview completion Bengali desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(page, 'Interview completion Bengali mobile');
  console.log('CANDIDATE_INTERVIEW_COMPLETION_BROWSER PASS=12 FAIL=0 locales=EN+BN viewports=375px+1280px retry=persisted refresh=verified');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
