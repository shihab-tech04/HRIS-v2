// Runs the employee receipt and tenant manager queue journey on disposable local Auth/Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_EXPENSE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_EXPENSE_MANAGER_EMAIL',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48378';
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

async function signIn(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (await page.evaluate(() => window.innerWidth) < 1024) {
    await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  } else {
    await page.getByRole('navigation', { name: 'HRIS modules' }).waitFor({ state: 'visible' });
  }
}

async function navigateTo(page, label) {
  const nav = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await nav.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await nav.getByRole('button', { name: label, exact: true }).click();
}

async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(size)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const employee = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let receiptPath = '';
  employee.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/storage/v1/object/expense-receipts/')) {
      receiptPath = decodeURIComponent(url.pathname.slice('/storage/v1/object/expense-receipts/'.length));
    }
  });
  await isolateExternalRequests(employee);
  await signIn(employee, process.env.HRIS_LOCAL_EXPENSE_EMPLOYEE_EMAIL);
  await navigateTo(employee, 'My Expenses');
  await employee.getByRole('heading', { name: 'My Expense Claims', exact: true }).waitFor({ state: 'visible' });

  await employee.getByRole('button', { name: 'New expense claim', exact: true }).click();
  await employee.getByRole('button', { name: 'Cancel', exact: true }).click();
  await employee.getByRole('dialog').waitFor({ state: 'detached' });
  await employee.getByRole('button', { name: 'New expense claim', exact: true }).click();
  const description = `Local expense workflow ${Date.now()}`;
  await employee.getByLabel('Description').fill(description);
  const draftResponse = employee.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_my_expense_draft'));
  await employee.getByRole('button', { name: 'Save draft', exact: true }).click();
  const draftBody = await (await draftResponse).json();
  if (typeof draftBody !== 'string' || !draftBody) throw new Error(`Expense draft did not persist: ${JSON.stringify(draftBody)}.`);
  const card = employee.locator(`[data-expense-claim="${draftBody}"]`);
  await card.waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Expense draft mobile');

  const incompleteSubmitPromise = employee.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_submit_my_expense_claim'));
  await card.getByRole('button', { name: 'Submit for review' }).click();
  const incompleteSubmitResponse = await incompleteSubmitPromise;
  const incompleteSubmitBody = await incompleteSubmitResponse.json();
  if (incompleteSubmitResponse.ok()) throw new Error('The backend accepted an incomplete expense draft.');
  let validationText = '';
  try {
    const alert = employee.locator('[role="alert"]').last();
    await alert.waitFor({ state: 'visible', timeout: 5000 });
    validationText = await alert.innerText();
  } catch {
    const visibleAlerts = await employee.locator('[role="alert"]').allInnerTexts();
    throw new Error(`Backend rejected the incomplete draft but the UI did not show a recovery error: ${JSON.stringify({ incompleteSubmitBody, visibleAlerts })}.`);
  }
  if (!/category|date|amount|currency/i.test(validationText)) {
    throw new Error(`Unexpected incomplete-draft recovery text: ${JSON.stringify({ validationText, incompleteSubmitBody })}.`);
  }
  await card.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await employee.getByLabel('Category').selectOption({ label: 'QA A Transport' });
  await employee.getByLabel('Expense date').fill(new Date().toISOString().slice(0, 10));
  await employee.getByLabel('Amount').fill('85.50');
  await employee.getByLabel('Currency').fill('BDT');
  const reviseResponse = employee.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_my_expense_draft'));
  await employee.getByRole('button', { name: 'Save draft', exact: true }).click();
  const reviseBody = await (await reviseResponse).json();
  if (reviseBody !== draftBody) throw new Error('Expense revision did not preserve its draft ID.');
  await card.waitFor({ state: 'visible' });
  await card.locator('input[type=file]').setInputFiles({
    name: 'transport-receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic receipt'),
  });
  await card.getByText('transport-receipt.pdf', { exact: true }).waitFor({ state: 'visible' });
  if (!receiptPath) throw new Error('The UI did not upload a private receipt object.');
  await card.getByRole('button', { name: 'Submit for review' }).click();
  await card.getByText('Submitted', { exact: true }).first().waitFor({ state: 'visible' });
  await employee.getByRole('button', { name: 'Refresh my expense claims' }).click();
  await card.getByText('Submitted', { exact: true }).first().waitFor({ state: 'visible' });
  await card.getByText('transport-receipt.pdf', { exact: true }).waitFor({ state: 'visible' });
  await card.getByText('Claim history', { exact: true }).click();
  await card.getByText('Draft → Submitted', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(employee, 'Expense employee mobile');

  await employee.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(employee, 'Expense employee desktop');

  const manager = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await isolateExternalRequests(manager);
  await signIn(manager, process.env.HRIS_LOCAL_EXPENSE_MANAGER_EMAIL);
  await navigateTo(manager, 'Expense claims');
  await manager.getByRole('heading', { name: 'Expense Claims', exact: true }).waitFor({ state: 'visible' });
  const managerCard = manager.locator(`[data-expense-claim="${draftBody}"]`);
  await managerCard.waitFor({ state: 'visible' });
  await managerCard.getByRole('heading', { name: description }).waitFor({ state: 'visible' });
  if (await managerCard.getByRole('button', { name: /approve|reject|return/i }).count()) {
    throw new Error('The read-only manager queue unexpectedly exposes an unapproved decision action.');
  }
  await assertNoOverflow(manager, 'Expense manager queue desktop');
  await manager.setViewportSize({ width: 375, height: 812 });
  await assertNoOverflow(manager, 'Expense manager queue mobile');
  console.log(`EXPENSE_ACCEPTANCE_ID=${draftBody}`);
  console.log(`EXPENSE_ACCEPTANCE_PATH=${receiptPath}`);
  console.log('Local Auth-to-Postgres expense workflow persisted an employee draft, validation recovery, private receipt, submission, history, and tenant-scoped read-only manager queue across mobile and desktop.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
