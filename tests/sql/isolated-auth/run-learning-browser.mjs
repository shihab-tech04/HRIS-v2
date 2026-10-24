// Exercises the employee learning workflow against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { stopChildProcess } from './stop-child-process.mjs';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_LEARNING_EMAIL', 'HRIS_LOCAL_LEARNING_MANAGER_EMAIL', 'HRIS_LOCAL_LEARNING_TENANT_ID',
  'HRIS_LOCAL_LEARNING_COMPLETION_ENROLLMENT_ID', 'HRIS_LOCAL_LEARNING_COMPLETION_PROGRAM_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = await new Promise((resolvePort, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select an available loopback port for the learning browser journey.')));
      return;
    }
    probe.close(error => error ? reject(error) : resolvePort(String(address.port)));
  });
});
const origin = `http://127.0.0.1:${port}`;
let authOutcome = 'no password-token response observed';
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

async function signIn(page, email = process.env.HRIS_LOCAL_LEARNING_EMAIL) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.request().method() !== 'POST' || url.pathname !== '/auth/v1/token' || url.searchParams.get('grant_type') !== 'password') return;
    authOutcome = `HTTP ${response.status()}`;
    void response.json().then(body => {
      const code = String(body.error_code || body.code || body.error || '');
      const message = String(body.msg || body.message || '').replace(email, '[synthetic account]');
      authOutcome += `${code ? `, ${code}` : ''}${message ? `: ${message.slice(0, 180)}` : ''}`;
    }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  try {
    await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    const headings = (await page.getByRole('heading').allTextContents()).join(' | ').slice(0, 240);
    const alerts = (await page.getByRole('alert').allInnerTexts()).join(' | ').replace(email, '[synthetic account]').slice(0, 240);
    throw new Error(`Learning browser sign-in did not reach workspace: ${authOutcome}; headings=${headings || '[none]'}; alerts=${alerts || '[none]'}.`);
  }
}

async function openLearning(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Learning', exact: true }).click();
  await page.getByRole('heading', { name: 'My Learning', exact: true }).waitFor({ state: 'visible' });
}

async function openLearningRequests(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Learning requests', exact: true }).click();
  await page.getByRole('heading', { name: 'Learning requests', exact: true }).waitFor({ state: 'visible' });
}

async function openLearningPrograms(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Learning programs', exact: true }).click();
  await page.getByRole('heading', { name: 'Learning programs', exact: true }).waitFor({ state: 'visible' });
}

async function assertFocused(locator, description) {
  await locator.waitFor({ state: 'visible' });
  const focusRecovered = await locator.evaluate(async element => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (element === document.activeElement) return true;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return element === document.activeElement;
  });
  if (!focusRecovered) {
    throw new Error(`${description} did not receive keyboard focus.`);
  }
}

async function openLearningCompletionQueue(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Learning completion review', exact: true }).click();
  await page.getByRole('heading', { name: 'Learning completion review', exact: true }).waitFor({ state: 'visible' });
}

async function openMyTimesheets(page, locale = 'en') {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const label = locale === 'bn' ? 'আমার টাইমশিট' : 'My Timesheets';
  await navigation.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('heading', { name: locale === 'bn' ? 'আমার টাইমশিটসমূহ' : 'My timesheets', exact: true }).waitFor({ state: 'visible' });
}

async function isolateExternalRequests(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
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
  let blockNextJoinLinks = false;
  let blockNextSkillSave = true;
  let blockNextCompletionSubmit = true;
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
    if (url.pathname === '/rest/v1/employee_skills') directLearningTableReads.push(url.pathname);
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(hris_employee_(?:enroll|request|cancel)_learning)$/);
    if (rpc && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
    }
    const skillRpc = url.pathname.match(/\/rest\/v1\/rpc\/(hris_employee_(?:save|delete)_my_skill)$/);
    if (skillRpc && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
    }
    const managerRpc = url.pathname.match(/\/rest\/v1\/rpc\/(hris_get_learning_requests|hris_resolve_learning_request|hris_get_learning_admin_catalog|hris_get_learning_session_roster|hris_save_learning_program|hris_save_learning_session|hris_get_my_learning_join_links)$/);
    if (managerRpc && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
    }
    const completionRpc = url.pathname.match(/\/rest\/v1\/rpc\/(hris_get_my_learning_completion_data|hris_get_learning_completion_queue|hris_employee_submit_learning_completion|hris_resolve_learning_completion)$/);
    if (completionRpc && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_employee_save_my_skill')
      && route.request().method() === 'POST' && blockNextSkillSave) {
      blockNextSkillSave = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary skill profile outage.' }) });
      return;
    }
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_employee_submit_learning_completion')
      && route.request().method() === 'POST' && blockNextCompletionSubmit) {
      blockNextCompletionSubmit = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary completion submission outage.' }) });
      return;
    }
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_learning_context')
      && route.request().method() === 'POST' && blockInitialContext) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary learning outage.' }) });
      return;
    }
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_learning_join_links')
      && route.request().method() === 'POST' && blockNextJoinLinks) {
      blockNextJoinLinks = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, prefer',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
        body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary meeting-link outage.' }),
      });
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
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await page.getByRole('heading', { name: 'আমার শেখা', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'আপনার দক্ষতার প্রোফাইল', exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('দক্ষতার নাম').waitFor({ state: 'visible' });
  if (await page.evaluate(() => document.documentElement.lang) !== 'bn') throw new Error('Learning locale switch did not update the document language.');
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.getByRole('heading', { name: 'My Learning', exact: true }).waitFor({ state: 'visible' });
  const unsafeCertificateEnrollment = page.locator('[data-learning-enrollment="92000000-0000-4000-8000-000000000003"]');
  if (await unsafeCertificateEnrollment.getByRole('link', { name: 'View certificate' }).count() !== 0) {
    throw new Error('An unsafe certificate URL must not render as a navigable link.');
  }
  await page.getByRole('heading', { name: 'QA B Private Learning' }).waitFor({ state: 'detached' });
  await assertNoOverflow(page, 'Learning catalog mobile');

  await page.getByRole('heading', { name: 'Your skill profile', exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Skill name').fill('Technical writing');
  await page.getByLabel('Proficiency (optional)').fill('Used in customer documentation');
  const failedSkillSave = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_save_my_skill') && response.status() === 503);
  await page.getByRole('button', { name: 'Add skill', exact: true }).click();
  await failedSkillSave;
  const skillProfileAlert = page.locator('[aria-labelledby="my-learning-skills"] [role="alert"]');
  await skillProfileAlert.waitFor({ state: 'visible' });
  if (!(await skillProfileAlert.innerText()).trim()) throw new Error('A failed skill save must present a readable recovery message.');
  if (await page.getByLabel('Skill name').inputValue() !== 'Technical writing'
    || await page.getByLabel('Proficiency (optional)').inputValue() !== 'Used in customer documentation') {
    throw new Error('A failed skill save must preserve the employee-entered draft for retry.');
  }
  const skillSaveResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_save_my_skill') && response.status() === 200);
  await page.getByRole('button', { name: 'Add skill', exact: true }).click();
  const savedSkill = await rpcBody(await skillSaveResponse);
  await page.getByText('Your skill profile was saved. It remains unverified until your organization verifies it.', { exact: true }).waitFor({ state: 'visible' });
  const skillCard = page.locator(`[data-learning-skill="${savedSkill.id}"]`);
  await skillCard.getByText('Technical writing', { exact: true }).waitFor({ state: 'visible' });
  await skillCard.getByText('Used in customer documentation · Self-reported', { exact: true }).waitFor({ state: 'visible' });
  const skillRefreshResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_context') && response.status() === 200);
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await skillRefreshResponse;
  await page.locator(`[data-learning-skill="${savedSkill.id}"]`).getByText('Technical writing', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Skill profile persistence mobile');

  await skillCard.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Skill name').fill('Technical communication');
  await page.getByLabel('Proficiency (optional)').fill('Clear written updates');
  const skillEditResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_save_my_skill') && response.status() === 200);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await skillEditResponse;
  await skillCard.getByText('Technical communication', { exact: true }).waitFor({ state: 'visible' });

  const removeSkillButton = skillCard.getByRole('button', { name: 'Remove Technical communication' });
  await removeSkillButton.click();
  await assertFocused(page.getByRole('alertdialog').getByRole('button', { name: 'Keep skill' }), 'Skill dialog initial action');
  await page.keyboard.press('Shift+Tab');
  await assertFocused(page.getByRole('alertdialog').getByRole('button', { name: 'Remove skill', exact: true }), 'Skill dialog reverse focus wrap');
  await page.keyboard.press('Tab');
  await assertFocused(page.getByRole('alertdialog').getByRole('button', { name: 'Keep skill' }), 'Skill dialog forward focus wrap');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Keep skill' }).click();
  await assertFocused(removeSkillButton, 'Keep skill cancellation focus recovery');
  await skillCard.getByText('Technical communication', { exact: true }).waitFor({ state: 'visible' });
  await removeSkillButton.click();
  await page.keyboard.press('Escape');
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await assertFocused(removeSkillButton, 'Escape cancellation focus recovery');
  const skillDeleteResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_delete_my_skill') && response.status() === 200);
  const deleteRefreshContext = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_context') && response.status() === 200);
  const deleteRefreshJoinLinks = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_join_links') && response.status() === 200);
  await removeSkillButton.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove skill', exact: true }).click();
  await skillDeleteResponse;
  await Promise.all([deleteRefreshContext, deleteRefreshJoinLinks]);
  await page.getByText('Skill removed from your profile.', { exact: true }).waitFor({ state: 'visible' });
  await assertFocused(page.getByRole('heading', { name: 'Your skill profile', exact: true }), 'Skill removal focus recovery');
  await skillCard.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopSkillRefresh = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_context') && response.status() === 200);
  const desktopSkillJoinRefresh = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_join_links') && response.status() === 200);
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await Promise.all([desktopSkillRefresh, desktopSkillJoinRefresh]);
  if (await page.locator(`[data-learning-skill="${savedSkill.id}"]`).count()) throw new Error('Removed skill reappeared after a server-backed refresh.');
  await assertNoOverflow(page, 'Skill profile persistence desktop');
  console.log('E02-12_SKILL_PROFILE_BROWSER_PASS');
  await page.setViewportSize({ width: 375, height: 812 });

  await directProgram.getByLabel('Choose session for QA A Direct Learning').selectOption('91000000-0000-4000-8000-000000000001');
  const enrollmentResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_enroll_learning'));
  blockNextJoinLinks = true;
  const failedJoinLinkRead = page.waitForResponse(response =>
    response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_join_links') && response.status() === 503);
  await directProgram.getByRole('button', { name: 'Enroll now' }).click();
  const enrollment = await rpcBody(await enrollmentResponse);
  const enrollmentCard = page.locator(`[data-learning-enrollment="${enrollment.id}"]`);
  await enrollmentCard.getByText('QA A Direct Learning', { exact: true }).waitFor({ state: 'visible' });
  await enrollmentCard.getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  const joinLink = enrollmentCard.getByRole('link', { name: 'Join online session' });
  await failedJoinLinkRead;
  await page.getByText('Online session links could not be loaded. Refresh to try again.', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await joinLink.waitFor({ state: 'visible' });
  if (await joinLink.getAttribute('href') !== 'https://meet.example.test/qa-learning') throw new Error('The enrolled employee did not receive the scheduled session meeting link.');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Learning session join action desktop');
  await joinLink.waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 375, height: 812 });

  await requestProgram.getByLabel('Choose session for QA A Approval Learning').selectOption('91000000-0000-4000-8000-000000000002');
  await requestProgram.getByLabel('Reason for QA A Approval Learning').fill('Practice leadership with my team.');
  const requestResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_request_learning'));
  await requestProgram.getByRole('button', { name: 'Request approval' }).click();
  const request = await rpcBody(await requestResponse);
  const requestCard = page.locator(`[data-learning-enrollment="${request.id}"]`);
  await requestCard.getByText('QA A Approval Learning', { exact: true }).waitFor({ state: 'visible' });
  await requestCard.getByText('Requested', { exact: true }).waitFor({ state: 'visible' });
  await requestCard.getByText('Practice leadership with my team.', { exact: false }).waitFor({ state: 'visible' });
  if (await requestCard.getByRole('link', { name: 'Join online session' }).count()) throw new Error('An unapproved learning request must not receive a session join link.');
  await assertNoOverflow(page, 'Learning actions mobile');

  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await page.locator(`[data-learning-enrollment="${enrollment.id}"]`).getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  await page.locator(`[data-learning-enrollment="${request.id}"]`).getByText('Requested', { exact: true }).waitFor({ state: 'visible' });

  const enrollmentHistory = page.locator(`[data-learning-enrollment="${enrollment.id}"]`);
  await enrollmentHistory.getByRole('button', { name: 'Cancel enrollment' }).click();
  await assertFocused(page.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }), 'Enrollment dialog initial action');
  await page.keyboard.press('Shift+Tab');
  await assertFocused(page.getByRole('alertdialog').getByRole('button', { name: 'Confirm cancellation' }), 'Enrollment dialog reverse focus wrap');
  await page.keyboard.press('Tab');
  await assertFocused(page.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }), 'Enrollment dialog forward focus wrap');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();
  await assertFocused(enrollmentHistory.getByRole('button', { name: 'Cancel enrollment' }), 'Keep enrollment cancellation focus recovery');
  await enrollmentHistory.getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  await enrollmentHistory.getByRole('button', { name: 'Cancel enrollment' }).click();
  const cancelResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_cancel_learning'));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm cancellation' }).click();
  await cancelResponse;
  await assertFocused(page.getByRole('heading', { name: 'My Learning', exact: true }), 'Enrollment cancellation focus recovery');
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

  await requestProgram.getByLabel('Choose session for QA A Approval Learning').selectOption('91000000-0000-4000-8000-000000000002');
  await requestProgram.getByLabel('Reason for QA A Approval Learning').fill('Approval via the learning manager queue.');
  const finalRequestResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_request_learning'));
  await requestProgram.getByRole('button', { name: 'Request approval' }).click();
  const finalRequest = await rpcBody(await finalRequestResponse);
  await page.locator(`[data-learning-enrollment="${finalRequest.id}"]`).getByText('Requested', { exact: true }).waitFor({ state: 'visible' });

  const managerContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const managerPage = await managerContext.newPage();
  await isolateExternalRequests(managerPage);
  managerPage.on('request', request => {
    const url = new URL(request.url());
    if (/\/rest\/v1\/(learning_programs|learning_sessions|learning_enrollments)(\?|$)/.test(url.pathname + url.search)) {
      directLearningTableReads.push(url.pathname);
    }
  });
  managerPage.on('request', request => {
    const url = new URL(request.url());
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(hris_get_learning_requests|hris_resolve_learning_request|hris_get_learning_completion_queue|hris_resolve_learning_completion)$/);
    if (rpc && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
    }
  });
  await signIn(managerPage, process.env.HRIS_LOCAL_LEARNING_MANAGER_EMAIL);
  await openLearningRequests(managerPage);
  await managerPage.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await managerPage.getByRole('heading', { name: 'শেখার অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  await managerPage.getByText('মতামত অপেক্ষমাণ', { exact: true }).first().waitFor({ state: 'visible' });
  if (await managerPage.evaluate(() => document.documentElement.lang) !== 'bn') throw new Error('Manager learning locale did not update document language.');
  await managerPage.getByRole('button', { name: 'Switch language to English' }).click();
  await managerPage.getByRole('heading', { name: 'Learning requests', exact: true }).waitFor({ state: 'visible' });
  const managerRequestCard = managerPage.locator(`[data-learning-request="${finalRequest.id}"]`);
  await managerRequestCard.getByRole('heading', { name: 'QA A Approval Learning' }).waitFor({ state: 'visible' });
  await managerRequestCard.getByText('Approval via the learning manager queue.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Learning manager queue mobile');
  await managerRequestCard.getByRole('button', { name: 'Approve' }).click();
  const requestDecisionDialog = managerPage.getByRole('alertdialog');
  const employeeUpdate = requestDecisionDialog.getByLabel('Update for the employee');
  const confirmLearningApproval = requestDecisionDialog.getByRole('button', { name: 'Confirm approval' });
  if (!(await employeeUpdate.evaluate(element => element === document.activeElement))) throw new Error('Learning approval dialog did not move keyboard focus into its note field.');
  await managerPage.keyboard.press('Shift+Tab');
  if (!(await confirmLearningApproval.evaluate(element => element === document.activeElement))) throw new Error('Shift+Tab escaped the learning approval dialog.');
  await managerPage.keyboard.press('Tab');
  if (!(await employeeUpdate.evaluate(element => element === document.activeElement))) throw new Error('Tab escaped the learning approval dialog.');
  const resolutionResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_resolve_learning_request'));
  await employeeUpdate.fill('Approved from the manager queue.');
  await confirmLearningApproval.click();
  const decision = await rpcBody(await resolutionResponse);
  if (decision.status !== 'enrolled' || decision.id !== finalRequest.id) throw new Error(`Manager approval returned an unexpected result: ${JSON.stringify(decision)}.`);
  await managerRequestCard.waitFor({ state: 'detached' });
  if (!(await managerPage.getByRole('heading', { name: 'Learning requests', exact: true }).evaluate(element => element === document.activeElement))) throw new Error('Learning decision did not restore focus after its request row was removed.');
  await managerPage.getByText('Synthetic Employee A is enrolled in QA A Approval Learning.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Learning manager queue after approval mobile');
  await managerPage.setViewportSize({ width: 1280, height: 900 });
  const refreshedQueue = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_learning_requests'));
  await managerPage.getByRole('button', { name: 'Refresh learning requests' }).click();
  const refreshedQueueResponse = await refreshedQueue;
  const refreshedQueueRows = await refreshedQueueResponse.json();
  if (!refreshedQueueResponse.ok() || !Array.isArray(refreshedQueueRows) || refreshedQueueRows.length !== 1
      || typeof refreshedQueueRows[0]?.id !== 'string') {
    throw new Error('Manager queue should retain only the separate capacity-blocked request after approval.');
  }
  await managerPage.waitForFunction((expectedId) => {
    const rows = [...document.querySelectorAll('[data-learning-request]')];
    return rows.length === 1 && rows[0].getAttribute('data-learning-request') === expectedId;
  }, refreshedQueueRows[0].id);
  await assertNoOverflow(managerPage, 'Learning manager queue desktop');

  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await page.locator(`[data-learning-enrollment="${finalRequest.id}"]`).getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  await page.locator(`[data-learning-enrollment="${finalRequest.id}"]`).getByText('Update: Approved from the manager queue.', { exact: true }).waitFor({ state: 'visible' });

  const programTitle = process.env.HRIS_LOCAL_MANAGER_PROGRAM_TITLE;
  if (!programTitle) throw new Error('Missing manager-published program title.');
  await managerPage.setViewportSize({ width: 375, height: 812 });
  await openLearningPrograms(managerPage);
  await assertNoOverflow(managerPage, 'Learning program manager workspace mobile');
  await managerPage.getByLabel('Program title *').fill(programTitle);
  await managerPage.getByLabel('Category', { exact: true }).fill('Professional Development');
  await managerPage.getByLabel('Provider', { exact: true }).fill('Local QA Provider');
  await managerPage.getByLabel('Delivery mode', { exact: true }).selectOption('hybrid');
  await managerPage.getByLabel('Employees may enroll directly').check();
  await managerPage.getByLabel('Require evidence before completion can be verified').check();
  await managerPage.getByLabel('Target skills (comma-separated)').fill('Learning Administration, Facilitation');
  const programResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_learning_program'));
  await managerPage.getByRole('button', { name: 'Create program', exact: true }).click();
  const createdProgram = await rpcBody(await programResponse);
  const managerProgramCard = managerPage.locator(`[data-admin-learning-program="${createdProgram.id}"]`);
  await managerProgramCard.waitFor({ state: 'visible' });
  await managerProgramCard.getByText(programTitle, { exact: true }).waitFor({ state: 'visible' });
  await managerProgramCard.getByText('Completion evidence required', { exact: true }).waitFor({ state: 'visible' });
  await managerProgramCard.getByRole('button', { name: `Schedule session for ${programTitle}` }).click();
  await managerProgramCard.getByLabel('Trainer').fill('Synthetic Learning Trainer');
  await managerProgramCard.getByLabel('Location').fill('QA Learning Room');
  await managerProgramCard.getByLabel('Start date and time').fill('2030-11-15T10:00');
  await managerProgramCard.getByLabel('End date and time').fill('2030-11-15T11:00');
  await managerProgramCard.getByLabel('Capacity (blank means no limit)').fill('2');
  const sessionResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_learning_session'));
  await managerProgramCard.getByRole('button', { name: 'Schedule session', exact: true }).click();
  const createdSession = await rpcBody(await sessionResponse);
  await managerProgramCard.getByText('QA Learning Room', { exact: false }).waitFor({ state: 'visible' });
  let injectRosterFailure = true;
  await managerPage.route('**/rest/v1/rpc/hris_get_learning_session_roster', async route => {
    if (injectRosterFailure) {
      injectRosterFailure = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary roster outage.' }) });
      return;
    }
    await route.continue();
  });
  const emptyRosterResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_learning_session_roster'));
  await managerProgramCard.getByRole('button', { name: `View enrolled employees for ${programTitle}` }).click();
  const emptyRoster = managerProgramCard.locator(`[data-learning-session-roster="${createdSession.id}"]`);
  await emptyRosterResponse;
  await emptyRoster.getByRole('alert').waitFor({ state: 'visible' });
  const retriedEmptyRosterResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_learning_session_roster') && response.status() === 200);
  await emptyRoster.getByRole('button', { name: 'Retry roster' }).click();
  await retriedEmptyRosterResponse;
  await emptyRoster.getByText('No employees are currently enrolled in this session.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Empty session roster mobile');
  await managerProgramCard.getByRole('button', { name: `Hide enrolled employees for ${programTitle}` }).click();
  await assertNoOverflow(managerPage, 'Learning program and session creation mobile');

  await managerPage.setViewportSize({ width: 1280, height: 900 });
  await managerProgramCard.getByRole('button', { name: `Edit program ${programTitle}` }).click();
  if (!(await managerPage.getByLabel('Require evidence before completion can be verified').isChecked())) {
    throw new Error('The saved program evidence requirement was not restored in the edit form.');
  }
  await managerPage.getByLabel('Description', { exact: true }).fill('Published and updated through the tenant manager workspace.');
  const updateProgramResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_learning_program'));
  await managerPage.getByRole('button', { name: 'Save program', exact: true }).click();
  await rpcBody(await updateProgramResponse);
  await managerProgramCard.getByText('Published and updated through the tenant manager workspace.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Learning program update desktop');

  await page.setViewportSize({ width: 375, height: 812 });
  const employeeRefresh = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_my_learning_context'));
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await employeeRefresh;
  const employeeProgramCard = page.locator(`[data-learning-program="${createdProgram.id}"]`);
  await employeeProgramCard.getByText('Published and updated through the tenant manager workspace.', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel(`Choose session for ${programTitle}`).selectOption(createdSession.id);
  await employeeProgramCard.getByText('Completion evidence required', { exact: true }).waitFor({ state: 'visible' });
  const newEnrollmentResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_enroll_learning'));
  await employeeProgramCard.getByRole('button', { name: 'Enroll now', exact: true }).click();
  const newEnrollment = await rpcBody(await newEnrollmentResponse);
  const newEnrollmentCard = page.locator(`[data-learning-enrollment="${newEnrollment.id}"]`);
  await newEnrollmentCard.getByText(programTitle, { exact: true }).waitFor({ state: 'visible' });
  await newEnrollmentCard.getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  const persistedEmployeeRefresh = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_my_learning_context'));
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await persistedEmployeeRefresh;
  await page.locator(`[data-learning-enrollment="${newEnrollment.id}"]`).getByText(programTitle, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee enrollment in newly published learning session mobile');

  await managerPage.setViewportSize({ width: 375, height: 812 });
  const managerRosterRefresh = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_learning_admin_catalog'));
  await managerPage.getByRole('button', { name: 'Refresh learning programs' }).click();
  await managerRosterRefresh;
  const mobileRosterResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_learning_session_roster'));
  await managerProgramCard.getByRole('button', { name: `View enrolled employees for ${programTitle}` }).click();
  const enrolledRoster = managerProgramCard.locator(`[data-learning-session-roster="${createdSession.id}"]`);
  await mobileRosterResponse;
  await enrolledRoster.getByText('Synthetic Employee A', { exact: true }).waitFor({ state: 'visible' });
  await enrolledRoster.getByText('QA-A-001', { exact: false }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Enrolled employee roster mobile');
  await managerPage.setViewportSize({ width: 1280, height: 900 });
  await managerProgramCard.getByRole('button', { name: `Hide enrolled employees for ${programTitle}` }).click();
  const desktopRosterResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_learning_session_roster'));
  await managerProgramCard.getByRole('button', { name: `View enrolled employees for ${programTitle}` }).click();
  await desktopRosterResponse;
  await enrolledRoster.getByText('Synthetic Employee A', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Enrolled employee roster desktop');

  const completionEnrollmentId = process.env.HRIS_LOCAL_LEARNING_COMPLETION_ENROLLMENT_ID;
  const completionEmployeeCard = page.locator(`[data-learning-enrollment="${completionEnrollmentId}"]`);
  await completionEmployeeCard.getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  const completionSubmitButton = completionEmployeeCard.getByRole('button', { name: 'Mark completed', exact: true });
  const completionEvidenceInput = completionEmployeeCard.getByLabel('Supporting evidence (required)');
  if (!(await completionEvidenceInput.evaluate(input => input.required)) || await completionSubmitButton.isEnabled()) {
    throw new Error('Required learning evidence must be exposed as required and prevent submission until a file is selected.');
  }
  await completionEvidenceInput.setInputFiles({
    name: 'initial-completion-proof.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nSynthetic initial completion evidence\n'),
  });
  if (!(await completionSubmitButton.isEnabled())) throw new Error('Selecting required evidence did not enable submission.');
  const failedCompletionSubmit = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_submit_learning_completion') && response.status() === 503);
  await completionSubmitButton.click();
  await failedCompletionSubmit;
  await page.getByRole('alert').waitFor({ state: 'visible' });
  await completionEmployeeCard.getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  const completionSubmitResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_submit_learning_completion') && response.status() === 200);
  await completionSubmitButton.click();
  const submittedCompletion = await rpcBody(await completionSubmitResponse);
  if (submittedCompletion.status !== 'pending_verification') throw new Error('Learning completion did not enter Pending Verification.');
  await completionEmployeeCard.getByText('Pending Verification', { exact: true }).waitFor({ state: 'visible' });
  const pendingCatalogCard = page.locator(`[data-learning-program="${process.env.HRIS_LOCAL_LEARNING_COMPLETION_PROGRAM_ID}"]`);
  await pendingCatalogCard.getByText('Completion pending verification', { exact: true }).waitFor({ state: 'visible' });
  if (await pendingCatalogCard.getByRole('button', { name: /Enroll now|Request approval|এখনই নিবন্ধন করুন|অনুমোদনের অনুরোধ করুন/ }).count()) {
    throw new Error('A pending completion must remain one open assignment instead of offering a duplicate enrollment.');
  }
  await assertNoOverflow(page, 'Learning completion submission mobile');

  await managerPage.setViewportSize({ width: 375, height: 812 });
  await openLearningCompletionQueue(managerPage);
  await managerPage.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await managerPage.getByRole('heading', { name: 'শেখার সমাপ্তি পর্যালোচনা', exact: true }).waitFor({ state: 'visible' });
  const completionQueueCard = managerPage.locator(`[data-learning-completion="${completionEnrollmentId}"]`);
  await completionQueueCard.getByText('Synthetic Employee A', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Learning completion queue mobile');
  await completionQueueCard.getByRole('button', { name: 'সংশোধনের জন্য ফেরত দিন', exact: true }).click();
  const returnDialog = managerPage.getByRole('alertdialog');
  const returnReason = returnDialog.getByLabel('সংশোধনের কারণ');
  if (await returnDialog.getByRole('button', { name: 'ফেরত নিশ্চিত করুন', exact: true }).isEnabled()) {
    throw new Error('A return-for-correction decision must require a reason.');
  }
  if (!(await returnReason.evaluate(element => element === document.activeElement))) throw new Error('Learning return dialog did not move keyboard focus to its reason field.');
  await returnReason.fill('Please attach supporting evidence for this assignment.');
  const confirmLearningReturn = returnDialog.getByRole('button', { name: 'ফেরত নিশ্চিত করুন', exact: true });
  await managerPage.keyboard.press('Shift+Tab');
  if (!(await confirmLearningReturn.evaluate(element => element === document.activeElement))) throw new Error('Shift+Tab escaped the learning correction dialog.');
  await managerPage.keyboard.press('Tab');
  if (!(await returnReason.evaluate(element => element === document.activeElement))) throw new Error('Tab escaped the learning correction dialog.');
  const returnResponse = managerPage.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_resolve_learning_completion') && response.status() === 200);
  await confirmLearningReturn.click();
  const returnedCompletion = await rpcBody(await returnResponse);
  if (returnedCompletion.status !== 'returned_for_correction') throw new Error('Manager correction decision did not persist.');
  await completionQueueCard.waitFor({ state: 'detached' });
  if (!(await managerPage.getByRole('heading', { name: 'শেখার সমাপ্তি পর্যালোচনা', exact: true }).evaluate(element => element === document.activeElement))) throw new Error('Learning return did not restore focus after its submission row was removed.');
  await assertNoOverflow(managerPage, 'Learning completion returned mobile');

  const returnedContextRefresh = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_completion_data') && response.status() === 200);
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await returnedContextRefresh;
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await page.getByRole('heading', { name: 'আমার শেখা', exact: true }).waitFor({ state: 'visible' });
  await completionEmployeeCard.getByText('সংশোধনের জন্য ফেরত', { exact: true }).first().waitFor({ state: 'visible' });
  await completionEmployeeCard.getByRole('status').getByText('Please attach supporting evidence for this assignment.', { exact: true }).waitFor({ state: 'visible' });
  await pendingCatalogCard.getByText('সমাপ্তি সংশোধনের জন্য ফেরত দেওয়া হয়েছে', { exact: true }).waitFor({ state: 'visible' });
  if (await pendingCatalogCard.getByRole('button', { name: /Enroll now|Request approval|এখনই নিবন্ধন করুন|অনুমোদনের অনুরোধ করুন/ }).count()) {
    throw new Error('A returned completion must remain one open assignment until it is corrected and verified.');
  }
  await completionEmployeeCard.getByLabel('সহায়ক প্রমাণপত্র (আবশ্যক)').setInputFiles({
    name: 'completion-proof.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nSynthetic completion evidence\n'),
  });
  const resubmitResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_submit_learning_completion') && response.status() === 200);
  await completionEmployeeCard.getByRole('button', { name: 'যাচাইয়ের জন্য আবার জমা দিন', exact: true }).click();
  const resubmittedCompletion = await rpcBody(await resubmitResponse);
  if (resubmittedCompletion.status !== 'pending_verification') throw new Error('Corrected learning completion did not return to verification.');
  await completionEmployeeCard.getByText('যাচাইয়ের অপেক্ষায়', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Learning completion resubmitted mobile');

  await managerPage.setViewportSize({ width: 1280, height: 900 });
  const completionQueueRefresh = managerPage.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_learning_completion_queue') && response.status() === 200);
  await managerPage.getByRole('button', { name: 'সমাপ্তির পর্যালোচনা তালিকা রিফ্রেশ করুন' }).click();
  await completionQueueRefresh;
  await completionQueueCard.getByText('completion-proof.pdf', { exact: true }).waitFor({ state: 'visible' });
  await completionQueueCard.getByRole('button', { name: 'প্রমাণ দেখুন', exact: true }).click();
  await completionQueueCard.getByRole('link', { name: 'প্রমাণ খুলুন', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Learning completion queue desktop');
  await completionQueueCard.getByRole('button', { name: 'যাচাই করুন', exact: true }).click();
  const verifyDialog = managerPage.getByRole('alertdialog');
  const verificationNote = verifyDialog.getByLabel('যাচাইয়ের নোট');
  const confirmLearningVerification = verifyDialog.getByRole('button', { name: 'যাচাই নিশ্চিত করুন', exact: true });
  if (!(await verificationNote.evaluate(element => element === document.activeElement))) throw new Error('Learning verification dialog did not move keyboard focus to its note field.');
  await managerPage.keyboard.press('Shift+Tab');
  if (!(await confirmLearningVerification.evaluate(element => element === document.activeElement))) throw new Error('Shift+Tab escaped the learning verification dialog.');
  await managerPage.keyboard.press('Tab');
  if (!(await verificationNote.evaluate(element => element === document.activeElement))) throw new Error('Tab escaped the learning verification dialog.');
  await verificationNote.fill('Evidence reviewed.');
  const verifyResponse = managerPage.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_resolve_learning_completion') && response.status() === 200);
  await confirmLearningVerification.click();
  const verifiedCompletion = await rpcBody(await verifyResponse);
  if (verifiedCompletion.status !== 'completed' || !verifiedCompletion.verified_by) throw new Error('Verified completion did not persist its reviewer.');
  await completionQueueCard.waitFor({ state: 'detached' });

  const verifiedContextRefresh = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_completion_data') && response.status() === 200);
  await page.getByRole('button', { name: 'শেখার তথ্য রিফ্রেশ করুন' }).click();
  await verifiedContextRefresh;
  await completionEmployeeCard.getByText('সম্পন্ন', { exact: true }).waitFor({ state: 'visible' });
  await completionEmployeeCard.getByText('সহায়ক প্রমাণ: completion-proof.pdf', { exact: true }).first().waitFor({ state: 'visible' });
  await completionEmployeeCard.getByText(/যাচাইকারী/).waitFor({ state: 'visible' });
  await completionEmployeeCard.getByText('সমাপ্তি পর্যালোচনার ইতিহাস', { exact: true }).click();
  await completionEmployeeCard.getByText(/যাচাই করা হয়েছে/).waitFor({ state: 'visible' });
  await page.locator(`[data-verified-learning="${completionEnrollmentId}"]`).waitFor({ state: 'visible' });
  await page.locator('[data-learning-notification]').filter({ hasText: /QA A Direct Learning সম্পন্ন হওয়া যাচাই করা হয়েছে/ }).first().waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Verified learning completion mobile in Bengali');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Verified learning completion desktop in Bengali');
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.getByRole('heading', { name: 'My Learning', exact: true }).waitFor({ state: 'visible' });
  await managerContext.close();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await page.locator(`[data-learning-enrollment="${request.id}"]`).getByText('Cancelled', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Learning desktop workspace');

  const timesheetTenantIds = [];
  const directTimesheetReads = [];
  page.on('request', request => {
    const url = new URL(request.url());
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(hris_(?:get_my_timesheet_context|save_my_timesheet|submit_my_timesheet))$/);
    if (rpc && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) timesheetTenantIds.push(body.p_tenant_id);
    }
    if (/\/rest\/v1\/(timesheet_activities|timesheets|timesheet_entries)(\?|$)/.test(url.pathname + url.search)) {
      directTimesheetReads.push(url.pathname);
    }
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const initialTimesheetContext = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_timesheet_context') && response.status() === 200);
  await openMyTimesheets(page);
  await initialTimesheetContext;
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await page.getByRole('heading', { name: 'আমার টাইমশিটসমূহ', exact: true }).waitFor({ state: 'visible' });
  const timesheetContext = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_timesheet_context') && response.status() === 200);
  await page.getByRole('button', { name: 'রিফ্রেশ', exact: true }).click();
  await timesheetContext;
  await page.getByRole('button', { name: 'নতুন টাইমশিট', exact: true }).click();
  await page.getByLabel('সময়সীমার ধরন', { exact: true }).selectOption('daily');
  await page.getByRole('button', { name: 'এন্ট্রি যোগ করুন', exact: true }).click();
  await page.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  await page.getByRole('alert').getByText('প্রতিটি এন্ট্রির কার্যক্রম, কাজের তারিখ ও ঘণ্টা পূরণ করুন।', { exact: true }).waitFor({ state: 'visible' });
  const localToday = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  await page.getByLabel('সময়সীমা শুরু', { exact: true }).fill(localToday);
  await page.getByLabel('কাজের তারিখ', { exact: true }).fill(localToday);
  await page.getByLabel('কার্যক্রম', { exact: true }).selectOption('88888888-8888-4888-8888-888888888901');
  await page.getByLabel('ঘণ্টা', { exact: true }).fill('2.5');
  await page.getByLabel('নোট (ঐচ্ছিক)', { exact: true }).fill('Synthetic browser-to-database timesheet acceptance marker');
  await page.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(page, 'Bengali timesheet editor mobile');
  const saveTimesheetResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_save_my_timesheet') && response.status() === 200);
  await page.getByRole('button', { name: 'খসড়া সংরক্ষণ করুন', exact: true }).click();
  const savedTimesheetId = await (await saveTimesheetResponse).json();
  if (typeof savedTimesheetId !== 'string') throw new Error('Local Auth/Postgres timesheet save did not return its persisted ID.');
  const timesheetCard = page.locator(`[data-timesheet-id="${savedTimesheetId}"]`);
  await timesheetCard.getByText('QA A Delivery · QA-A-DELIVERY', { exact: true }).waitFor({ state: 'visible' });
  await timesheetCard.getByText('মোট ২.৫ ঘণ্টা · ১ এন্ট্রি', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Bengali persisted timesheet mobile');

  await page.reload();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  await openMyTimesheets(page, 'bn');
  const persistedTimesheet = page.locator(`[data-timesheet-id="${savedTimesheetId}"]`);
  await persistedTimesheet.getByText('QA A Delivery · QA-A-DELIVERY', { exact: true }).waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Bengali persisted timesheet desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  const submitTimesheetResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_submit_my_timesheet') && response.status() === 200);
  await persistedTimesheet.getByRole('button', { name: 'টাইমশিট জমা দিন', exact: true }).click();
  const submittedTimesheetId = await (await submitTimesheetResponse).json();
  if (submittedTimesheetId !== savedTimesheetId) throw new Error('Local timesheet submission returned a different record.');
  await persistedTimesheet.getByText('জমা হয়েছে', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.getByRole('heading', { name: 'My timesheets', exact: true }).waitFor({ state: 'visible' });
  await persistedTimesheet.getByText('Submitted', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'English submitted timesheet mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'English submitted timesheet desktop');
  if (timesheetTenantIds.some(id => id !== process.env.HRIS_LOCAL_LEARNING_TENANT_ID)) {
    throw new Error(`Timesheet UI requested an unexpected tenant: ${timesheetTenantIds.join(', ')}.`);
  }
  if (directTimesheetReads.length) throw new Error(`Timesheet UI bypassed its tenant-scoped RPCs: ${directTimesheetReads.join(', ')}.`);
  if (rpcTenants.some(id => id !== process.env.HRIS_LOCAL_LEARNING_TENANT_ID)) {
    throw new Error(`Learning UI requested an unexpected tenant: ${rpcTenants.join(', ')}.`);
  }
  if (directLearningTableReads.length) throw new Error(`Learning UI bypassed its tenant-scoped RPCs: ${directLearningTableReads.join(', ')}.`);
  console.log('Local Auth-to-Postgres employee skill create/edit/delete with retry and refresh recovery, learning completion submit/return/resubmit/verify with private evidence and notifications, employee request, tenant-scoped manager approval, program/session administration, responsive roster retry, authorized session join link, enrollment, and cancellation passed; employee timesheet draft creation, full reload persistence, tenant-scoped save/submit RPCs, Bengali validation, and 375px/1280px layouts also passed.');
} finally {
  if (browser) await browser.close();
  await stopChildProcess(server);
}
