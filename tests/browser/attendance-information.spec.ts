import { test, expect } from '@playwright/test';
import path from 'path';

// The fixture values represent the tenant's Asia/Dhaka timezone. Keep this
// browser journey deterministic on hosted runners whose default timezone is UTC.
test.use({ timezoneId: 'Asia/Dhaka' });

const userId = 'e1111111-1111-4111-8111-111111111111';
const tenantId = 'e2222222-2222-4222-8222-222222222222';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-attendance-manager@example.org',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', email: user.email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

test('attendance information uses tenant-scoped detail rows and keeps filters, export, and mobile table usable', async ({ page }) => {
  const externalRequests: string[] = [];
  const attendanceCalls: Record<string, unknown>[] = [];
  let reportOnly = false;
  const syntheticAttendance = {
    id: 'e3333333-3333-4333-8333-333333333333', employee_id: 'e4444444-4444-4444-8444-444444444444',
    full_name: 'Synthetic Attendance Employee', employee_number: 'ATT-001',
    designation_title: 'UX Designer', department_name: 'Experience Design',
    team_name: 'Synthetic Product Team',
    attendance_date: '2026-10-12', check_in: '2026-10-12T03:13:16.000Z',
    check_out: '2026-10-12T11:46:58.000Z', work_mode: 'office', status: 'present', work_hours: 8.56,
  };
  const syntheticLateAttendance = {
    ...syntheticAttendance, id: 'e5555555-5555-4555-8555-555555555555', employee_id: 'e6666666-6666-4666-8666-666666666666',
    full_name: 'Synthetic Late Employee', employee_number: 'ATT-002', status: 'late', work_hours: 8.3,
    team_name: 'Synthetic Design Team',
  };
  const allAttendance = [syntheticAttendance, syntheticLateAttendance];
  const correctionRequests: Record<string, unknown>[] = [
    { id: 'e7777777-7777-4777-8777-777777777777', employee_id: syntheticAttendance.employee_id,
      employee_number: 'ATT-001', full_name: 'Synthetic Attendance Employee', attendance_date: '2026-10-12',
      requested_check_in: '2026-10-12T03:15:00.000Z', requested_check_out: null, requested_work_mode: null,
      reason: 'Synthetic missed punch approval', status: 'pending' },
    { id: 'e8888888-8888-4888-8888-888888888888', employee_id: syntheticAttendance.employee_id,
      employee_number: 'ATT-001', full_name: 'Synthetic Attendance Employee', attendance_date: '2026-10-11',
      requested_check_in: null, requested_check_out: '2026-10-11T11:30:00.000Z', requested_work_mode: null,
      reason: 'Synthetic missed punch rejection', status: 'pending' },
  ];
  const correctionDecisions: Record<string, unknown>[] = [];

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') { await route.continue(); return; }
    externalRequests.push(url.toString());
    await route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/auth/v1/**', async route => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
    } else if (requestPath.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    } else {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'No local test session' }) });
    }
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const requestPath = new URL(request.url()).pathname;
    const endpoint = requestPath.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') {
      const permission = request.postDataJSON() as { p_permission_id?: string };
      const allowed = !reportOnly || permission.p_permission_id === 'reports.view';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(allowed) });
      return;
    }
    if (endpoint === 'hris_get_tenant_dashboard_summary') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        dashboard_date: '2026-10-12', team_members: 1, employees: 1, attendance_today: 1,
        present_today: 1, attendance_last_7_days: [], attendance_last_30_days: [],
      }) });
      return;
    }
    if (endpoint === 'hris_get_tenant_attendance_data') {
      const body = request.postDataJSON() as Record<string, unknown>;
      attendanceCalls.push(body);
      const data = body.p_report === true
        ? [
          { employee_id: syntheticAttendance.employee_id,
            employee_number: body.p_search === 'Formula' ? '=HYPERLINK("https://example.invalid","Open")' : 'ATT-001',
            employee_name: 'Aggregate Report Employee',
            department_name: 'Experience Design', designation_title: 'UX Designer', team_name: 'Synthetic Product Team', attendance_days: 999, office_hours: 45, working_hours: 46.48, deviation: 1.48 },
          { employee_id: syntheticLateAttendance.employee_id, employee_number: 'ATT-002', employee_name: 'Aggregate Negative Employee',
            department_name: 'Experience Design', designation_title: 'UX Designer', team_name: 'Synthetic Design Team', attendance_days: 999, office_hours: 45, working_hours: 44.3, deviation: -0.7 },
        ]
        : { records: body.p_status && body.p_status !== 'all'
          ? allAttendance.filter(row => row.status === body.p_status) : allAttendance, corrections: correctionRequests };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      return;
    }
    if (endpoint === 'admin_resolve_attendance_correction') {
      const decision = request.postDataJSON() as Record<string, unknown>;
      correctionDecisions.push(decision);
      const target = correctionRequests.find(item => item.id === decision.p_id);
      if (target) {
        target.status = String(decision.p_decision);
        target.resolution_note = typeof decision.p_note === 'string' ? decision.p_note : undefined;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      return;
    }
    if (endpoint === 'tenant_memberships') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ tenant_id: tenantId, role: 'qa_tenant_manager', status: 'active' }]) });
    } else if (endpoint === 'employees') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else if (endpoint === 'admin_users') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    } else if (endpoint === 'tenants') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: tenantId, name: 'Synthetic Attendance Org', slug: 'attendance-test', timezone: 'Asia/Dhaka' }]) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Attendance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Attendance Report' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Attendance information' })).toBeVisible();
  const attendanceTable = page.getByRole('table', { name: 'Attendance information' });
  await expect(attendanceTable.getByRole('columnheader', { name: 'Team Name' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(attendanceTable.getByRole('columnheader', { name: 'দলের নাম' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  const row = page.getByRole('table', { name: 'Attendance information' }).getByRole('row', { name: /Synthetic Attendance Employee/ });
  await expect(row).toContainText('ATT-001');
  await expect(row).toContainText('UX Designer');
  await expect(row).toContainText('Synthetic Product Team');
  await expect(row).toContainText('Experience Design');
  await expect(row).toContainText('12-10-2026');
  await expect(row).toContainText('Office');
  await expect(row).toContainText('8.56');
  await expect(page.getByText('Aggregate Report Employee')).toHaveCount(0);
  const correctionCard = page.getByRole('heading', { name: 'Attendance correction requests' }).locator('xpath=..');
  const approvalRow = correctionCard.getByRole('row', { name: /Synthetic missed punch approval/ });
  await expect(approvalRow).toContainText('09:15');
  await approvalRow.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Attendance correction approved.', { exact: true })).toBeVisible();
  await expect(correctionCard.getByRole('row', { name: /Synthetic missed punch approval/ })).toContainText('approved');
  const rejectionRow = correctionCard.getByRole('row', { name: /Synthetic missed punch rejection/ });
  await rejectionRow.getByRole('button', { name: 'Reject' }).click();
  const rejectionDialog = page.getByRole('dialog', { name: 'Reject attendance correction' });
  await expect(rejectionDialog).toContainText('Synthetic Attendance Employee');
  await rejectionDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(rejectionDialog).toBeHidden();
  expect(correctionDecisions).toHaveLength(1);

  await rejectionRow.getByRole('button', { name: 'Reject' }).click();
  const escapedDialog = page.getByRole('dialog', { name: 'Reject attendance correction' });
  await page.keyboard.press('Escape');
  await expect(escapedDialog).toBeHidden();
  await expect(rejectionRow.getByRole('button', { name: 'Reject' })).toBeFocused();
  expect(correctionDecisions).toHaveLength(1);

  await rejectionRow.getByRole('button', { name: 'Reject' }).click();
  const confirmedDialog = page.getByRole('dialog', { name: 'Reject attendance correction' });
  await confirmedDialog.getByLabel('Decision note (optional)').fill('Please include the missing punch time.');
  await confirmedDialog.getByRole('button', { name: 'Reject correction' }).click();
  await expect(page.getByText('Attendance correction rejected.', { exact: true })).toBeVisible();
  const rejectedRow = correctionCard.getByRole('row', { name: /Synthetic missed punch rejection/ });
  await expect(rejectedRow).toContainText('rejected');
  await expect(rejectedRow).toContainText('Decision note: Please include the missing punch time.');
  expect(correctionDecisions).toEqual([
    { p_id: correctionRequests[0].id, p_decision: 'approved', p_note: null },
    { p_id: correctionRequests[1].id, p_decision: 'rejected', p_note: 'Please include the missing punch time.' },
  ]);
  expect(attendanceCalls.some(call => call.p_report === false && call.p_tenant_id === tenantId)).toBe(true);
  expect(attendanceCalls.some(call => call.p_report === true && call.p_tenant_id === tenantId)).toBe(true);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/attendance-information-desktop-20261016.png'), fullPage: true });

  await page.getByLabel('Search employees').fill('Synthetic');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => attendanceCalls.some(call => call.p_search === 'Synthetic')).toBe(true);
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByLabel('From date')).toBeVisible();
  await page.getByLabel('From date').fill('2026-10-05');
  await expect.poll(() => attendanceCalls.some(call => call.p_start === '2026-10-05')).toBe(true);
  await page.getByLabel('Status').selectOption('late');
  await expect.poll(() => attendanceCalls.some(call => call.p_status === 'late')).toBe(true);
  await expect(page.getByRole('row', { name: /Synthetic Late Employee/ })).toBeVisible();
  await expect(page.getByLabel('Status').locator('option')).toHaveText(['All visible statuses', 'late', 'present']);
  const downloadWaiter = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const download = await downloadWaiter;
  expect(download.suggestedFilename()).toMatch(/^attendance-report-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
  const detailCsvStream = await download.createReadStream();
  let detailCsv = '';
  if (detailCsvStream) for await (const chunk of detailCsvStream) detailCsv += chunk.toString();
  expect(detailCsv).toContain('"Team Name"');
  expect(detailCsv).toContain('"Synthetic Design Team"');

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  const tableRegion = page.getByRole('region', { name: 'Scrollable attendance report table' });
  await expect(tableRegion).toBeVisible();
  expect(await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/attendance-information-mobile-20261016.png'), fullPage: true });

  reportOnly = true;
  await page.setViewportSize({ width: 1920, height: 1117 });
  await page.reload();
  await page.getByRole('button', { name: 'Attendance', exact: true }).click();
  const reportTable = page.getByRole('table', { name: 'Attendance summary by employee' });
  await expect(reportTable).toBeVisible();
  const reportFrame = page.locator('section[aria-labelledby="attendance-report-heading"]');
  const reportFrameBounds = await reportFrame.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, width: bounds.width };
  });
  expect(Math.abs(reportFrameBounds.width - 1386)).toBeLessThan(1);
  expect(Math.abs(reportFrameBounds.x - 320)).toBeLessThan(4);
  const reportControls = page.getByRole('form', { name: 'Attendance report controls' });
  const reportSearch = reportControls.getByLabel('Search employees');
  const toolbarDownload = reportControls.getByRole('button', { name: 'Download Report', exact: true });
  const toolbarFilters = reportControls.getByRole('button', { name: 'Filters', exact: true });
  const filterPanel = page.locator('#attendance-filters');
  await expect(filterPanel).toHaveCount(1);
  await expect(filterPanel).toBeHidden();
  await expect(toolbarFilters).toHaveAttribute('aria-expanded', 'false');
  await expect(toolbarFilters).toHaveAttribute('aria-controls', 'attendance-filters');
  await toolbarFilters.click();
  await expect(filterPanel).toBeVisible();
  await expect(toolbarFilters).toHaveAttribute('aria-expanded', 'true');
  await toolbarFilters.click();
  await expect(filterPanel).toBeHidden();
  await expect(toolbarFilters).toHaveAttribute('aria-expanded', 'false');
  const controlBounds = await Promise.all([reportSearch, toolbarDownload, toolbarFilters].map(locator =>
    locator.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, width: bounds.width };
    })));
  expect(Math.abs(controlBounds[0].width - 334)).toBeLessThan(0.1);
  expect(Math.abs(controlBounds[1].width - 184)).toBeLessThan(0.1);
  expect(Math.abs(controlBounds[2].width - 64)).toBeLessThan(0.1);
  expect(controlBounds[0].x).toBeLessThan(controlBounds[1].x);
  expect(controlBounds[1].x).toBeLessThan(controlBounds[2].x);
  const readIconBounds = (index: number) => reportControls.locator('img').nth(index).evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  const searchIconBounds = await readIconBounds(0);
  const downloadIconBounds = await readIconBounds(1);
  const filterIconBounds = await readIconBounds(2);
  expect(Math.abs(searchIconBounds.width - 12.4444)).toBeLessThan(0.1);
  expect(Math.abs(downloadIconBounds.width - 10)).toBeLessThan(0.1);
  expect(Math.abs(downloadIconBounds.height - 12)).toBeLessThan(0.1);
  expect(Math.abs(filterIconBounds.width - 18)).toBeLessThan(0.1);
  const positiveRow = reportTable.getByRole('row', { name: /Aggregate Report Employee/ });
  const negativeRow = reportTable.getByRole('row', { name: /Aggregate Negative Employee/ });
  const aggregateRows = reportTable.locator('tbody tr');
  const aggregateRowGap = await aggregateRows.evaluateAll(rows => {
    const first = rows[0].getBoundingClientRect();
    const second = rows[1].getBoundingClientRect();
    return second.top - first.bottom;
  });
  expect(Math.abs(aggregateRowGap - 6)).toBeLessThan(0.5);
  await expect(positiveRow).toContainText('UX Designer');
  await expect(positiveRow).toContainText('Synthetic Product Team');
  await expect(positiveRow).toContainText('Experience Design');
  await expect(positiveRow).toContainText('45.00');
  await expect(positiveRow).toContainText('46.48');
  await expect(positiveRow).toContainText('+1.48');
  await expect(positiveRow.getByRole('cell').last().locator('span')).toHaveClass(/text-emerald-700/);
  await expect(negativeRow).toContainText('44.30');
  await expect(negativeRow).toContainText('-0.70');
  await expect(negativeRow.getByRole('cell').last().locator('span')).toHaveClass(/text-rose-700/);
  expect(await reportTable.getByRole('columnheader').allTextContents()).toEqual([
    'Name', 'Designation', 'Team Name', 'Department', 'From date', 'To date', 'Office Hour', 'Work Hour', 'Deviation',
  ]);
  await expect(positiveRow).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/attendance-report-desktop-20261016.png'), fullPage: true });

  const teamNameHeader = reportTable.getByRole('columnheader', { name: /Team Name/ });
  await expect(teamNameHeader).toHaveAttribute('aria-sort', 'none');
  const teamSortIcon = teamNameHeader.locator('img');
  await expect(teamSortIcon).toBeVisible();
  const iconDimensions = await teamSortIcon.evaluate(element => {
    const image = element as HTMLImageElement;
    const bounds = image.getBoundingClientRect();
    return { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      renderedWidth: bounds.width, renderedHeight: bounds.height };
  });
  expect(iconDimensions.naturalWidth).toBe(14);
  expect(iconDimensions.naturalHeight).toBeGreaterThan(10);
  expect(Math.abs(iconDimensions.renderedWidth - 14)).toBeLessThan(0.1);
  expect(Math.abs(iconDimensions.renderedHeight - 11.5957)).toBeLessThan(0.5);
  await page.getByRole('button', { name: 'Sort by Team Name ascending' }).click();
  await expect(teamNameHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(reportTable.getByRole('row').nth(1)).toContainText('Synthetic Design Team');
  await page.getByRole('button', { name: 'Sort by Team Name descending' }).click();
  await expect(teamNameHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(reportTable.getByRole('row').nth(1)).toContainText('Synthetic Product Team');

  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('Select Team').selectOption('Synthetic Design Team');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(positiveRow).toHaveCount(0);
  await expect(negativeRow).toBeVisible();
  const filteredDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Report', exact: true }).click();
  const filteredReport = await filteredDownload;
  const filteredStream = await filteredReport.createReadStream();
  let filteredCsv = '';
  if (filteredStream) for await (const chunk of filteredStream) filteredCsv += chunk.toString();
  expect(filteredCsv).toContain('Synthetic Design Team');
  expect(filteredCsv).not.toContain('Synthetic Product Team');
  await page.getByLabel('Select Team').selectOption('');
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect(positiveRow).toBeVisible();
  await expect(negativeRow).toBeVisible();
  await page.getByRole('button', { name: 'Filters' }).click();

  await page.getByLabel('Search employees').fill('Aggregate Report');
  await page.getByLabel('Search employees').press('Enter');
  await expect.poll(() => attendanceCalls.some(call => call.p_report === true && call.p_search === 'Aggregate Report')).toBe(true);
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByLabel('From date')).toBeVisible();
  await expect(page.getByLabel('Status')).toHaveCount(0);
  const reportCallsBeforeDraft = attendanceCalls.filter(call => call.p_report === true).length;
  await page.getByLabel('From date').fill('2026-10-01');
  await expect.poll(() => attendanceCalls.filter(call => call.p_report === true).length, { timeout: 500 }).toBe(reportCallsBeforeDraft);
  await page.getByRole('button', { name: 'Apply Filter', exact: true }).click();
  await expect.poll(() => attendanceCalls.some(call => call.p_report === true && call.p_start === '2026-10-01')).toBe(true);
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Report', exact: true }).click();
  const downloadedReport = await reportDownload;
  expect(downloadedReport.suggestedFilename()).toMatch(/^attendance-report-.*\.csv$/);
  const reportStream = await downloadedReport.createReadStream();
  let reportCsv = '';
  if (reportStream) for await (const chunk of reportStream) reportCsv += chunk.toString();
  expect(reportCsv).toContain('Synthetic Product Team');

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  expect(await page.getByRole('region', { name: 'Scrollable attendance report table' }).evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/attendance-report-mobile-20261016.png'), fullPage: true });
  await page.getByLabel('Search employees').fill('Formula');
  await page.getByLabel('Search employees').press('Enter');
  await expect.poll(() => attendanceCalls.some(call => call.p_report === true && call.p_search === 'Formula')).toBe(true);
  await expect(page.getByRole('row', { name: /Aggregate Report Employee/ })).toContainText('=HYPERLINK');
  const formulaDownloadWaiter = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Report', exact: true }).click();
  const formulaDownload = await formulaDownloadWaiter;
  const formulaStream = await formulaDownload.createReadStream();
  let formulaCsv = '';
  if (formulaStream) for await (const chunk of formulaStream) formulaCsv += chunk.toString();
  expect(formulaCsv).toContain("\"'=HYPERLINK(");
  expect(formulaCsv).toContain('"-0.7"');
  expect(externalRequests).toEqual([]);
});
