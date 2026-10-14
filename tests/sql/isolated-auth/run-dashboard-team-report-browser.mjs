// Exercises the manager dashboard Team Report through real local Auth and
// tenant-scoped Postgres RPCs, with one injected request outage for recovery.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_DASHBOARD_MANAGER_EMAIL', 'HRIS_LOCAL_DASHBOARD_TENANT_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48386';
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
    } catch { /* local server is starting */ }
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
  let teamRpcCalls = 0;
  let injectOutage = true;
  const teamReportTenants = [];
  const directTableReads = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.pathname.endsWith('/rest/v1/rpc/hris_get_tenant_dashboard_team_report')
      && route.request().method() === 'POST') {
      teamRpcCalls += 1;
      const body = route.request().postDataJSON();
      if (typeof body?.p_tenant_id === 'string') teamReportTenants.push(body.p_tenant_id);
      if (injectOutage) {
        injectOutage = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic temporary team report outage.' }) });
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
  const teamReport = page.getByRole('region', { name: 'Team Report' });
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
  await teamSearch.fill('');
  await teamReport.getByRole('row', { name: /Unassigned/ }).waitFor({ state: 'visible' });

  const refresh = teamReport.getByRole('button', { name: 'Refresh', exact: true });
  const refreshResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_dashboard_team_report') && response.ok());
  await refresh.click();
  await refreshResponse;
  const downloadWait = page.waitForEvent('download');
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Desktop Team Report');
  if (teamRpcCalls !== 3 || teamReportTenants.length !== 3
      || teamReportTenants.some(id => id !== process.env.HRIS_LOCAL_DASHBOARD_TENANT_ID)) {
    throw new Error(`Expected outage, retry, and refresh to use the active tenant. Calls=${teamRpcCalls}; tenants=${JSON.stringify(teamReportTenants)}.`);
  }
  if (directTableReads.length) throw new Error(`Team report bypassed the aggregate RPC with direct table reads: ${directTableReads.join(', ')}.`);
  console.log('Local Auth-to-Postgres Team Report journey passed: injected outage retry, tenant-bound aggregate rows, search, CSV export, refresh recovery, and 375px mobile/1280px desktop layouts.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
