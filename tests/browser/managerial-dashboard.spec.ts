import { test, expect } from '@playwright/test';
import path from 'path';
import { mkdirSync } from 'node:fs';

const evidenceDirectory = process.env.HRIS_DASHBOARD_EVIDENCE_DIR || path.resolve(process.cwd(), 'docs/evidence');
mkdirSync(evidenceDirectory, { recursive: true });
const evidencePath = (name: string) => path.join(evidenceDirectory, name);

const userId = 'd1111111-1111-4111-8111-111111111111';
const tenantId = 'd2222222-2222-4222-8222-222222222222';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-manager@example.org',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated',
  role: 'authenticated', email: user.email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

async function signInSyntheticManager(page: import('@playwright/test').Page, failures: { teamReport?: number; teamDetails?: number } = {}) {
  const reportState: {
    teamReportCalls: Record<string, unknown>[];
    teamDetailsCalls: Record<string, unknown>[];
    teamReportFailures: number;
    teamDetailsFailures: number;
    teamReportDelay: number;
    teamDetailsDelay: number;
  } = { teamReportCalls: [], teamDetailsCalls: [], teamReportFailures: failures.teamReport || 0, teamDetailsFailures: failures.teamDetails || 0, teamReportDelay: 0, teamDetailsDelay: 0 };
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/auth/v1/**', async route => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user }) });
      return;
    }
    if (requestPath.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/**', async route => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath.endsWith('/rpc/hris_get_tenant_dashboard_team_report')) {
      const request = route.request().postDataJSON() as Record<string, unknown>;
      reportState.teamReportCalls.push(request);
      if (reportState.teamReportFailures > 0) {
        reportState.teamReportFailures -= 1;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic team report outage.' }) });
        return;
      }
      if (reportState.teamReportDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, reportState.teamReportDelay));
        reportState.teamReportDelay = 0;
      }
      const reportDate = typeof request.p_report_date === 'string' ? request.p_report_date : '2026-10-15';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        dashboard_date: reportDate,
        teams: [
          { team_id: 'dddddddd-0000-4000-8000-000000000001', team_name: 'QA A Team', present_members: reportDate === '2026-10-12' ? 2 : 3, absent_members: reportDate === '2026-10-12' ? 1 : 0, total_members: 5, work_from_office: 2, work_from_home: 1, client_meeting: 1 },
          { team_id: null, team_name: 'Unassigned', present_members: 0, absent_members: 1, total_members: 1, work_from_office: 0, work_from_home: 0, client_meeting: 0 },
        ],
      }) });
      return;
    }
    if (requestPath.endsWith('/rpc/hris_get_tenant_dashboard_team_details')) {
      const request = route.request().postDataJSON() as Record<string, unknown>;
      reportState.teamDetailsCalls.push(request);
      if (reportState.teamDetailsFailures > 0) {
        reportState.teamDetailsFailures -= 1;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic team detail outage.' }) });
        return;
      }
      if (reportState.teamDetailsDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, reportState.teamDetailsDelay));
        reportState.teamDetailsDelay = 0;
      }
      const details = request.p_unassigned === true
        ? [{ employee_name: 'Synthetic Unassigned Employee', employee_number: 'QA-A-002', designation_title: 'Engineer', department_name: 'Operations', attendance_days: 1, office_hours: 8, working_hours: 7.5, deviation: -0.5 }]
        : [{ employee_name: 'Synthetic Team Employee', employee_number: 'QA-A-001', designation_title: 'Designer', department_name: 'Product', attendance_days: 1, office_hours: 8, working_hours: 8, deviation: 0 }];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report_date: request.p_report_date, details }) });
      return;
    }
    if (requestPath.endsWith('/rpc/has_tenant_permission')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }
    if (requestPath.endsWith('/rpc/hris_get_tenant_dashboard_summary')) {
      const trend = Array.from({ length: 30 }, (_, index) => {
        const date = new Date(Date.now() - (29 - index) * 86_400_000).toISOString().slice(0, 10);
        return { date, records: index + 1 };
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        team_members: 8, employees: 8, attendance_today: 6,
        present_today: 3, absent_today: 1, wfo_today: 2, wfh_today: 1,
        client_meeting_today: 1, on_leave_today: 1, late_today: 0,
        attendance_corrections_pending: 2, leave_pending: 4, approvals_pending: 6,
        attendance_last_7_days: trend.slice(-7), attendance_last_30_days: trend,
      }) });
      return;
    }
    const table = requestPath.split('/').pop();
    let data: unknown = [];
    if (table === 'tenant_memberships') data = [{ tenant_id: tenantId, role: 'qa_tenant_manager', status: 'active' }];
    else if (table === 'employees') data = [];
    else if (table === 'admin_users') data = { active: false, is_super_admin: false };
    else if (table === 'tenants') data = [{ id: tenantId, name: 'Synthetic Tenant A', slug: 'tenant-a', timezone: 'Asia/Dhaka' }];
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Managerial Dashboard' })).toBeVisible();
  return reportState;
}

test('manager dashboard uses tenant RPC counts and working search, filters, and CSV download', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const reportState = await signInSyntheticManager(page);

  await expect(page.getByRole('heading', { name: 'Today’s Attendance Summary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Present 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Absent 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Work from Office 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Work From Home 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Attendance Chart' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Client Meeting 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'On Leave 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Late 0' })).toBeVisible();
  const metricColumns = await page.locator('section[aria-labelledby="today-attendance-heading"] > div.grid')
    .evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(metricColumns).toBe(8);
  await expect(page.getByRole('img', { name: /Attendance records over the last 7 days/ })).toBeVisible();
  await page.screenshot({ path: evidencePath('managerial-dashboard-desktop-20261015.png'), fullPage: true });

  await page.getByRole('searchbox', { name: 'Search dashboard metrics' }).fill('Home');
  await expect(page.getByRole('button', { name: 'Work From Home 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Present 3' })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search dashboard metrics' }).fill('');

  await page.getByRole('button', { name: 'Filter attendance chart' }).click();
  await page.getByLabel('Attendance chart range').selectOption('30');
  await expect(page.getByText('Recorded attendance by day · last 30 days')).toBeVisible();
  await expect(page.getByRole('img', { name: /Attendance records over the last 30 days/ })).toBeVisible();

  const downloadWaiter = page.waitForEvent('download');
  const dashboardActions = page.getByRole('group', { name: 'Managerial dashboard actions' });
  await expect(dashboardActions.getByRole('button', { name: 'Download Report', exact: true })).toHaveCount(1);
  await dashboardActions.getByRole('button', { name: 'Download Report', exact: true }).click();
  const download = await downloadWaiter;
  expect(download.suggestedFilename()).toMatch(/^managerial-dashboard-\d{4}-\d{2}-\d{2}\.csv$/);

  const teamReport = page.locator('section[aria-labelledby="dashboard-team-report-heading"]');
  await teamReport.getByRole('row', { name: /Filtered total 3 1 6 2 1 1/ }).waitFor({ state: 'visible' });
  reportState.teamReportDelay = 250;
  const reportRefresh = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_tenant_dashboard_team_report') && response.ok());
  await teamReport.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(teamReport.getByText('Refreshing team report…')).toBeVisible();
  await reportRefresh;
  const reportDate = teamReport.getByLabel('Report date');
  await reportDate.fill('2026-10-12');
  await teamReport.getByRole('button', { name: 'Apply date' }).click();
  await expect.poll(() => reportState.teamReportCalls.some(call => call.p_report_date === '2026-10-12')).toBe(true);
  await expect(teamReport.getByRole('row', { name: /Filtered total 2 2 6 2 1 1/ })).toBeVisible();
  await teamReport.getByRole('searchbox', { name: 'Search team report' }).fill('QA A Team');
  await expect(teamReport.getByRole('row', { name: /Filtered total 2 1 5 2 1 1/ })).toBeVisible();
  await expect(teamReport.getByRole('row', { name: /Unassigned/ })).toHaveCount(0);
  const teamCsvWaiter = page.waitForEvent('download');
  await teamReport.getByRole('button', { name: 'Download Report', exact: true }).click();
  const teamDownload = await teamCsvWaiter;
  expect(teamDownload.suggestedFilename()).toBe('managerial-dashboard-team-report-2026-10-12.csv');
  const csvStream = await teamDownload.createReadStream();
  const csvChunks: Buffer[] = [];
  for await (const chunk of csvStream) csvChunks.push(Buffer.from(chunk));
  const teamCsv = Buffer.concat(csvChunks).toString('utf8');
  expect(teamCsv).toContain('QA A Team');
  expect(teamCsv).not.toContain('Unassigned');
  expect(teamCsv).toContain('"2026-10-12","Filtered total","2","1","5","2","1","1"');
  const teamSearch = teamReport.getByRole('searchbox', { name: 'Search team report' });
  await teamSearch.fill('No matching team');
  await expect(teamReport.getByText(/No teams match/)).toBeVisible();
  await expect(teamReport.getByRole('button', { name: 'Download Report', exact: true })).toBeDisabled();
});

test('manager dashboard fits a narrow mobile viewport and keeps all attendance tiles reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInSyntheticManager(page);

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(376);
  await expect(page.getByRole('heading', { name: 'Today’s Attendance Summary' })).toBeVisible();
  await expect(page.getByText('Team Members', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Late 0' })).toBeVisible();
  const metricColumns = await page.locator('section[aria-labelledby="today-attendance-heading"] > div.grid')
    .evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(metricColumns).toBe(2);
  await page.screenshot({ path: evidencePath('managerial-dashboard-mobile-20261015.png'), fullPage: true });
});

test('Team Report retries, opens tenant-scoped details, and stays localized and usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const reportState = await signInSyntheticManager(page, { teamReport: 1, teamDetails: 1 });
  const teamReport = page.locator('section[aria-labelledby="dashboard-team-report-heading"]');
  await teamReport.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible' });
  await teamReport.getByRole('button', { name: 'Retry', exact: true }).click();
  await teamReport.getByRole('row', { name: /QA A Team/ }).waitFor({ state: 'visible' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);

  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(teamReport.getByRole('heading', { name: 'দলভিত্তিক প্রতিবেদন' })).toBeVisible();
  await expect(teamReport.getByLabel('প্রতিবেদনের তারিখ')).toBeVisible();
  const detailButton = teamReport.getByRole('button', { name: 'উপস্থিতির বিস্তারিত দেখুন: QA A Team' });
  await detailButton.click();
  const details = page.getByRole('dialog', { name: 'দলভিত্তিক প্রতিবেদনের বিস্তারিত' });
  await details.getByRole('button', { name: 'আবার চেষ্টা করুন' }).waitFor({ state: 'visible' });
  reportState.teamDetailsDelay = 250;
  await details.getByRole('button', { name: 'আবার চেষ্টা করুন' }).click();
  await expect(details.getByText('দলের বিস্তারিত লোড হচ্ছে…')).toBeVisible();
  await expect(details.getByRole('row', { name: /Synthetic Team Employee/ })).toBeVisible();
  await expect(details.getByText('QA-A-001')).toBeVisible();
  await expect(details.getByText('QA-A-002')).toHaveCount(0);
  expect(reportState.teamDetailsCalls).toHaveLength(2);
  expect(reportState.teamDetailsCalls.every(call => call.p_team_id === 'dddddddd-0000-4000-8000-000000000001'
    && call.p_unassigned === false && call.p_tenant_id === tenantId)).toBe(true);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await details.getByRole('button', { name: 'বন্ধ করুন' }).click();
  await expect(details).toHaveCount(0);
  expect(reportState.teamReportCalls.every(call => call.p_tenant_id === tenantId)).toBe(true);
});
