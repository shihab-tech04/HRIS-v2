import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));
const runtime = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs');
const holidayBrowser = read('../sql/isolated-auth/run-holiday-calendar-browser.mjs');
const quickAccessContract = read('./employee-dashboard-quick-access.test.mjs');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');

const stories = [
  { id: 'E01-01', line: 11, marker: 'EMPLOYEE_DASHBOARD_TODAY_STATUS_BROWSER_ACCEPTANCE=PASS', runtime: 'E01-01 partially verified' },
  { id: 'E01-02', line: 12, marker: 'EMPLOYEE_DASHBOARD_TODAY_TIMES_BROWSER_ACCEPTANCE=PASS', runtime: 'E01-02 dashboard reports persisted check-in and check-out times for today' },
  { id: 'E01-03', line: 13, marker: 'EMPLOYEE_DASHBOARD_LEAVE_BALANCE_BROWSER_ACCEPTANCE=PASS', runtime: 'E01-03 dashboard reports the employee’s persisted available leave balance from the existing balance contract' },
  { id: 'E01-04', line: 14, marker: 'EMPLOYEE_DASHBOARD_PENDING_REQUESTS_BROWSER_ACCEPTANCE=PASS', runtime: 'E01-04 pending leave, attendance, expense, travel, service and learning requests' },
  { id: 'E01-05', line: 15, marker: 'Local Auth/Postgres holiday calendar journey passed: outage retry, cancel, manager create/edit/deactivate/activate, EN/BN mobile/desktop, persisted employee upcoming-holiday visibility, tenant isolation, and refresh.', runtime: 'E01-05 employee upcoming holidays include the managed active entry and remain tenant-bound', browser: holidayBrowser },
  { id: 'E01-06', line: 16, marker: 'EMPLOYEE_UPCOMING_TRAINING_BROWSER_ACCEPTANCE=PASS', runtime: 'E01-06 training visibility is partially implemented' },
  { id: 'E01-07', line: 17, marker: 'EMPLOYEE_DASHBOARD_WORK_BROWSER_ACCEPTANCE=PASS', runtime: 'E01-07 assigned tasks, own goals, and overdue work' },
  { id: 'E01-08', line: 18, marker: 'EMPLOYEE_DASHBOARD_ANNOUNCEMENTS_BROWSER_ACCEPTANCE=PASS', runtime: 'E01-08 recent HR announcements appear on the employee dashboard' },
  { id: 'E01-09', line: 19, marker: 'EMPLOYEE_DASHBOARD_QUICK_ACCESS_BROWSER_ACCEPTANCE=PASS', runtime: 'dashboard quick access implements the byte-verified E01-09 story', runtimeSource: quickAccessContract },
  { id: 'E01-10', line: 20, marker: 'EMPLOYEE_IDENTITY_CARD_BROWSER_ACCEPTANCE=PASS', runtime: 'E01-10 partially verified: employee dashboard identity' },
];

test('E01 reconciliation uses the byte-verified canonical source and preserves its unmodified tracking fields', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  assert.equal(catalogue.story_total, 1047);
  assert.equal(catalogue.module_total, 153);
  const moduleStories = catalogue.stories.filter(story => story.module_id === 'E01');
  assert.deepEqual(moduleStories.map(story => story.story_id), stories.map(story => story.id));
  for (const mapped of stories) {
    const story = moduleStories.find(item => item.story_id === mapped.id);
    assert.equal(story.source_locator.line, mapped.line, `${mapped.id} source locator changed`);
    assert.equal(story.status, 'NOT TESTED', `${mapped.id} canonical tracking state must not be rewritten`);
    assert.deepEqual(story.test_ids, [], `${mapped.id} canonical evidence fields must remain untouched`);
    assert.ok((mapped.runtimeSource || runtime).includes(mapped.runtime), `${mapped.id} is missing its runtime acceptance record`);
    assert.ok((mapped.browser || browser).includes(mapped.marker), `${mapped.id} is missing its browser acceptance marker`);
  }
});

test('E01 partial findings stay explicit instead of being counted as accepted', () => {
  assert.match(runtime, /E01-01 partially verified/);
  assert.match(runtime, /E01-06 training visibility is partially implemented/);
  assert.match(runtime, /E01-10 partially verified/);
  assert.match(runtime, /E01-06 upcoming appraisal deadlines use the authenticated employee appraisal RPC/);
});

test('today status and work-mode browser acceptance expectations come from the final isolated database row', () => {
  assert.match(runtime, /const dashboardTodayAttendance = queryAdmin\([\s\S]*?attendance_date='\$\{localCurrentDate\}'::date/);
  assert.match(runtime, /HRIS_LOCAL_DASHBOARD_TODAY_STATUS: displayAttendanceValue\(dashboardTodayAttendance\.status\)/);
  assert.match(runtime, /HRIS_LOCAL_DASHBOARD_TODAY_WORK_MODE: displayAttendanceValue\(dashboardTodayAttendance\.work_mode\)/);
  assert.match(browser, /todayAttendanceText\.includes\(process\.env\.HRIS_LOCAL_DASHBOARD_TODAY_STATUS\)/);
  assert.match(browser, /todayAttendanceText\.includes\(process\.env\.HRIS_LOCAL_DASHBOARD_TODAY_WORK_MODE\)/);
  assert.doesNotMatch(browser, /todayAttendanceText\.includes\('Home'\)/);
});

test('E01-03 browser acceptance uses the persisted balance contract and matches the page’s rendered value and unit', () => {
  assert.match(runtime, /const dashboardLeaveBalance = employeeSummaryA\.balances\.find\(row => row\.leave_type_id === ids\.leaveTypeA\)\?\.available_days/);
  assert.match(runtime, /HRIS_LOCAL_DASHBOARD_LEAVE_AVAILABLE_DAYS: String\(dashboardLeaveBalance\)/);
  assert.match(browser, /const expectedAvailableBalance = `\$\{process\.env\.HRIS_LOCAL_DASHBOARD_LEAVE_AVAILABLE_DAYS\} days`/);
  assert.match(browser, /getByText\(expectedAvailableBalance, \{ exact: true \}\)/);
  assert.doesNotMatch(browser, /getByText\('days available', \{ exact: true \}\)/);
});

test('Employee HRIS primary cards use the 16px corners in the approved Figma frame', () => {
  for (const id of [
    'employee-profile-heading',
    'employee-today-heading',
    'employee-insights-heading',
    'employee-leave-balances-heading',
    'employee-holidays-heading',
  ]) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(workspace, new RegExp(`<section[^>]*aria-labelledby="${escaped}"[^>]*className="[^"]*rounded-2xl`), `${id} should match Figma's 16px card radius.`);
  }
  assert.match(workspace, /grid h-24 w-24 place-items-center rounded-xl/);
  for (const id of ['today-attendance-heading', 'attendance-trend-heading']) {
    const section = workspace.match(new RegExp(`<section[^>]*aria-labelledby="${id}"[^>]*className="[^"]*rounded-2xl`));
    const reversed = workspace.match(new RegExp(`<section className="[^"]*rounded-2xl[^"]*"[^>]*aria-labelledby="${id}"`));
    assert.ok(section || reversed, `${id} should match Figma's 16px card radius.`);
  }
});
