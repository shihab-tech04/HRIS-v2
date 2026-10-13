// Exercises the employee learning workflow against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_LEARNING_EMAIL', 'HRIS_LOCAL_LEARNING_MANAGER_EMAIL', 'HRIS_LOCAL_LEARNING_TENANT_ID',
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

async function signIn(page, email = process.env.HRIS_LOCAL_LEARNING_EMAIL) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(email);
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
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_learning_context')
      && route.request().method() === 'POST' && blockInitialContext) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary learning outage.' }) });
      return;
    }
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_learning_join_links')
      && route.request().method() === 'POST' && blockNextJoinLinks) {
      blockNextJoinLinks = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary meeting-link outage.' }) });
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
  await page.getByRole('alertdialog').getByRole('button', { name: 'Keep skill' }).click();
  await skillCard.getByText('Technical communication', { exact: true }).waitFor({ state: 'visible' });
  await removeSkillButton.click();
  await page.keyboard.press('Escape');
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  const skillDeleteResponse = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_employee_delete_my_skill') && response.status() === 200);
  await removeSkillButton.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove skill', exact: true }).click();
  await skillDeleteResponse;
  await page.getByText('Skill removed from your profile.', { exact: true }).waitFor({ state: 'visible' });
  await skillCard.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopSkillRefresh = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/hris_get_my_learning_context') && response.status() === 200);
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await desktopSkillRefresh;
  if (await page.locator(`[data-learning-skill="${savedSkill.id}"]`).count()) throw new Error('Removed skill reappeared after a server-backed refresh.');
  await assertNoOverflow(page, 'Skill profile persistence desktop');
  await page.setViewportSize({ width: 375, height: 812 });

  await directProgram.getByLabel('Choose session for QA A Direct Learning').selectOption('91000000-0000-4000-8000-000000000001');
  const enrollmentResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_employee_enroll_learning'));
  blockNextJoinLinks = true;
  await directProgram.getByRole('button', { name: 'Enroll now' }).click();
  const enrollment = await rpcBody(await enrollmentResponse);
  const enrollmentCard = page.locator(`[data-learning-enrollment="${enrollment.id}"]`);
  await enrollmentCard.getByText('QA A Direct Learning', { exact: true }).waitFor({ state: 'visible' });
  await enrollmentCard.getByText('Enrolled', { exact: true }).waitFor({ state: 'visible' });
  const joinLink = enrollmentCard.getByRole('link', { name: 'Join online session' });
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
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(hris_get_learning_requests|hris_resolve_learning_request)$/);
    if (rpc && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.p_tenant_id) rpcTenants.push(body.p_tenant_id);
    }
  });
  await signIn(managerPage, process.env.HRIS_LOCAL_LEARNING_MANAGER_EMAIL);
  await openLearningRequests(managerPage);
  const managerRequestCard = managerPage.locator(`[data-learning-request="${finalRequest.id}"]`);
  await managerRequestCard.getByRole('heading', { name: 'QA A Approval Learning' }).waitFor({ state: 'visible' });
  await managerRequestCard.getByText('Approval via the learning manager queue.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Learning manager queue mobile');
  await managerRequestCard.getByRole('button', { name: 'Approve' }).click();
  const resolutionResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_resolve_learning_request'));
  await managerPage.getByRole('alertdialog').getByLabel('Update for the employee').fill('Approved from the manager queue.');
  await managerPage.getByRole('alertdialog').getByRole('button', { name: 'Confirm approval' }).click();
  const decision = await rpcBody(await resolutionResponse);
  if (decision.status !== 'enrolled' || decision.id !== finalRequest.id) throw new Error(`Manager approval returned an unexpected result: ${JSON.stringify(decision)}.`);
  await managerRequestCard.waitFor({ state: 'detached' });
  await managerPage.getByText('Synthetic Employee A is enrolled in QA A Approval Learning.', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(managerPage, 'Learning manager queue after approval mobile');
  await managerPage.setViewportSize({ width: 1280, height: 900 });
  const refreshedQueue = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_learning_requests'));
  await managerPage.getByRole('button', { name: 'Refresh learning requests' }).click();
  await refreshedQueue;
  await managerPage.waitForFunction(() => document.querySelectorAll('[data-learning-request]').length === 1);
  if (await managerPage.locator('[data-learning-request]').count() !== 1) {
    throw new Error('Manager queue should retain only the separate capacity-blocked request after approval.');
  }
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
  await managerPage.getByLabel('Target skills (comma-separated)').fill('Learning Administration, Facilitation');
  const programResponse = managerPage.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_learning_program'));
  await managerPage.getByRole('button', { name: 'Create program', exact: true }).click();
  const createdProgram = await rpcBody(await programResponse);
  const managerProgramCard = managerPage.locator(`[data-admin-learning-program="${createdProgram.id}"]`);
  await managerProgramCard.waitFor({ state: 'visible' });
  await managerProgramCard.getByText(programTitle, { exact: true }).waitFor({ state: 'visible' });
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
  await managerContext.close();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Refresh learning' }).click();
  await page.locator(`[data-learning-enrollment="${request.id}"]`).getByText('Cancelled', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Learning desktop workspace');
  if (rpcTenants.some(id => id !== process.env.HRIS_LOCAL_LEARNING_TENANT_ID)) {
    throw new Error(`Learning UI requested an unexpected tenant: ${rpcTenants.join(', ')}.`);
  }
  if (directLearningTableReads.length) throw new Error(`Learning UI bypassed its tenant-scoped RPCs: ${directLearningTableReads.join(', ')}.`);
  console.log('Local Auth-to-Postgres employee skill create/edit/delete with retry and refresh recovery, employee request, tenant-scoped manager approval, program/session administration, responsive roster retry, authorized session join link, enrollment, and cancellation passed.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
