import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'path';

// The fixture tenant is Asia/Dhaka while this browser stays UTC, proving that
// attendance rows use the selected tenant's timezone instead of the host's.
test.use({ timezoneId: 'UTC' });

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
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { await route.continue(); return; }
    externalRequests.push(url.toString());
    await route.abort();
  });
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
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('14px Poppins'))).toBe(true);
  await page.getByRole('button', { name: 'Attendance & Leave', exact: true }).click();
  // The Figma application-management strip is a view-only layer over existing
  // server-authorized routes, not an invented bulk-approval workflow.
  await expect(page.getByRole('heading', { name: 'Attendance & Leave Application Management' })).toBeVisible();
  const designSections = page.getByRole('navigation', { name: 'Attendance and leave sections' });
  await expect(designSections.getByRole('button', { name: 'Attendance Information' })).toHaveAttribute('aria-current', 'page');
  await expect(designSections.getByRole('button', { name: 'Attendance Requests' })).toBeEnabled();
  await expect(designSections.getByRole('button', { name: 'Leave Requests' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Attendance Report' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Attendance information' })).toBeVisible();
  const attendanceTable = page.getByRole('table', { name: 'Attendance information' });
  await expect(attendanceTable.getByRole('columnheader', { name: 'Team Name' })).toBeVisible();
  expect(await attendanceTable.getByRole('columnheader').allTextContents()).toEqual([
    'Name', 'Designation', 'Team Name', 'Department', 'From date', 'Work Location', 'In Time', 'Out Time', 'Status',
  ]);
  const attendanceTeamHeader = attendanceTable.getByRole('columnheader', { name: /Team Name/ });
  await expect(attendanceTeamHeader).toHaveAttribute('aria-sort', 'none');
  await expect(attendanceTeamHeader.getByRole('button', { name: 'Sort by Team Name ascending' })).toBeVisible();
  await expect(page.getByLabel('Search employees')).toHaveAttribute('placeholder', 'Search....');
  await expect(page.getByText('Synthetic missed punch approval')).toHaveCount(0);

  const shellEvidenceDir = path.resolve(process.cwd(), 'docs/evidence/ws01-shell');
  await mkdir(shellEvidenceDir, { recursive: true });
  const captureResponsiveShell = async (locale: 'en' | 'bn') => {
    for (const width of [1920, 1280, 768, 375]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 1117 });
      if (width >= 1024) {
        const sidebar = page.getByRole('complementary', { name: 'Primary HRIS navigation' });
        await expect(sidebar).toBeVisible();
        expect((await sidebar.boundingBox())?.width).toBe(111);
        const firstItem = sidebar.getByRole('button').first();
        expect((await firstItem.locator('[data-sidebar-icon]').boundingBox())?.width).toBe(42);
        await expect(firstItem.locator('[data-sidebar-label]')).toHaveCSS('font-size', '14px');
        expect((await page.getByRole('banner').boundingBox())?.height).toBe(72);
      } else {
        await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
      }
      if (width === 1920) {
        const logo = page.getByRole('banner').getByRole('img', { name: 'Synesis IT' });
        const logoDimensions = await logo.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return { naturalWidth: (element as HTMLImageElement).naturalWidth, naturalHeight: (element as HTMLImageElement).naturalHeight,
            renderedWidth: bounds.width, renderedHeight: bounds.height };
        });
        expect(logoDimensions).toEqual({ naturalWidth: 174, naturalHeight: 30, renderedWidth: 174, renderedHeight: 30 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      const tableRegion = page.getByRole('region', { name: 'Scrollable attendance report table' });
      await expect(tableRegion).toBeVisible();
      if (width < 1024) expect(await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      if (width === 1920) {
        const frame = await page.locator('section[aria-labelledby="attendance-report-heading"]').boundingBox();
        expect(frame?.x).toBe(324);
        expect(frame?.width).toBe(1383);
        const nameHeader = locale === 'en' ? 'Name' : 'নাম';
        expect((await attendanceTable.getByRole('columnheader', { name: nameHeader, exact: true }).boundingBox())?.height).toBe(59);
        expect((await attendanceTable.locator('tbody tr').first().boundingBox())?.height).toBe(80);
        const rows = attendanceTable.locator('tbody tr');
        const rowGap = await rows.evaluateAll(items => items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().bottom);
        expect(Math.abs(rowGap - 6)).toBeLessThan(0.5);
        const tableHeaderY = (await attendanceTable.locator('thead th').first().boundingBox())?.y ?? Number.NaN;
        expect(Math.abs(tableHeaderY - 302)).toBeLessThanOrEqual(1);
        const tableSurfaces = await attendanceTable.evaluate(table => {
          const frame = table.parentElement?.parentElement;
          const headerCell = table.querySelector('thead th');
          const bodyCell = table.querySelector('tbody td');
          return {
            frameBackground: frame ? getComputedStyle(frame).backgroundColor : '',
            headerBackground: headerCell ? getComputedStyle(headerCell).backgroundColor : '',
            rowBackground: bodyCell ? getComputedStyle(bodyCell).backgroundColor : '',
            borderSpacing: getComputedStyle(table).borderSpacing,
          };
        });
        expect(tableSurfaces).toEqual({
          frameBackground: 'rgba(0, 0, 0, 0)',
          headerBackground: 'rgb(255, 255, 255)',
          rowBackground: 'rgb(255, 255, 255)',
          borderSpacing: '0px 6px',
        });
        const controls = page.getByRole('form', {
          name: locale === 'en' ? 'Attendance report controls' : 'উপস্থিতি প্রতিবেদন নিয়ন্ত্রণ',
        });
        const controlWidths = await Promise.all([
          controls.getByLabel(locale === 'en' ? 'Search employees' : 'কর্মচারী খুঁজুন'),
          controls.getByRole('button', { name: locale === 'en' ? 'Download Report' : 'প্রতিবেদন ডাউনলোড করুন', exact: true }),
          controls.getByRole('button', { name: locale === 'en' ? 'Filters' : 'ফিল্টার', exact: true }),
        ].map(locator => locator.evaluate(element => element.getBoundingClientRect().width)));
        expect(controlWidths).toEqual([334, 170, 62]);
      }
      if (width === 375) {
        const logo = page.getByRole('banner').getByRole('img', { name: 'Synesis IT' });
        const bounds = await logo.boundingBox();
        expect(bounds?.width).toBe(145);
        expect(bounds?.height).toBe(25);
      }
      await page.screenshot({ path: path.join(shellEvidenceDir, `attendance-${locale}-${width}.png`), fullPage: false });
    }
  };
  await captureResponsiveShell('en');
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1117 });
    const trigger = page.getByRole('button', { name: 'Open navigation menu' });
    await trigger.click();
    const menu = page.getByRole('dialog', { name: 'HRIS navigation' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close navigation menu' })).toBeFocused();
    await page.screenshot({ path: path.join(shellEvidenceDir, `attendance-menu-en-${width}.png`), fullPage: false });
    await page.keyboard.press('Shift+Tab');
    const lastMenuItem = menu.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button').last();
    await expect(lastMenuItem).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close navigation menu' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    const accountTrigger = page.getByRole('button', { name: 'Account options' });
    await accountTrigger.click();
    const accountPanel = page.getByRole('region', { name: 'Account details' });
    await expect(accountPanel).toBeVisible();
    await expect(accountPanel.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const accountBounds = await accountPanel.boundingBox();
    expect(accountBounds?.x).toBeGreaterThanOrEqual(0);
    expect((accountBounds?.x || 0) + (accountBounds?.width || 0)).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press('Escape');
    await expect(accountPanel).toBeHidden();
    await expect(accountTrigger).toBeFocused();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(designSections.getByRole('button', { name: 'উপস্থিতির তথ্য' })).toHaveAttribute('aria-current', 'page');
  await expect(designSections.getByRole('button', { name: 'ছুটির আবেদনসমূহ' })).toBeEnabled();
  await expect(attendanceTable.getByRole('columnheader', { name: 'দলের নাম' })).toBeVisible();
  await expect(page.getByLabel('কর্মচারী খুঁজুন')).toHaveAttribute('placeholder', 'খুঁজুন....');
  await expect(attendanceTable.getByRole('columnheader', { name: /দলের নাম/ }).getByRole('button', { name: /ঊর্ধ্বক্রমে/ })).toBeVisible();
  await captureResponsiveShell('bn');
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const row = page.getByRole('table', { name: 'Attendance information' }).getByRole('row', { name: /Synthetic Attendance Employee/ });
  // Keep the identifier available to assistive technology without rendering it in the row.
  await expect(row.getByText('Employee number ATT-001', { exact: true })).toHaveClass(/sr-only/);
  await expect(row).toContainText('UX Designer');
  await expect(row).toContainText('Synthetic Product Team');
  await expect(row).toContainText('Experience Design');
  await expect(row).toContainText('12-10-2026');
  await expect(row).toContainText('Work from Office');
  await expect(row).toContainText('09:13:16am');
  await expect(row).toContainText('05:46:58pm');
  await expect(row).toContainText('On Time');
  await expect(page.getByText('Aggregate Report Employee')).toHaveCount(0);

  const requestTab = designSections.getByRole('button', { name: 'Attendance Requests' });
  await requestTab.click();
  await expect(page).toHaveURL(/#attendance-correction-requests$/);
  await expect(page.getByRole('heading', { name: 'Attendance Requests' })).toBeVisible();
  const requestTable = page.getByRole('table').first();
  await expect(requestTable).toBeVisible();
  await expect(requestTable).toContainText('Synthetic missed punch approval');
  await expect(page.getByRole('table', { name: 'Attendance information' })).toHaveCount(0);

  const captureRequestViews = async (locale: 'en' | 'bn') => {
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const width of [1920, 1280, 768, 375]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 1117 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await expect(requestTable).toBeVisible();
      const scrollRegion = requestTable.locator('xpath=..');
      if (width < 768) expect(await scrollRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await page.screenshot({ path: path.join(shellEvidenceDir, 'attendance-requests-' + locale + '-' + width + '.png'), fullPage: false });
    }
  };
  await captureRequestViews('en');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await expect(designSections.getByRole('button', { name: 'উপস্থিতির আবেদনসমূহ' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'উপস্থিতির আবেদনসমূহ' })).toBeVisible();
  await captureRequestViews('bn');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Switch language to English' }).click();

  const approvalRow = requestTable.getByRole('row', { name: /Synthetic missed punch approval/ });
  await approvalRow.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Attendance correction approved.' })).toHaveText('Attendance correction approved.');
  await expect(approvalRow).toContainText(/approved/i);
  const rejectionRow = requestTable.getByRole('row', { name: /Synthetic missed punch rejection/ });
  await rejectionRow.getByRole('button', { name: 'Reject' }).click();
  const rejectionDialog = page.getByRole('dialog', { name: 'Reject attendance correction' });
  await expect(rejectionDialog).toContainText('Synthetic Attendance Employee');
  await page.keyboard.press('Escape');
  await expect(rejectionDialog).toBeHidden();
  await expect(rejectionRow.getByRole('button', { name: 'Reject' })).toBeFocused();

  await page.setViewportSize({ width: 375, height: 812 });
  await rejectionRow.getByRole('button', { name: 'Reject' }).click();
  const confirmedDialog = page.getByRole('dialog', { name: 'Reject attendance correction' });
  const dialogBounds = await confirmedDialog.boundingBox();
  expect(dialogBounds?.x).toBeGreaterThanOrEqual(0);
  expect((dialogBounds?.x || 0) + (dialogBounds?.width || 0)).toBeLessThanOrEqual(376);
  expect((dialogBounds?.y || 0) + (dialogBounds?.height || 0)).toBeLessThanOrEqual(813);
  await page.screenshot({ path: path.join(shellEvidenceDir, 'attendance-rejection-overlay-en-375.png'), fullPage: false });
  await confirmedDialog.getByLabel('Decision note (optional)').fill('Please include the missing punch time.');
  await confirmedDialog.getByRole('button', { name: 'Reject correction' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Attendance correction rejected.' })).toHaveText('Attendance correction rejected.');
  await expect(rejectionRow).toContainText(/rejected/i);
  await expect(rejectionRow).toContainText('Decision note: Please include the missing punch time.');
  expect(correctionDecisions).toEqual([
    { p_id: correctionRequests[0].id, p_decision: 'approved', p_note: null },
    { p_id: correctionRequests[1].id, p_decision: 'rejected', p_note: 'Please include the missing punch time.' },
  ]);
  expect(attendanceCalls.some(call => call.p_report === false && call.p_tenant_id === tenantId)).toBe(true);
  expect(attendanceCalls.some(call => call.p_report === true && call.p_tenant_id === tenantId)).toBe(true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shellEvidenceDir, 'attendance-requests-resolved-en-1920.png'), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Attendance Information' }).click();
  await expect(page.getByRole('table', { name: 'Attendance information' })).toBeVisible();

  await page.getByLabel('Search employees').fill('Synthetic');
  await page.getByLabel('Search employees').press('Enter');
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
  await page.getByRole('button', { name: 'Download Report', exact: true }).click();
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
  await page.screenshot({ path: path.join(shellEvidenceDir, 'attendance-information-interactions-en-375.png'), fullPage: true });

  reportOnly = true;
  await page.evaluate(() => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#attendance-correction-requests`));
  await page.setViewportSize({ width: 1920, height: 1117 });
  await page.reload();
  await expect(page).not.toHaveURL(/#attendance-correction-requests$/);
  await expect(page.getByText('Attendance Requests', { exact: true })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: 'Attendance Requests' })).toHaveCount(0);
  await expect(page.getByText(/Synthetic missed punch approval/)).toHaveCount(0);
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
  const reportHeaderStyle = await reportTable.getByRole('columnheader', { name: 'Name', exact: true }).evaluate(element => {
    const style = getComputedStyle(element);
    return { fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
  });
  expect(reportHeaderStyle).toEqual({ fontSize: '14px', fontWeight: '400', color: 'rgb(158, 158, 158)' });
  expect((await reportTable.getByRole('columnheader', { name: 'Name', exact: true }).boundingBox())?.height).toBe(59);
  await expect(positiveRow).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shellEvidenceDir, 'attendance-report-aggregate-en-1920.png'), fullPage: true });

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

test('attendance requests at 375px keep horizontal scrolling inside the results table', async ({ page }) => {
  const correction = {
    id: 'e7777777-7777-4777-8777-777777777777',
    employee_id: 'e4444444-4444-4444-8444-444444444444',
    employee_number: 'ATT-001',
    full_name: 'Synthetic Attendance Employee',
    attendance_date: '2026-10-12',
    requested_check_in: '2026-10-12T03:15:00.000Z',
    requested_check_out: null,
    requested_work_mode: null,
    reason: 'Synthetic missed punch approval',
    status: 'pending',
  };

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost'
        || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      await route.continue();
      return;
    }
    await route.abort();
  });
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
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
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
      const data = body.p_report === true ? [] : { records: [], corrections: [correction] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      return;
    }
    let data: unknown = [];
    if (endpoint === 'tenant_memberships') data = [{ tenant_id: tenantId, role: 'qa_tenant_manager', status: 'active' }];
    else if (endpoint === 'admin_users') data = { active: false, is_super_admin: false };
    else if (endpoint === 'tenants') data = [{ id: tenantId, name: 'Synthetic Attendance Org', slug: 'attendance-test', timezone: 'Asia/Dhaka' }];
    else if (endpoint === 'employees') data = [];
    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const mobileMenuTrigger = page.getByRole('button', { name: 'Open navigation menu' });
  await mobileMenuTrigger.click();
  const mobileMenu = page.getByRole('dialog', { name: 'HRIS navigation' });
  await mobileMenu.getByRole('navigation', { name: 'HRIS modules' })
    .getByRole('button', { name: 'Attendance & Leave' }).click();
  const sections = page.getByRole('navigation', { name: 'Attendance and leave sections' });
  await sections.getByRole('button', { name: 'Attendance Requests' }).click();
  await expect(page).toHaveURL(/#attendance-correction-requests$/);

  const resultsTable = page.getByRole('table').first();
  await expect(resultsTable.getByRole('row', { name: /Synthetic missed punch approval/ })).toBeVisible();
  const resultsScroller = resultsTable.locator('xpath=..');
  await expect(resultsScroller).toHaveCSS('overflow-x', 'auto');
  await mkdir(path.resolve(process.cwd(), 'docs/evidence/ws01-shell'), { recursive: true });
  await page.screenshot({
    path: path.resolve(process.cwd(), 'docs/evidence/ws01-shell/attendance-requests-overflow-en-375.png'),
    fullPage: false,
  });

  const dimensions = await page.evaluate(() => {
    const scroller = document.querySelector('#attendance-correction-requests .overflow-x-auto') as HTMLElement | null;
    const table = scroller?.querySelector('table') as HTMLElement | null;
    const bounds = scroller?.getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      scrollerClientWidth: scroller?.clientWidth ?? 0,
      scrollerScrollWidth: scroller?.scrollWidth ?? 0,
      scrollerLeft: bounds?.left ?? -1,
      scrollerRight: bounds?.right ?? -1,
      tableWidth: table?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(dimensions.viewportWidth).toBe(375);
  expect(dimensions.documentWidth).toBeLessThanOrEqual(376);
  expect(dimensions.scrollerLeft).toBeGreaterThanOrEqual(0);
  expect(dimensions.scrollerRight).toBeLessThanOrEqual(376);
  expect(dimensions.scrollerScrollWidth).toBeGreaterThan(dimensions.scrollerClientWidth);
  expect(dimensions.tableWidth).toBeGreaterThan(dimensions.scrollerClientWidth);
});
