import { test, expect } from '@playwright/test';
import path from 'path';
import os from 'os';

const userId = 'f2222222-2222-4222-8222-222222222222';
const tenantId = 'f3333333-3333-4333-8333-333333333333';
const leaveTypeId = 'f4444444-4444-4444-8444-444444444444';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: 'employee-test@hris.test',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const token = [
  Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated',
    iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
    email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic-signature',
].join('.');

function isoDateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test('linked employee can complete the private evidence leave request on mobile', async ({ page }) => {
  let authenticated = false;
  let submitted = false;
  let savedEvidencePath = '';
  let denyNextEvidenceDownload = true;
  const evidenceUploadPaths: string[] = [];
  const evidenceDownloadPaths: string[] = [];
  let correctionSubmitted = false;
  let correctionPayload: Record<string, unknown> | null = null;
  let attendanceState: 'not-started' | 'checked-in' | 'checked-out' = 'not-started';
  const attendanceEventPayloads: Record<string, unknown>[] = [];
  const externalRequests: string[] = [];

  // Any request outside the local app must be handled by one of the explicit
  // Supabase mocks below. This prevents the UI test from reaching production.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    externalRequests.push(url.toString());
    await route.abort();
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'text/css', body: '',
  }));

  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      authenticated = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user,
      }) });
      return;
    }
    if (path.endsWith('/user') && authenticated) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'No local test session' }) });
  });

  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop() || '';
    if (endpoint === 'has_tenant_permission') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
    } else if (endpoint === 'hris_get_my_dashboard_data') {
      const requestHistory = submitted ? [{
        id: 'f5555555-5555-4555-8555-555555555555', leave_type_id: leaveTypeId,
        leave_type_name: 'Medical leave', from_date: isoDateAfter(12), to_date: isoDateAfter(12),
        requested_days: 1, reason: 'Synthetic mobile leave request', status: 'pending',
        attachment_url: savedEvidencePath,
      }, {
        id: 'f9999999-9999-4999-8999-999999999999', leave_type_id: leaveTypeId,
        leave_type_name: 'Medical leave', from_date: '2025-08-13', to_date: '2025-08-14',
        requested_days: 2, reason: 'Synthetic prior-year leave request', status: 'approved',
      }] : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        employee: {
          full_name: 'Synthetic Employee', employee_number: 'QA-A-001',
          official_email: user.email, designation_title: 'Product Designer', department_name: 'Experience Design',
        },
        dashboard_date: '2026-10-12',
        attendance: { records: attendanceState === 'not-started' ? [] : [{
          id: 'f6666666-6666-4666-8666-666666666666', attendance_date: '2026-10-12',
          status: 'present', check_in: '2026-10-12T03:00:00.000Z',
          check_out: attendanceState === 'checked-out' ? '2026-10-12T11:30:00.000Z' : null,
          work_mode: 'office', work_hours: attendanceState === 'checked-out' ? 8.5 : null,
        }], corrections: correctionSubmitted ? [{
          id: 'f8888888-8888-4888-8888-888888888888', attendance_date: '2026-10-12',
          requested_check_in: '2026-10-12T03:15:00.000Z', reason: 'Synthetic missed punch correction',
          status: 'pending', requested_at: '2026-10-12T12:00:00.000Z',
        }] : [] },
        balances: [{ leave_type_id: leaveTypeId, leave_type_name: 'Medical leave', available_days: 20,
          used_days: 0, pending_days: submitted ? 1 : 0 }],
        requests: requestHistory,
        leave_types: [{ id: leaveTypeId, name: 'Medical leave', annual_entitlement: 20,
          min_days_notice: 10, requires_document_proof: true }],
        holidays: [{ id: 'f7777777-7777-4777-8777-777777777777', name: 'Synthetic Staff Day', start_date: '2026-10-13', end_date: '2026-10-13' }],
        weekly_off_days: [0, 6], balance_year: new Date().getFullYear(),
      }) });
    } else if (endpoint === 'hris_employee_submit_leave_request') {
      submitted = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('f5555555-5555-4555-8555-555555555555') });
    } else if (endpoint === 'hris_employee_submit_attendance_correction') {
      correctionPayload = request.postDataJSON() as Record<string, unknown>;
      correctionSubmitted = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('f8888888-8888-4888-8888-888888888888') });
    } else if (endpoint === 'hris_get_my_leave_calendar') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        approved_leave: [], holidays: [],
      }) });
    } else if (endpoint === 'hris_get_my_attendance_period') {
      const payload = request.postDataJSON() as { p_tenant_id?: string; p_month_start?: string };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        tenant_id: tenantId,
        month_start: payload.p_month_start,
        records: attendanceState === 'checked-out' ? [{
          id: 'f6666666-6666-4666-8666-666666666666', attendance_date: '2026-10-12',
          status: 'present', check_in: '2026-10-12T03:00:00.000Z', check_out: '2026-10-12T11:30:00.000Z',
          work_mode: 'office', work_hours: 8.5,
        }] : [],
      }) });
    } else if (endpoint === 'hris_employee_record_attendance_event') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      attendanceEventPayloads.push(payload);
      attendanceState = payload.p_event === 'check_in' ? 'checked-in' : 'checked-out';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'f6666666-6666-4666-8666-666666666666', tenant_id: tenantId,
        attendance_date: '2026-10-12', check_in: '2026-10-12T03:00:00.000Z',
        check_out: attendanceState === 'checked-out' ? '2026-10-12T11:30:00.000Z' : null,
        work_mode: 'office', status: 'present',
      }) });
    } else if (endpoint === 'tenant_memberships') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { tenant_id: tenantId, role: 'synthetic_employee', status: 'active' },
      ]) });
    } else if (endpoint === 'employees') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { tenant_id: tenantId, employment_status: 'active' },
      ]) });
    } else if (endpoint === 'admin_users') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, is_super_admin: false }) });
    } else if (endpoint === 'tenants') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: tenantId, name: 'Synthetic Organization', slug: 'synthetic', timezone: 'Asia/Dhaka' },
      ]) });
    } else if (endpoint === 'leave_requests' || endpoint === 'leave_types') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Unexpected local UI endpoint: ${endpoint}` }) });
    }
  });

  await page.route('**/storage/v1/object/leave-evidence/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = decodeURIComponent(url.pathname.split('/object/leave-evidence/')[1] || '');
    if (request.method() === 'GET') {
      evidenceDownloadPaths.push(path);
      if (denyNextEvidenceDownload) {
        denyNextEvidenceDownload = false;
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Evidence access denied in isolated UI test.' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 synthetic evidence download' });
      return;
    }
    if (request.method() === 'POST') { savedEvidencePath = path; evidenceUploadPaths.push(path); }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'synthetic-evidence' }) });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Personal Dashboard' })).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1117 });
  const profileCard = page.locator('section[aria-labelledby="employee-profile-heading"]');
  const employeeDashboardGrid = profileCard.locator('xpath=..');
  const profileBounds = await profileCard.boundingBox();
  const leaveRailBounds = await employeeDashboardGrid.locator(':scope > aside').boundingBox();
  expect(Math.abs((profileBounds?.width ?? 0) - 278)).toBeLessThan(1);
  expect(Math.abs((leaveRailBounds?.width ?? 0) - 360)).toBeLessThan(1);
  expect(Math.abs((leaveRailBounds?.x ?? 0) - ((profileBounds?.x ?? 0) + (profileBounds?.width ?? 0)) - 24)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
  await page.setViewportSize({ width: 375, height: 812 });

  await expect(page.getByRole('heading', { name: 'Personal Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic Employee' })).toBeVisible();
  await expect(page.getByText('Product Designer')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today’s attendance' })).toBeVisible();
  await expect(page.getByText('You have not checked in today.')).toBeVisible();
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByText('You are checked in for today.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check out', exact: true }).click();
  await expect(page.getByText('You are checked out for today.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check in', exact: true })).toHaveCount(0);
  expect(attendanceEventPayloads).toEqual([
    { p_tenant_id: tenantId, p_event: 'check_in' },
    { p_tenant_id: tenantId, p_event: 'check_out' },
  ]);
  await expect(page.locator('p.text-right').getByText('8.5 hr', { exact: true })).toBeVisible();
  const dashboardTabs = page.getByRole('group', { name: 'Personal dashboard views' });
  await expect(dashboardTabs.getByRole('button', { name: 'Working hours' })).toBeVisible();
  await expect(dashboardTabs.getByRole('button', { name: 'Work location' })).toBeVisible();
  await expect(dashboardTabs.getByRole('button', { name: 'Leave type' })).toBeVisible();
  await expect(dashboardTabs.getByRole('button', { name: 'Check-in times' })).toBeVisible();
  const tabColumns = await dashboardTabs.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(tabColumns).toBe(2);
  expect(await dashboardTabs.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Work location' }).click();
  await expect(page.getByText('Office').first()).toBeVisible();
  await page.getByRole('button', { name: 'Leave type' }).click();
  await expect(page.getByText('Medical leave', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming holidays' })).toBeVisible();
  await expect(page.getByText('Synthetic Staff Day')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Request time off' })).toBeVisible();
  await page.getByRole('button', { name: 'Working hours' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/employee-dashboard-desktop-20261012.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(376);
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/employee-dashboard-mobile-20261012.png'), fullPage: true });
  await page.getByRole('button', { name: 'Request a correction' }).click();
  const correctionDialog = page.getByRole('dialog', { name: 'Request attendance correction' });
  await expect(correctionDialog).toBeVisible();
  await expect(page.getByLabel('Attendance date')).toHaveValue('2026-10-12');
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/employee-attendance-correction-mobile-20261012.png') });
  await page.getByLabel('Requested check-in').fill('09:15');
  await correctionDialog.getByLabel(/Reason/).fill('Synthetic missed punch correction');
  await correctionDialog.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(page.getByText('Attendance correction submitted for review.', { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /Synthetic missed punch correction/ })).toBeVisible();
  const correctionHistoryRegion = page.getByRole('region', { name: 'Attendance correction history table', exact: true });
  await expect(correctionHistoryRegion).toHaveAttribute('tabindex', '0');
  expect(await correctionHistoryRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await correctionHistoryRegion.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => correctionHistoryRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(correctionPayload).toEqual({
    p_tenant_id: tenantId,
    p_payload: {
      attendance_date: '2026-10-12', check_in_time: '09:15', check_out_time: null,
      work_mode: null, reason: 'Synthetic missed punch correction',
    },
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await page.getByRole('button', { name: 'Request for leave' }).click();
  const dialog = page.getByRole('dialog', { name: 'Request for leave' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close leave request' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Request for leave' }).click();
  await page.getByLabel('Leave type').selectOption(leaveTypeId);
  const fromDate = page.getByLabel('From date');
  await expect(fromDate).toHaveAttribute('min', '2026-10-22');
  await expect(page.getByText(/Earliest start date: 2026-10-22/)).toBeVisible();
  await fromDate.fill('2026-10-21');
  await page.getByLabel('To date').fill('2026-10-21');
  await page.getByLabel('Reason').fill('Synthetic mobile leave request');
  await page.locator('#personal-leave-evidence').setInputFiles({
    name: 'medical-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic test evidence'),
  });
  await page.getByRole('button', { name: 'Send request' }).click();
  expect(await fromDate.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  expect(evidenceUploadPaths).toHaveLength(0);
  expect(submitted).toBe(false);
  await expect(dialog).toBeVisible();
  await fromDate.fill(isoDateAfter(12));
  await page.getByLabel('To date').fill(isoDateAfter(12));
  const formBody = dialog.locator('form > div').first();
  await formBody.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const evidenceClearsFooter = await page.evaluate(() => {
    const evidence = document.querySelector('#personal-leave-evidence');
    const footer = evidence?.closest('form')?.lastElementChild;
    if (!evidence || !(footer instanceof HTMLElement)) return false;
    return evidence.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top;
  });
  expect(evidenceClearsFooter).toBe(true);
  await expect(page.getByRole('button', { name: 'Send request' })).toBeEnabled();
  await page.screenshot({ path: path.join(os.tmpdir(), 'hris-employee-leave-mobile.png'), fullPage: false });
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Leave request submitted. You can follow its status in your history.')).toBeVisible();
  expect(evidenceUploadPaths).toHaveLength(1);
  await expect(page.getByText('Synthetic mobile leave request')).toBeVisible();
  const dashboardLeaveHistory = page.getByRole('region', { name: 'My leave request history table', exact: true });
  await expect(dashboardLeaveHistory).toHaveAttribute('tabindex', '0');
  expect(await dashboardLeaveHistory.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await dashboardLeaveHistory.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => dashboardLeaveHistory.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await page.getByRole('button', { name: 'Request for leave' }).click();
  await expect(page.getByLabel('Supporting evidence')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 1000 });
  const moduleNav = page.getByRole('navigation', { name: 'HRIS modules' });
  await moduleNav.getByRole('button', { name: 'My Leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Personal leave' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Available leave breakdown' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My leave calendar' })).toBeVisible();
  await expect(page.getByText('No approved leave on this date.')).toBeVisible();
  const history = page.getByRole('table', { name: `Personal leave history for ${new Date().getFullYear()}` });
  const submittedHistoryRow = history.getByRole('row', { name: /Synthetic mobile leave request/ });
  await expect(submittedHistoryRow).toContainText(/pending/i);
  await expect(submittedHistoryRow.getByRole('button', { name: 'Download evidence' })).toBeVisible();
  await submittedHistoryRow.getByRole('button', { name: 'Download evidence' }).click();
  await expect(page.getByRole('alert')).toContainText('Evidence access denied in isolated UI test.');
  const evidenceDownload = page.waitForEvent('download');
  await submittedHistoryRow.getByRole('button', { name: 'Download evidence' }).click();
  expect((await evidenceDownload).suggestedFilename()).toBe('personal-leave-evidence-f5555555.pdf');
  expect(savedEvidencePath).toMatch(new RegExp(`^${userId}/${tenantId}/[0-9a-f-]{36}\\.pdf$`, 'i'));
  expect(evidenceDownloadPaths).toEqual([savedEvidencePath, savedEvidencePath]);
  await expect(page.getByRole('status').filter({ hasText: 'Evidence downloaded.' })).toBeVisible();
  await expect(history.getByRole('row', { name: /Synthetic prior-year leave request/ })).toHaveCount(0);
  await page.getByLabel('Leave history of').selectOption('2025');
  const priorYearHistory = page.getByRole('table', { name: 'Personal leave history for 2025' });
  await expect(priorYearHistory.getByRole('row', { name: /Synthetic prior-year leave request/ })).toContainText(/approved/i);
  await expect(priorYearHistory.getByRole('row', { name: /Synthetic mobile leave request/ })).toHaveCount(0);
  await page.getByLabel('Leave history of').selectOption(String(new Date().getFullYear()));
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/personal-leave-desktop-20261012.png'), fullPage: true });
  const historyDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await historyDownload).suggestedFilename()).toMatch(/^personal-leave-history-\d{4}\.csv$/);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'My Leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Personal leave' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  await expect(page.getByRole('region', { name: 'Personal leave history' })).toBeVisible();
  await page.screenshot({ path: path.resolve(process.cwd(), 'docs/evidence/personal-leave-mobile-20261012.png'), fullPage: true });
  const mobileEvidenceRow = page.getByRole('table', { name: `Personal leave history for ${new Date().getFullYear()}` })
    .getByRole('row', { name: /Synthetic mobile leave request/ });
  await expect(mobileEvidenceRow.getByRole('button', { name: 'Download evidence' })).toBeVisible();
  const mobileEvidenceDownload = page.waitForEvent('download');
  await mobileEvidenceRow.getByRole('button', { name: 'Download evidence' }).click();
  expect((await mobileEvidenceDownload).suggestedFilename()).toBe('personal-leave-evidence-f5555555.pdf');
  expect(externalRequests).toEqual([]);
});
