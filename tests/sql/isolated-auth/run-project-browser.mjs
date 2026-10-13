// Runs the real HRIS UI against the disposable local Supabase stack. Called
// only from run-local.mjs after its Auth and database fixture is established.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_PM_EMAIL', 'HRIS_LOCAL_REVIEWER_EMAIL', 'HRIS_LOCAL_REVIEWEE_EMAIL', 'HRIS_LOCAL_TENANT_ID',
  'HRIS_LOCAL_PROJECT_ID', 'HRIS_LOCAL_PROJECT_CODE', 'HRIS_LOCAL_INITIAL_ALLOCATION_ID',
  'HRIS_LOCAL_COLLABORATOR_ALLOCATION_ID', 'HRIS_LOCAL_TASK_TITLE',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48371';
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
      if (response.ok) {
        const html = await response.text();
        if (!html.includes('Synesis HRIS 360°')) {
          throw new Error(`Port ${port} is serving a different application; refusing browser integration.`);
        }
        return;
      }
    } catch { /* the server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function signIn(page, email) {
  await page.goto(origin);
  const emailInput = page.getByLabel('Email', { exact: true });
  try { await emailInput.waitFor({ state: 'visible', timeout: 10000 }); }
  catch {
    const visibleText = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Local sign-in form did not render at ${page.url()} (${await page.title()}). Page text: ${visibleText.slice(0, 700)}`);
  }
  await emailInput.fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if ((await page.evaluate(() => window.innerWidth)) < 1024) {
    await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  } else {
    await page.getByRole('navigation', { name: 'HRIS modules' }).waitFor({ state: 'visible' });
  }
}

async function navigateTo(page, label) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) {
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
  }
  await navigation.getByRole('button', { name: label, exact: true }).click();
}

async function assertVisibleText(locator, text) {
  await locator.waitFor({ state: 'visible' });
  const deadline = Date.now() + 15000;
  let actual = '';
  while (Date.now() < deadline) {
    actual = await locator.innerText().catch(() => '');
    if (actual.includes(text)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Expected UI text ${JSON.stringify(text)}; received ${JSON.stringify(actual)}.`);
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  if (dimensions.document > dimensions.viewport) {
    throw new Error(`${label} overflowed ${dimensions.viewport}px to ${dimensions.document}px.`);
  }
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const pmPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await pmPage.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(pmPage, process.env.HRIS_LOCAL_PM_EMAIL);
  await navigateTo(pmPage, 'Project Workspace');
  await assertNoHorizontalOverflow(pmPage, 'Mobile Project Workspace');
  const project = pmPage.locator('article').filter({ hasText: process.env.HRIS_LOCAL_PROJECT_CODE }).first();
  await project.waitFor({ state: 'visible' });
  const manager = project.getByRole('region', { name: 'Project task management' });
  await manager.getByRole('button', { name: 'New task' }).click();
  await manager.getByLabel('Task title *').fill(process.env.HRIS_LOCAL_TASK_TITLE);
  await manager.locator('fieldset label').filter({ hasText: 'Synthetic Employee A' }).getByRole('checkbox').check();
  await manager.getByRole('button', { name: 'Create task' }).click();
  await assertNoHorizontalOverflow(pmPage, 'Mobile task creation');

  const task = manager.locator('article').filter({ hasText: process.env.HRIS_LOCAL_TASK_TITLE });
  await assertVisibleText(task, 'Synthetic Employee A');
  await task.getByLabel(`Add member to ${process.env.HRIS_LOCAL_TASK_TITLE}`)
    .selectOption(process.env.HRIS_LOCAL_COLLABORATOR_ALLOCATION_ID);
  await task.getByRole('button', { name: 'Add member', exact: true }).click();
  await assertNoHorizontalOverflow(pmPage, 'Mobile task member assignment');
  await assertVisibleText(task, 'Synthetic Absent Employee A');
  await task.getByRole('button', { name: 'Start task' }).click();
  await assertVisibleText(task, 'in progress');

  await task.getByRole('button', { name: 'Release Synthetic Absent Employee A from ' + process.env.HRIS_LOCAL_TASK_TITLE }).click();
  const releaseDialog = pmPage.getByRole('alertdialog');
  await assertVisibleText(releaseDialog, 'Collaborators whose assignments overlapped will receive required peer reviews. The release will not wait for feedback.');
  await releaseDialog.getByRole('button', { name: 'Cancel' }).click();
  await releaseDialog.waitFor({ state: 'detached' });
  await pmPage.waitForFunction(title => document.activeElement?.textContent?.trim() === title, process.env.HRIS_LOCAL_TASK_TITLE);
  await task.getByRole('button', { name: 'Release Synthetic Absent Employee A from ' + process.env.HRIS_LOCAL_TASK_TITLE }).waitFor({ state: 'visible' });
  await task.getByRole('button', { name: 'Release Synthetic Absent Employee A from ' + process.env.HRIS_LOCAL_TASK_TITLE }).click();
  await pmPage.getByRole('alertdialog').getByRole('button', { name: 'Confirm release' }).click();
  await assertVisibleText(task, 'Feedback Pending · 1 required reviews');
  await task.getByRole('button', { name: 'Mark complete' }).click();
  const completionDialog = pmPage.getByRole('alertdialog');
  await pmPage.keyboard.press('Escape');
  await completionDialog.waitFor({ state: 'detached' });
  await pmPage.waitForFunction(title => document.activeElement?.textContent?.trim() === title, process.env.HRIS_LOCAL_TASK_TITLE);
  await assertVisibleText(task, 'in progress');
  await task.getByRole('button', { name: 'Mark complete' }).click();
  await pmPage.getByRole('alertdialog').getByRole('button', { name: 'Confirm completion' }).click();
  await assertVisibleText(task, 'Feedback Pending · 2 required reviews');
  await assertVisibleText(manager.getByRole('status').filter({ hasText: 'Task completed.' }), 'Task completed.');
  if ((await task.innerText()).includes('Mark complete')) throw new Error('The UI left the completed task actionable.');
  await assertNoHorizontalOverflow(pmPage, 'Mobile task completion and feedback state');

  const reviewerPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await reviewerPage.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(reviewerPage, process.env.HRIS_LOCAL_REVIEWER_EMAIL);
  await navigateTo(reviewerPage, 'My Projects');
  await assertNoHorizontalOverflow(reviewerPage, 'Mobile peer-review inbox');
  await reviewerPage.getByRole('heading', { name: 'My project work' }).waitFor({ state: 'visible' });
  const review = reviewerPage.locator('article').filter({ hasText: process.env.HRIS_LOCAL_TASK_TITLE });
  await review.waitFor({ state: 'visible' });
  await review.getByLabel('Quality of Work').selectOption('not_observed');
  await review.getByLabel('Collaboration & Teamwork').selectOption('5');
  await review.getByLabel('Delivery & Reliability').selectOption('4');
  await review.getByLabel('Ownership & Communication').selectOption('3');
  await review.getByLabel('Comments (optional)').fill('Local Supabase browser integration review.');
  await review.getByRole('button', { name: 'Submit review' }).click();
  await assertVisibleText(reviewerPage.getByRole('status').filter({ hasText: 'Review for Synthetic Employee A submitted.' }),
    'Review for Synthetic Employee A submitted.');
  await assertNoHorizontalOverflow(reviewerPage, 'Mobile peer-review submission');
  await review.waitFor({ state: 'detached' });

  const revieweePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await revieweePage.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(revieweePage, process.env.HRIS_LOCAL_REVIEWEE_EMAIL);
  await navigateTo(revieweePage, 'My Performance');
  const history = revieweePage.getByRole('region', { name: 'Project peer-review history' });
  await assertVisibleText(history, process.env.HRIS_LOCAL_TASK_TITLE);
  await assertVisibleText(history, 'Feedback from Synthetic Absent Employee A');
  await assertVisibleText(history, 'Not Observed');
  await assertVisibleText(history, '5/5');

  await revieweePage.setViewportSize({ width: 375, height: 812 });
  const width = await revieweePage.evaluate(() => document.documentElement.scrollWidth);
  if (width > 375) throw new Error(`Project review UI overflowed a 375px viewport to ${width}px.`);
  console.log('Mobile 375px browser-to-local-Supabase task, review submission, and performance-history journey passed.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
