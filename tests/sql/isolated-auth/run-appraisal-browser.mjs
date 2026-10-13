// Exercises the narrative-only appraisal journey against real local Auth,
// PostgREST RPCs, and the disposable Postgres fixture.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_APPRAISAL_EMPLOYEE_EMAIL', 'HRIS_LOCAL_APPRAISAL_REVIEWER_EMAIL',
  'HRIS_LOCAL_APPRAISAL_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48372';
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
    } catch { /* the server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function signIn(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
}

async function openMyPerformance(page) {
  await page.waitForFunction(() => {
    const nav = document.querySelector('nav[aria-label="HRIS modules"]');
    const menu = document.querySelector('button[aria-label="Open navigation menu"]');
    return [nav, menu].some(element => element && element.getClientRects().length > 0);
  });
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  const menu = page.getByRole('button', { name: 'Open navigation menu' });
  if (!(await navigation.isVisible())) await menu.click();
  await navigation.getByRole('button', { name: 'My Performance', exact: true }).click();
  await page.getByRole('heading', { name: 'My Performance' }).waitFor({ state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) {
    throw new Error(`${label} overflowed a ${dimensions.viewport}px viewport to ${dimensions.document}px.`);
  }
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employeePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await employeePage.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(employeePage, process.env.HRIS_LOCAL_APPRAISAL_EMPLOYEE_EMAIL);
  await openMyPerformance(employeePage);
  let appraisal = employeePage.locator(`[data-appraisal-id="${process.env.HRIS_LOCAL_APPRAISAL_ID}"]`);
  await appraisal.waitFor({ state: 'visible' });
  await assertNoOverflow(employeePage, 'Employee self-review');
  await appraisal.getByLabel('Self-review notes').fill('Local Auth employee self-review narrative.');
  await appraisal.getByRole('button', { name: 'Save draft' }).click();
  await employeePage.getByRole('status').filter({ hasText: 'Appraisal notes saved as a draft.' }).waitFor({ state: 'visible' });
  await employeePage.reload();
  await openMyPerformance(employeePage);
  appraisal = employeePage.locator(`[data-appraisal-id="${process.env.HRIS_LOCAL_APPRAISAL_ID}"]`);
  await appraisal.getByLabel('Self-review notes').waitFor({ state: 'visible' });
  if (await appraisal.getByLabel('Self-review notes').inputValue() !== 'Local Auth employee self-review narrative.') {
    throw new Error('Employee self-review draft did not survive refresh.');
  }
  await appraisal.getByRole('button', { name: 'Submit self review' }).click();
  const employeeConfirm = employeePage.getByRole('alertdialog');
  await employeeConfirm.getByRole('button', { name: 'Cancel' }).click();
  await appraisal.getByRole('button', { name: 'Submit self review' }).waitFor({ state: 'visible' });
  await appraisal.getByRole('button', { name: 'Submit self review' }).click();
  await employeePage.getByRole('alertdialog').getByRole('button', { name: 'Confirm submission' }).click();
  await appraisal.getByText('Submitted By Employee').waitFor({ state: 'visible' });
  await assertNoOverflow(employeePage, 'Submitted employee self-review');

  const reviewerPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await reviewerPage.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(reviewerPage, process.env.HRIS_LOCAL_APPRAISAL_REVIEWER_EMAIL);
  await openMyPerformance(reviewerPage);
  let assignedReview = reviewerPage.locator(`[data-appraisal-id="${process.env.HRIS_LOCAL_APPRAISAL_ID}"]`);
  await assignedReview.getByText('Local Auth employee self-review narrative.').waitFor({ state: 'visible' });
  await assertNoOverflow(reviewerPage, 'Assigned reviewer');
  await reviewerPage.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(reviewerPage, 'Desktop assigned reviewer');
  await assignedReview.getByLabel('Manager review notes').fill('Local Auth manager narrative feedback.');
  await assignedReview.getByRole('button', { name: 'Save draft' }).click();
  await reviewerPage.getByRole('status').filter({ hasText: 'Appraisal notes saved as a draft.' }).waitFor({ state: 'visible' });
  await reviewerPage.reload();
  await openMyPerformance(reviewerPage);
  assignedReview = reviewerPage.locator(`[data-appraisal-id="${process.env.HRIS_LOCAL_APPRAISAL_ID}"]`);
  if (await assignedReview.getByLabel('Manager review notes').inputValue() !== 'Local Auth manager narrative feedback.') {
    throw new Error('Assigned reviewer draft did not survive refresh.');
  }
  await assignedReview.getByRole('button', { name: 'Submit manager feedback' }).click();
  await reviewerPage.getByRole('alertdialog').getByRole('button', { name: 'Confirm submission' }).click();
  await assignedReview.getByText('Reviewed By Manager').waitFor({ state: 'visible' });
  await reviewerPage.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(reviewerPage, 'Mobile submitted manager narrative feedback');

  await employeePage.reload();
  await openMyPerformance(employeePage);
  appraisal = employeePage.locator(`[data-appraisal-id="${process.env.HRIS_LOCAL_APPRAISAL_ID}"]`);
  await appraisal.getByText('Reviewed By Manager').waitFor({ state: 'visible' });
  await appraisal.getByText('Local Auth manager narrative feedback.').waitFor({ state: 'visible' });
  await assertNoOverflow(employeePage, 'Employee feedback history');
  console.log('Local Auth-to-Postgres narrative appraisal journey passed at 375px mobile and 1280px desktop.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
