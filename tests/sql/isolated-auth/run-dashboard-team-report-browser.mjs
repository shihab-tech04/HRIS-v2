// Exercises the manager dashboard Team Report through real local Auth and
// tenant-scoped Postgres RPCs, with one injected request outage for recovery.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_DASHBOARD_MANAGER_EMAIL', 'HRIS_LOCAL_DASHBOARD_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const csvDownloadTimeoutMs = 30_000;
const port = await new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('Unable to select an available loopback port for the report browser journey.')));
      return;
    }
    probe.close(error => error ? reject(error) : resolve(String(address.port)));
  });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: repo,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY,
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverStderr = '';
let serverSpawnError = '';
server.stderr.on('data', chunk => { serverStderr = `${serverStderr}${chunk.toString()}`.slice(-4000); });
server.on('error', error => { serverSpawnError = error.message; });

function safeServerDiagnostic() {
  let diagnostic = serverStderr;
  for (const key of [
    'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
    'HRIS_LOCAL_DASHBOARD_MANAGER_EMAIL',
  ]) {
    const secret = process.env[key];
    if (secret) diagnostic = diagnostic.replaceAll(secret, '[REDACTED]');
  }
  diagnostic = diagnostic
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:sb_secret|sb_publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
    .replace(/(authorization:\s*bearer\s+)\S+/gi, '$1[REDACTED]')
    .trim();
  return diagnostic.slice(-1200);
}

let browser;
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverSpawnError) throw new Error(`Local Vite server could not start: ${serverSpawnError}.`);
    if (server.exitCode !== null) {
      const diagnostic = safeServerDiagnostic();
      throw new Error(`Local Vite server exited with ${server.exitCode}.${diagnostic ? ` Startup diagnostic: ${diagnostic}` : ''}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* local server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === '') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function csvNumber(value) {
  const normalized = value.replaceAll(',', '').trim();
  return normalized === '' ? 0 : Number(normalized);
}

function waitForCsvDownload(page, label) {
  return page.waitForEvent('download', { timeout: csvDownloadTimeoutMs }).catch(error => {
    if (error?.name !== 'TimeoutError') throw error;
    throw new Error(`Timed out waiting for the ${label} CSV download after ${csvDownloadTimeoutMs} ms.`);
  });
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let teamRpcCalls = 0;
  let injectOutage = true;
  let teamDetailCalls = 0;
  let injectDetailOutage = true;
  const teamReportTenants = [];
  const teamReportDates = [];
  const teamDetailRequests = [];
  const directTableReads = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_dashboard_team_report')
      && route.request().method() === 'POST') {
      teamRpcCalls += 1;
      const body = route.request().postDataJSON();
      if (typeof body?.p_tenant_id === 'string') teamReportTenants.push(body.p_tenant_id);
      if (typeof body?.p_report_date === 'string') teamReportDates.push(body.p_report_date);
      if (injectOutage) {
        injectOutage = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary team report outage.' }) });
        return;
      }
    }
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_dashboard_team_details')
      && route.request().method() === 'POST') {
      teamDetailCalls += 1;
      const body = route.request().postDataJSON();
      teamDetailRequests.push(body);
      if (injectDetailOutage) {
        injectDetailOutage = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary team detail outage.' }) });
        return;
      }
    }
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && /\/rest\/v1\/(teams|attendance_records)(?:\?|$)/.test(url.pathname + url.search)) {
      directTableReads.push(url.pathname + url.search);
    }
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });

  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_DASHBOARD_MANAGER_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await navigation.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('heading', { name: 'Managerial Dashboard', exact: true }).waitFor({ state: 'visible' });
  const teamReport = page.locator('section[aria-labelledby="dashboard-team-report-heading"]');
  await teamReport.getByRole('heading', { name: 'Team Report', exact: true }).waitFor({ state: 'visible' });
  await teamReport.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible' });
  if (teamRpcCalls !== 1) throw new Error(`Expected one injected Team Report outage, got ${teamRpcCalls} RPC calls.`);
  await assertNoOverflow(page, 'Mobile Team Report error state');
  await teamReport.getByRole('button', { name: 'Retry', exact: true }).click();
  await teamReport.getByRole('row', { name: /QA A Team/ }).waitFor({ state: 'visible' });
  await teamReport.getByRole('row', { name: /Unassigned/ }).waitFor({ state: 'visible' });
  if (await teamReport.getByText('QA B Team', { exact: true }).count()) throw new Error('The tenant A manager saw tenant B team data.');
  await assertNoOverflow(page, 'Mobile Team Report table');

  const teamSearch = teamReport.getByRole('searchbox', { name: 'Search team report' });
  await teamSearch.fill('No matching team');
  await teamReport.getByText(/No teams match/).waitFor({ state: 'visible' });
  await teamSearch.fill('QA A Team');
  await teamReport.getByRole('row', { name: /QA A Team/ }).waitFor({ state: 'visible' });
  if (await teamReport.getByRole('row', { name: /Unassigned/ }).count()) throw new Error('The team search did not filter the visible rows.');
  const filteredTotal = teamReport.getByRole('row', { name: /Filtered total/ });
  await filteredTotal.waitFor({ state: 'visible' });
  const visibleSums = await teamReport.locator('tbody tr').evaluateAll(rows => {
    const sums = Array.from({ length: 6 }, () => 0);
    for (const row of rows) {
      const values = Array.from(row.querySelectorAll('td')).slice(0, 6);
      values.forEach((cell, index) => { sums[index] += Number((cell.textContent || '').replaceAll(',', '').trim()) || 0; });
    }
    return sums;
  });
  const visibleTotal = (await filteredTotal.locator('td').allTextContents()).slice(0, 6).map(csvNumber);
  if (JSON.stringify(visibleTotal) !== JSON.stringify(visibleSums)) {
    throw new Error(`Displayed filtered totals did not equal the visible team rows: totals=${JSON.stringify(visibleTotal)} rows=${JSON.stringify(visibleSums)}.`);
  }
  const filteredDownloadWait = waitForCsvDownload(page, 'filtered team report');
  await teamReport.getByRole('button', { name: 'Download Report', exact: true }).click();
  const filteredDownload = await filteredDownloadWait;
  const filteredStream = await filteredDownload.createReadStream();
  const filteredChunks = [];
  for await (const chunk of filteredStream) filteredChunks.push(chunk);
  const filteredCsv = parseCsvRows(Buffer.concat(filteredChunks).toString('utf8'));
  const filteredCsvTeams = filteredCsv.slice(1, -1);
  const filteredCsvTotal = filteredCsv.at(-1);
  if (!filteredCsvTeams.length || filteredCsvTeams.some(row => row[1] !== 'QA A Team')) {
    throw new Error(`Filtered CSV included rows outside the visible team filter: ${JSON.stringify(filteredCsvTeams)}.`);
  }
  if (filteredCsvTotal?.[1] !== 'Filtered total'
      || JSON.stringify(filteredCsvTotal.slice(2, 8).map(csvNumber)) !== JSON.stringify(visibleTotal)) {
    throw new Error(`Filtered CSV total did not match the displayed total: csv=${JSON.stringify(filteredCsvTotal)} ui=${JSON.stringify(visibleTotal)}.`);
  }
  await teamSearch.fill('');
  await teamReport.getByRole('row', { name: /Unassigned/ }).waitFor({ state: 'visible' });

  const reportDate = teamReport.getByLabel('Report date');
  const selectedReportDate = '2026-10-12';
  await reportDate.fill(selectedReportDate);
  const selectedDateResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_dashboard_team_report') && response.ok());
  await teamReport.getByRole('button', { name: 'Apply date', exact: true }).click();
  await selectedDateResponse;
  if (!teamReportDates.includes(selectedReportDate)) throw new Error('The selected report date was not sent to the tenant report RPC.');

  const teamDetailButton = teamReport.getByRole('button', { name: 'View attendance details for QA A Team' });
  await teamDetailButton.click();
  const detailDialog = page.getByRole('dialog', { name: 'Team report details' });
  await detailDialog.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Mobile Team Report detail error state');
  await detailDialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await detailDialog.getByRole('row', { name: /QA-A-001/ }).waitFor({ state: 'visible' });
  if (await detailDialog.getByText('QA-B-001', { exact: true }).count()) throw new Error('Team details returned an employee from another team.');
  if (teamDetailRequests.length !== 2 || teamDetailRequests.some(request => request.p_tenant_id !== process.env.HRIS_LOCAL_DASHBOARD_TENANT_ID
      || request.p_team_id !== 'dddddddd-0000-4000-8000-000000000001'
      || request.p_unassigned !== false || request.p_report_date !== selectedReportDate)) {
    throw new Error(`Team detail retry did not retain the selected tenant/team/date scope: ${JSON.stringify(teamDetailRequests)}.`);
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  const refresh = teamReport.getByRole('button', { name: 'Refresh', exact: true });
  const refreshResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_dashboard_team_report') && response.ok());
  await refresh.click();
  await refreshResponse;
  const downloadWait = waitForCsvDownload(page, 'team report');
  await teamReport.getByRole('button', { name: 'Download Report', exact: true }).click();
  const download = await downloadWait;
  if (!download.suggestedFilename().startsWith('managerial-dashboard-team-report-')) throw new Error('Team report filename was not generated.');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  if (!csv.includes('QA A Team') || !csv.includes('Unassigned') || csv.includes('QA B Team')) {
    throw new Error('Team report export did not preserve the current tenant-scoped aggregate rows.');
  }
  if (!csv.includes('Filtered total')) throw new Error('CSV export did not include the same filtered total shown in the report.');

  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await page.getByRole('heading', { name: 'ব্যবস্থাপক ড্যাশবোর্ড', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'আজকের উপস্থিতির সারসংক্ষেপ', exact: true }).waitFor({ state: 'visible' });
  await page.getByText('দলের সদস্য', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'উপস্থিতির চার্ট ফিল্টার করুন' }).waitFor({ state: 'visible' });
  const dashboardActions = page.getByRole('group', { name: 'ব্যবস্থাপক ড্যাশবোর্ডের কার্যক্রম' });
  const dashboardDownloadWait = waitForCsvDownload(page, 'dashboard');
  await dashboardActions.getByRole('button', { name: 'প্রতিবেদন ডাউনলোড করুন', exact: true }).click();
  const dashboardDownload = await dashboardDownloadWait;
  const dashboardStream = await dashboardDownload.createReadStream();
  const dashboardChunks = [];
  for await (const chunk of dashboardStream) dashboardChunks.push(chunk);
  const dashboardCsv = Buffer.concat(dashboardChunks).toString('utf8');
  if (!dashboardCsv.includes('"বিভাগ","পরিমাপক","মান"') || !dashboardCsv.includes('"আজ","দলের সদস্য"')) {
    throw new Error('Dashboard CSV did not use the Bengali labels selected in the interface.');
  }
  await teamReport.getByRole('heading', { name: 'দলভিত্তিক প্রতিবেদন' }).waitFor({ state: 'visible' });

  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Desktop Team Report');
  if (teamRpcCalls !== 4 || teamReportTenants.length !== 4
      || teamReportTenants.some(id => id !== process.env.HRIS_LOCAL_DASHBOARD_TENANT_ID)) {
    throw new Error(`Expected outage, retry, and refresh to use the active tenant. Calls=${teamRpcCalls}; tenants=${JSON.stringify(teamReportTenants)}.`);
  }
  if (teamDetailCalls !== 2) throw new Error(`Expected one injected team-detail outage and one retry; got ${teamDetailCalls} calls.`);
  if (directTableReads.length) throw new Error(`Team report bypassed the aggregate RPC with direct table reads: ${directTableReads.join(', ')}.`);
  console.log('Local Auth-to-Postgres Team Report journey passed: tenant-scoped date selection, filtered totals/CSV parity, team-scoped detail retry, Bengali labels, refresh recovery, and 375px mobile/1280px desktop layouts.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
