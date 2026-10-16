// Exercises the employee attendance month selector against disposable local Auth and Postgres.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_ATTENDANCE_EMPLOYEE_EMAIL', 'HRIS_LOCAL_ATTENDANCE_TENANT_ID',
  'HRIS_LOCAL_ATTENDANCE_CURRENT_MONTH', 'HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH',
  'HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48381';
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
  throw new Error('Timed out waiting for the local employee dashboard UI server.');
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let failInitialPeriodRead = true;
  let failInitialIdentityCardRead = true;
  const identityCardRequests = [];
  const periodRequests = [];
  const directAttendanceTableRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_attendance_period') && request.method() === 'POST') {
      const body = request.postDataJSON();
      periodRequests.push({ tenantId: body?.p_tenant_id, monthStart: body?.p_month_start });
    }
    if (/\/rest\/v1\/attendance_records(?:\?|$)/.test(url.pathname + url.search)) {
      directAttendanceTableRequests.push(url.pathname);
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (url.pathname.endsWith('/rest/v1/rpc/hris_get_my_employee_identity_card')
          && route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        identityCardRequests.push(body?.p_tenant_id);
        if (failInitialIdentityCardRead) {
          failInitialIdentityCardRead = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
            code: 'XX000', message: 'Synthetic temporary identity-card outage.',
          }) });
          return;
        }
      }
      if (failInitialPeriodRead && url.pathname.endsWith('/rest/v1/rpc/hris_get_my_attendance_period')
          && route.request().method() === 'POST') {
        failInitialPeriodRead = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'XX000', message: 'Synthetic temporary attendance-history outage.',
        }) });
        return;
      }
      return route.continue();
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_ATTENDANCE_EMPLOYEE_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'My Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  const monthInput = page.locator('input[type="month"][aria-label="Attendance month"]');
  await monthInput.waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Retry attendance month', exact: true }).waitFor({ state: 'visible' });
  if (failInitialPeriodRead) throw new Error('The injected monthly attendance outage was not observed.');

  await page.getByRole('button', { name: 'View digital employee ID', exact: true }).click();
  const identityDialog = page.getByRole('dialog', { name: 'Digital employee ID', exact: true });
  await identityDialog.getByRole('alert').filter({ hasText: 'Unable to load your employee ID card.' }).waitFor({ state: 'visible' });
  await identityDialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await identityDialog.locator('[data-employee-id-card][data-employment-status="active"]').waitFor({ state: 'visible' });
  for (const value of ['QA-A-001', 'Synthetic Employee A', 'QA A designation', 'QA A department', 'Active']) {
    await identityDialog.getByText(value, { exact: true }).waitFor({ state: 'visible' });
  }
  if (failInitialIdentityCardRead) throw new Error('The injected identity-card outage was not observed.');
  await assertNoOverflow(page, 'Employee digital ID mobile');
  await identityDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await identityDialog.waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  await page.getByRole('heading', { name: 'ব্যক্তিগত ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'ডিজিটাল কর্মচারী পরিচয়পত্র দেখুন', exact: true }).click();
  const bengaliIdentityDialog = page.getByRole('dialog', { name: 'ডিজিটাল কর্মচারী পরিচয়পত্র', exact: true });
  await bengaliIdentityDialog.getByText('সক্রিয়', { exact: true }).waitFor({ state: 'visible' });
  await bengaliIdentityDialog.getByRole('button', { name: 'বন্ধ করুন', exact: true }).click();
  await bengaliIdentityDialog.waitFor({ state: 'detached' });
  await page.getByLabel('উপস্থিতির মাস', { exact: true }).waitFor({ state: 'visible' });
  if (await page.locator('html').getAttribute('lang') !== 'bn'
      || await page.evaluate(() => localStorage.getItem('synesis-hris-locale')) !== 'bn') {
    throw new Error('The employee dashboard did not persist Bengali locale state.');
  }
  await assertNoOverflow(page, 'Employee attendance month Bengali mobile');

  const correctionButton = page.getByRole('button', { name: 'সংশোধনের আবেদন করুন', exact: true });
  await correctionButton.click();
  const correctionDialog = page.getByRole('dialog', { name: 'উপস্থিতি সংশোধনের আবেদন', exact: true });
  await correctionDialog.waitFor({ state: 'visible' });
  // The required marker is visually hidden from assistive technology but remains
  // part of Playwright's associated-label text; match the translated label
  // without requiring an exact text-node match.
  await correctionDialog.getByLabel('কারণ').fill('synthetic validation check');
  await correctionDialog.getByRole('button', { name: 'আবেদন জমা দিন', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'সংশোধনের জন্য অন্তত একটি উপস্থিতির তথ্য দিন।' }).waitFor({ state: 'visible' });
  await correctionDialog.getByRole('button', { name: 'বাতিল', exact: true }).click();
  await correctionDialog.waitFor({ state: 'detached' });

  const leaveRequestButton = page.getByRole('button', { name: 'ছুটির আবেদন', exact: true });
  if (!(await leaveRequestButton.isEnabled())) throw new Error('The synthetic employee did not receive an authorized leave type for the localized request dialog.');
  await leaveRequestButton.click();
  const leaveDialog = page.getByRole('dialog', { name: 'ছুটির আবেদন', exact: true });
  await leaveDialog.waitFor({ state: 'visible' });
  await leaveDialog.getByLabel('ছুটির ধরন').waitFor({ state: 'visible' });
  await leaveDialog.getByRole('button', { name: 'বাতিল', exact: true }).click();
  await leaveDialog.waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Switch language to English', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Retry attendance month', exact: true }).click();
  await page.getByRole('button', { name: 'Retry attendance month', exact: true }).waitFor({ state: 'detached' });
  if (await monthInput.getAttribute('value') !== process.env.HRIS_LOCAL_ATTENDANCE_CURRENT_MONTH) {
    throw new Error(`Current organization month was not selected: ${await monthInput.getAttribute('value')}.`);
  }
  if (await monthInput.getAttribute('max') !== process.env.HRIS_LOCAL_ATTENDANCE_CURRENT_MONTH) {
    throw new Error(`Month selector did not cap future months: max=${await monthInput.getAttribute('max')}.`);
  }

  await monthInput.fill(process.env.HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH);
  await page.getByRole('img', { name: /Recorded work hours for .* by week/ }).waitFor({ state: 'visible' });
  await page.locator('[title="8.0 recorded hours"]').waitFor({ state: 'visible' });
  const previousMonth = process.env.HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH;
  const weekBuckets = page.locator('[data-work-hours-week]');
  if (await weekBuckets.count() !== 5) throw new Error('The synthetic previous month must render all five weekly buckets.');
  const chartRows = await weekBuckets.evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().top)));
  if (new Set(chartRows).size !== 1) throw new Error(`The five weekly chart bars wrapped into multiple mobile rows: ${JSON.stringify(chartRows)}.`);
  const [year, month] = previousMonth.split('-').map(Number);
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  await page.getByRole('button', { name: 'Check-in times', exact: true }).click();
  await page.getByRole('heading', { name: `Check-in history · ${label}`, exact: true }).waitFor({ state: 'visible' });
  const history = page.locator('ul.divide-y').filter({ hasText: 'present' });
  await history.waitFor({ state: 'visible' });
  if (!(await history.innerText()).includes('10')) throw new Error('Persisted prior-month attendance date was not rendered in history.');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('heading', { name: 'Personal Dashboard', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Working hours', exact: true }).click();
  await page.locator('[title="8.0 recorded hours"]').waitFor({ state: 'visible' });
  const weekCount = Math.ceil(new Date(Date.UTC(Number(previousMonth.slice(0, 4)), Number(previousMonth.slice(5, 7)), 0)).getUTCDate() / 7);
  const weeklyTable = page.getByRole('table', { name: 'Weekly work-hours data', exact: true });
  await weeklyTable.waitFor({ state: 'visible' });
  if (await weeklyTable.locator('tbody tr').count() !== weekCount) {
    throw new Error(`Accessible English weekly attendance rows did not match the selected month (${weekCount} weeks).`);
  }
  if (!(await weeklyTable.innerText()).includes('8.0 hr') || !(await weeklyTable.innerText()).includes('1')) {
    throw new Error('Accessible English weekly attendance did not expose the persisted hours and complete-pair count.');
  }
  await page.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  const bengaliWeeklyTable = page.getByRole('table', { name: 'সাপ্তাহিক কাজের সময়ের তথ্য', exact: true });
  await bengaliWeeklyTable.waitFor({ state: 'visible' });
  await bengaliWeeklyTable.getByRole('columnheader', { name: 'সপ্তাহ', exact: true }).waitFor({ state: 'visible' });
  await bengaliWeeklyTable.getByRole('columnheader', { name: 'নথিভুক্ত কাজের সময়', exact: true }).waitFor({ state: 'visible' });
  await bengaliWeeklyTable.getByRole('columnheader', { name: 'সম্পূর্ণ চেক-ইন জোড়া', exact: true }).waitFor({ state: 'visible' });
  if (await bengaliWeeklyTable.locator('tbody tr').count() !== weekCount) {
    throw new Error(`Accessible Bengali weekly attendance rows did not match the selected month (${weekCount} weeks).`);
  }
  await assertNoOverflow(page, 'Employee accessible weekly attendance Bengali mobile');
  await page.getByRole('button', { name: 'Switch language to English', exact: true }).click();
  await weeklyTable.waitFor({ state: 'visible' });

  await monthInput.fill(process.env.HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH);
  const emptyParts = process.env.HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH.split('-').map(Number);
  const emptyLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(emptyParts[0], emptyParts[1] - 1, 1)));
  await page.getByText(`No complete check-in and check-out pairs are available for ${emptyLabel}.`, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee attendance month mobile');

  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Employee attendance month desktop');
  await page.getByRole('button', { name: 'View digital employee ID', exact: true }).click();
  const desktopIdentityDialog = page.getByRole('dialog', { name: 'Digital employee ID', exact: true });
  await desktopIdentityDialog.locator('[data-employee-id-card]').waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Employee digital ID desktop');
  await desktopIdentityDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await desktopIdentityDialog.waitFor({ state: 'detached' });
  if (periodRequests.length < 5 || periodRequests.some(request => request.tenantId !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)) {
    throw new Error(`Attendance period RPC requests were missing or not tenant-bound: ${JSON.stringify(periodRequests)}.`);
  }
  if (!periodRequests.some(request => request.monthStart === `${process.env.HRIS_LOCAL_ATTENDANCE_PREVIOUS_MONTH}-01`)
      || !periodRequests.some(request => request.monthStart === `${process.env.HRIS_LOCAL_ATTENDANCE_EMPTY_MONTH}-01`)) {
    throw new Error(`Selected months were not requested: ${JSON.stringify(periodRequests)}.`);
  }
  if (directAttendanceTableRequests.length) {
    throw new Error(`Employee attendance history bypassed the secured period RPC: ${JSON.stringify(directAttendanceTableRequests)}.`);
  }
  if (identityCardRequests.length < 3 || identityCardRequests.some(requestedTenant => requestedTenant !== process.env.HRIS_LOCAL_ATTENDANCE_TENANT_ID)) {
    throw new Error(`Employee identity-card RPC requests were missing or not tenant-bound: ${JSON.stringify(identityCardRequests)}.`);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Switch language to Bengali', exact: true }).click();
  await page.getByRole('heading', { name: 'ব্যক্তিগত ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  if (await page.locator('html').getAttribute('lang') !== 'bn'
      || await page.evaluate(() => localStorage.getItem('synesis-hris-locale')) !== 'bn') {
    throw new Error('The employee dashboard did not persist Bengali locale state.');
  }
  await assertNoOverflow(page, 'Employee attendance month Bengali mobile');
  await page.reload();
  await page.getByRole('heading', { name: 'ব্যক্তিগত ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  if (await page.locator('html').getAttribute('lang') !== 'bn'
      || await page.evaluate(() => localStorage.getItem('synesis-hris-locale')) !== 'bn') {
    throw new Error('The employee dashboard lost Bengali locale after a full browser refresh.');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Employee attendance month Bengali desktop');
  console.log('EMPLOYEE_IDENTITY_CARD_BROWSER_ACCEPTANCE=PASS');
  console.log('Local Auth/Postgres employee attendance and identity-card journeys passed: Bengali and English locale toggle/persistence, translated leave and correction form states, injected outages with retry, own identity card fields, month selection, persisted prior-month hours and history, refresh recovery, empty state, tenant-bound RPCs, and mobile/desktop layouts.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
