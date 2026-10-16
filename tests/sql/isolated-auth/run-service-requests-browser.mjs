// Runs an employee service-request submission and refresh-recovery journey on disposable local Auth/Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_SERVICE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_SERVICE_MANAGER_EMAIL',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48379';
const origin = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: repo,
  env: { ...process.env, VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY },
  stdio: 'ignore',
});
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
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
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(size)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employee = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await isolateExternalRequests(employee);
  await employee.goto(origin);
  await employee.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_SERVICE_EMPLOYEE_EMAIL);
  await employee.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await employee.getByRole('button', { name: 'Sign in', exact: true }).click();
  await employee.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const nav = employee.getByRole('navigation', { name: 'HRIS modules' });
  await employee.getByRole('button', { name: 'Open navigation menu' }).click();
  if (await nav.getByRole('button', { name: 'Service Requests', exact: true }).count()) {
    throw new Error('An employee without employees.manage saw the HR service-request queue navigation.');
  }
  await nav.getByRole('button', { name: 'My Requests', exact: true }).click();
  await employee.getByRole('heading', { name: 'My Service Requests', exact: true }).waitFor({ state: 'visible' });
  await employee.getByText('Loading your requests…', { exact: true }).waitFor({ state: 'detached' });

  await employee.getByLabel('Reason or details').fill('This entry should be cleared without being sent.');
  const initialCount = await employee.locator('[data-service-request]').count();
  await employee.getByRole('button', { name: 'Clear', exact: true }).click();
  if (await employee.getByLabel('Reason or details').inputValue()) throw new Error('Clear did not cancel the unsent request text.');
  if (await employee.locator('[data-service-request]').count() !== initialCount) throw new Error('Clearing the form changed persisted requests.');

  await employee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await employee.getByRole('heading', { name: 'আমার পরিষেবা অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  if (initialCount === 0) await employee.getByText('এখনও কোনো পরিষেবা অনুরোধ নেই', { exact: true }).waitFor({ state: 'visible' });

  const reason = `Local employee service request ${Date.now()}`;
  await employee.getByLabel('অনুরোধের ধরন').selectOption({ label: 'চাকরির প্রত্যয়নপত্র' });
  await employee.getByLabel('কারণ বা বিস্তারিত').fill(reason);
  const submitResponsePromise = employee.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_my_service_request'));
  await employee.getByRole('button', { name: 'অনুরোধ জমা দিন', exact: true }).click();
  const response = await submitResponsePromise;
  const saved = await response.json();
  if (!response.ok() || !saved?.id || saved.status !== 'pending') {
    throw new Error(`Service request did not persist as pending: ${JSON.stringify(saved)}.`);
  }
  const card = employee.locator(`[data-service-request="${saved.id}"]`);
  await card.waitFor({ state: 'visible' });
  await card.getByText(reason, { exact: true }).waitFor({ state: 'visible' });
  await card.getByText('অপেক্ষমাণ', { exact: true }).first().waitFor({ state: 'visible' });
  await employee.getByRole('status').getByText('আপনার অনুরোধ জমা হয়েছে এবং এখন অপেক্ষমাণ।', { exact: true }).waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'আমার পরিষেবা অনুরোধ রিফ্রেশ করুন', exact: true }).click();
  await card.getByText(reason, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Bengali service request mobile');

  const historyPath = '**/rest/v1/rpc/hris_get_my_service_requests';
  await employee.route(historyPath, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporary local acceptance outage"}' }));
  await employee.getByRole('button', { name: 'আমার পরিষেবা অনুরোধ রিফ্রেশ করুন', exact: true }).click();
  await employee.getByRole('alert').getByText('পরিষেবা অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।', { exact: true }).waitFor({ state: 'visible' });
  await employee.unroute(historyPath);
  await employee.getByRole('button', { name: 'আবার চেষ্টা করুন', exact: true }).click();
  await card.getByText(reason, { exact: true }).waitFor({ state: 'visible' });
  await card.getByText('অপেক্ষমাণ', { exact: true }).first().waitFor({ state: 'visible' });
  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employee, 'Bengali service request desktop');
  await employee.getByRole('button', { name: 'Switch language to English' }).click();
  await employee.getByRole('heading', { name: 'My Service Requests', exact: true }).waitFor({ state: 'visible' });
  await card.getByText('Pending', { exact: true }).first().waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'English service request desktop');

  const manager = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await isolateExternalRequests(manager);
  await manager.goto(origin);
  await manager.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_SERVICE_MANAGER_EMAIL);
  await manager.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await manager.getByRole('button', { name: 'Sign in', exact: true }).click();
  await manager.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const managerNav = manager.getByRole('navigation', { name: 'HRIS modules' });
  await manager.getByRole('button', { name: 'Open navigation menu' }).click();
  await managerNav.getByRole('button', { name: 'Service Requests', exact: true }).click();
  await manager.getByRole('heading', { name: 'Service Requests', exact: true }).waitFor({ state: 'visible' });
  const managerCard = manager.locator(`[data-service-request="${saved.id}"]`);
  await managerCard.getByText('Synthetic Employee A', { exact: false }).waitFor({ state: 'visible' });
  await managerCard.getByText('Pending', { exact: true }).first().waitFor({ state: 'visible' });

  const decisionPath = '**/rest/v1/rpc/hris_resolve_tenant_service_request';
  await manager.route(decisionPath, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporary local acceptance outage"}' }));
  await managerCard.getByRole('button', { name: 'Start review', exact: true }).click();
  await manager.getByRole('alert').getByText('This action could not be saved. Refresh the queue and try again.', { exact: true }).waitFor({ state: 'visible' });
  await manager.getByRole('button', { name: 'Refresh before retrying', exact: true }).click();
  await manager.unroute(decisionPath);
  await managerCard.getByText('Pending', { exact: true }).first().waitFor({ state: 'visible' });
  await managerCard.getByRole('button', { name: 'Start review', exact: true }).click();
  await managerCard.getByText('In progress', { exact: true }).first().waitFor({ state: 'visible' });

  await manager.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(manager, 'English service request manager desktop');
  await managerCard.getByRole('button', { name: 'Complete request', exact: true }).click();
  const outcome = `Synthetic HR resolution outcome ${Date.now()}`;
  const outcomeField = managerCard.getByLabel('Record the resolution outcome', { exact: true });
  const saveDecision = managerCard.getByRole('button', { name: 'Save decision', exact: true });
  if (await saveDecision.isEnabled()) throw new Error('Completion was available without a recorded resolution outcome.');
  await outcomeField.fill(outcome);
  await saveDecision.click();
  await managerCard.getByText('Completed', { exact: true }).first().waitFor({ state: 'visible' });
  await managerCard.getByText(outcome, { exact: true }).first().waitFor({ state: 'visible' });

  const queuePath = '**/rest/v1/rpc/hris_get_tenant_service_requests';
  await manager.route(queuePath, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporary local acceptance outage"}' }));
  await manager.getByRole('button', { name: 'Refresh service request queue', exact: true }).click();
  await manager.getByRole('alert').getByText('Unable to load service requests. Try refreshing the queue.', { exact: true }).waitFor({ state: 'visible' });
  await manager.unroute(queuePath);
  await manager.getByRole('button', { name: 'Try again', exact: true }).click();
  await managerCard.getByText('Completed', { exact: true }).first().waitFor({ state: 'visible' });

  const secondReason = `Synthetic shift change request ${Date.now()}`;
  await employee.getByLabel('Request type').selectOption('shift_change');
  await employee.getByLabel('Reason or details').fill(secondReason);
  const secondSubmitPromise = employee.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_my_service_request'));
  await employee.getByRole('button', { name: 'Submit request', exact: true }).click();
  const secondResponse = await secondSubmitPromise;
  const secondSaved = await secondResponse.json();
  if (!secondResponse.ok() || !secondSaved?.id || secondSaved.status !== 'pending') {
    throw new Error(`Second service request did not persist as pending: ${JSON.stringify(secondSaved)}.`);
  }
  const secondManagerCard = manager.locator(`[data-service-request="${secondSaved.id}"]`);
  await manager.getByRole('button', { name: 'Refresh service request queue', exact: true }).click();
  await secondManagerCard.getByText('Pending', { exact: true }).first().waitFor({ state: 'visible' });
  await secondManagerCard.getByRole('button', { name: 'Reject', exact: true }).click();
  await secondManagerCard.getByRole('button', { name: 'Cancel', exact: true }).click();
  await secondManagerCard.getByText('Pending', { exact: true }).first().waitFor({ state: 'visible' });
  await secondManagerCard.getByRole('button', { name: 'Reject', exact: true }).click();
  const rejectionField = secondManagerCard.getByLabel('Reason for rejection', { exact: true });
  const saveRejection = secondManagerCard.getByRole('button', { name: 'Save decision', exact: true });
  if (await saveRejection.isEnabled()) throw new Error('Rejection was available without a recorded reason.');
  const rejection = 'The requested schedule is not available.';
  await rejectionField.fill(rejection);
  await saveRejection.click();
  await secondManagerCard.getByText('Rejected', { exact: true }).first().waitFor({ state: 'visible' });
  await secondManagerCard.getByText(rejection, { exact: true }).first().waitFor({ state: 'visible' });

  await manager.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await manager.getByRole('heading', { name: 'পরিষেবা অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  await secondManagerCard.getByText('প্রত্যাখ্যাত', { exact: true }).first().waitFor({ state: 'visible' });
  await manager.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(manager, 'Bengali service request manager mobile');
  await manager.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(manager, 'Bengali service request manager desktop');

  await employee.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await employee.setViewportSize({ width: 375, height: 812 });
  await employee.getByRole('button', { name: 'আমার পরিষেবা অনুরোধ রিফ্রেশ করুন', exact: true }).click();
  const finalEmployeeCard = employee.locator(`[data-service-request="${saved.id}"]`);
  const finalRejectedCard = employee.locator(`[data-service-request="${secondSaved.id}"]`);
  await finalEmployeeCard.getByText('সম্পন্ন', { exact: true }).first().waitFor({ state: 'visible' });
  await finalEmployeeCard.getByText(outcome, { exact: true }).first().waitFor({ state: 'visible' });
  await finalRejectedCard.getByText('প্রত্যাখ্যাত', { exact: true }).first().waitFor({ state: 'visible' });
  await finalRejectedCard.getByText(rejection, { exact: true }).first().waitFor({ state: 'visible' });
  await finalEmployeeCard.getByText('অবস্থার ইতিহাস', { exact: false }).click();
  await finalEmployeeCard.getByText('অপেক্ষমাণ → চলমান', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Bengali service request employee mobile after HR decisions');

  await employee.getByRole('button', { name: 'Open navigation menu' }).click();
  const employeeNav = employee.getByRole('navigation', { name: 'HRIS modules' });
  await employeeNav.getByRole('button', { name: 'বিজ্ঞপ্তি', exact: true }).click();
  const completedNotification = employee.locator(`[data-notification-source="service_request_decision"][data-notification-request-id="${saved.id}"]`);
  const rejectedNotification = employee.locator(`[data-notification-source="service_request_decision"][data-notification-request-id="${secondSaved.id}"]`);
  await completedNotification.getByText('পরিষেবা অনুরোধ সম্পন্ন হয়েছে', { exact: true }).waitFor({ state: 'visible' });
  await rejectedNotification.getByText('পরিষেবা অনুরোধ প্রত্যাখ্যাত হয়েছে', { exact: true }).waitFor({ state: 'visible' });
  if (await rejectedNotification.getByText(rejection, { exact: true }).count()) {
    throw new Error('Service-request notifications exposed the private rejection reason instead of requiring owner history access.');
  }
  await employee.getByRole('button', { name: 'রিফ্রেশ', exact: true }).click();
  await completedNotification.waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Bengali service request notifications mobile');
  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employee, 'Bengali service request notifications desktop');
  await completedNotification.getByRole('button', { name: 'পরিষেবা অনুরোধ খুলুন', exact: true }).click();
  await employee.getByRole('heading', { name: 'আমার পরিষেবা অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  await employee.waitForFunction(requestId => document.activeElement?.getAttribute('data-service-request') === requestId, saved.id);
  const focusedRequestId = await employee.evaluate(() => document.activeElement?.getAttribute('data-service-request'));
  if (focusedRequestId !== saved.id) throw new Error(`Notification did not focus its matching service request history row: ${focusedRequestId}.`);
  await finalEmployeeCard.getByText(outcome, { exact: true }).first().waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'Open navigation menu' }).click();
  await employee.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'বিজ্ঞপ্তি', exact: true }).click();
  await rejectedNotification.getByRole('button', { name: 'পরিষেবা অনুরোধ খুলুন', exact: true }).click();
  await employee.getByRole('heading', { name: 'আমার পরিষেবা অনুরোধ', exact: true }).waitFor({ state: 'visible' });
  await employee.waitForFunction(requestId => document.activeElement?.getAttribute('data-service-request') === requestId, secondSaved.id);
  const focusedRejectedRequestId = await employee.evaluate(() => document.activeElement?.getAttribute('data-service-request'));
  if (focusedRejectedRequestId !== secondSaved.id) throw new Error(`Rejection notification did not focus its matching service request history row: ${focusedRejectedRequestId}.`);
  await finalRejectedCard.getByText(rejection, { exact: true }).first().waitFor({ state: 'visible' });
  console.log('SERVICE_REQUEST_NOTIFICATION_ACCEPTANCE=PASS');

  console.log(`SERVICE_REQUEST_ACCEPTANCE_ID=${saved.id}`);
  console.log(`SERVICE_REQUEST_REJECTION_ACCEPTANCE_ID=${secondSaved.id}`);
  console.log('Local Auth/Postgres employee submission, HR review, outcome, rejection, status history, refresh recovery, EN/BN, and mobile/desktop journeys persisted.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
