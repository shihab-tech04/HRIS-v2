import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261016221620_employee_personal_leave_calendar.sql');
const calendar = read('../../src/live/EmployeeLeaveCalendar.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-leave-evidence-browser.mjs');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));

test('leave calendar backend is an active-session, linked-employee, one-month tenant-scoped projection', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.hris_get_my_leave_calendar\(\s*p_tenant_id uuid,\s*p_start_date date,\s*p_end_date date/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_live_session\(\)/);
  assert.match(migration, /public\.tenants AS t[\s\S]+?t\.id = p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /r\.employee_id = v_employee_id[\s\S]+?r\.status = 'approved'/);
  assert.match(migration, /h\.tenant_id = p_tenant_id[\s\S]+?h\.active IS TRUE/);
  assert.match(migration, /r\.from_date <= p_end_date[\s\S]+?r\.to_date >= p_start_date/);
  assert.match(migration, /h\.start_date <= p_end_date[\s\S]+?h\.end_date >= p_start_date/);
  assert.match(migration, /'requested_days', r\.requested_days,[\s\S]+?'leave_type_name', lt\.name/);
  assert.doesNotMatch(migration, /'reason'\s*,\s*r\./);
  assert.doesNotMatch(migration, /'resolution_note'\s*,\s*r\./);
  assert.doesNotMatch(migration, /'resolved_by'\s*,\s*r\./);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.hris_get_my_leave_calendar\(uuid, date, date\) FROM PUBLIC, anon/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_my_leave_calendar\(uuid, date, date\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_leave_calendar\(uuid, date, date\) TO authenticated/);
  assert.match(migration, /LANGUAGE sql STABLE SECURITY INVOKER/);
  assert.match(migration, /The calendar range must cover one complete month/);
});

test('employee calendar uses its scoped RPC, refreshes by month, and keeps private reason text out of summaries', () => {
  assert.match(workspace, /<EmployeeLeaveCalendar key=\{tenantId\} tenantId=\{tenantId\}/);
  assert.match(workspace, /initialDate=\{String\(leave\.dashboard_date/);
  assert.match(calendar, /supabase\.rpc\('hris_get_my_leave_calendar'/);
  assert.match(calendar, /p_tenant_id: requestedTenantId/);
  assert.match(calendar, /p_start_date: monthStart/);
  assert.match(calendar, /p_end_date: rangeEnd/);
  assert.match(calendar, /setApprovedLeave\(value\.approved_leave/);
  assert.match(calendar, /setHolidays\(value\.holidays/);
  assert.match(calendar, /disabled=\{loading\} onClick=\{\(\) => void loadCalendar\(\)\}/);
  assert.match(calendar, /\{error && <div role="alert"/);
  assert.match(calendar, /\{loading && <p role="status"/);
  assert.match(calendar, /row => String\(row\.from_date\) <= selectedDate && String\(row\.to_date\) >= selectedDate/);
  assert.doesNotMatch(calendar, /row\.reason|row\.resolution_note|row\.resolved_by/);
  assert.match(calendar, /overflow-x-auto rounded-lg border border-slate-200/);
  assert.match(calendar, /min-w-\[336px\]/);
});

test('employee Personal Leave shares Bengali locale and existing request form patterns', () => {
  assert.match(workspace, /<EmployeePersonalLeave tenantId=\{tenantId\} tenantName=\{tenantName\} userId=\{userId\}[\s\S]+?locale=\{locale\}/);
  for (const phrase of [
    'Personal leave', 'Your leave balances and request history for {tenant}', 'Available leave breakdown',
    'Leave history', 'Export CSV', 'My leave calendar',
    'Approved leave and tenant-wide holidays. Request reasons stay private.', 'My approved leave on',
    'No approved leave on this date.', 'Unable to load your leave calendar.', 'Loading your leave calendar…',
  ]) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const translation = locale.match(new RegExp(`^\\s*'${escaped}':\\s*'([^']*)',?$`, 'm'));
    assert.ok(translation, `missing Bengali translation: ${phrase}`);
    assert.notEqual(translation[1], phrase, `Bengali translation copied English: ${phrase}`);
  }
});

test('isolated Auth/Postgres/browser acceptance proves persisted owner dates, tenant-wide holidays, privacy, and viewport/language recovery', () => {
  assert.match(runner, /20261016221620_employee_personal_leave_calendar\.sql/);
  assert.match(runner, /Synthetic personal calendar holiday/);
  assert.match(runner, /hris_get_my_leave_calendar/);
  assert.match(runner, /crossTenantDenied: employeeCalendarCrossTenant\.error\?\.code/);
  assert.match(runner, /anonymousDenied: Boolean\(anonymousCalendar\.error\)/);
  assert.match(browser, /HRIS_LOCAL_LEAVE_REQUEST_DATE/);
  assert.match(browser, /Synthetic evidence-required leave/);
  assert.match(browser, /personal calendar exposed a private leave request reason/);
  assert.match(browser, /Synthetic personal calendar holiday/);
  assert.match(browser, /Employee personal leave calendar mobile/);
  assert.match(browser, /Employee personal leave calendar desktop/);
  assert.match(browser, /Employee personal leave calendar Bengali mobile/);
  assert.match(browser, /LEAVE_EVIDENCE_BROWSER_ACCEPTANCE=PASS/);
});

test('E09-01, E09-02 and E09-04 map only the approved personal calendar and private leave projection stories', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  const expected = [
    ['E09-01', 142, 'As an employee, I want to see my approved leave on a calendar.'],
    ['E09-02', 143, 'As an employee, I want to see company holidays.'],
    ['E09-04', 145, 'As an employee, I want sensitive leave reasons to remain private.'],
  ];
  for (const [id, line, requirement] of expected) {
    assert.equal(stories.get(id)?.module_id, 'E09');
    assert.equal(stories.get(id)?.source_locator.line, line);
    assert.equal(stories.get(id)?.verbatim_requirement, requirement);
  }
  assert.match(migration, /r\.employee_id = v_employee_id[\s\S]+?r\.status = 'approved'/);
  assert.match(migration, /h\.tenant_id = p_tenant_id[\s\S]+?h\.active IS TRUE/);
  assert.doesNotMatch(migration, /'reason'\s*,\s*r\.|'resolution_note'\s*,\s*r\.|'resolved_by'\s*,\s*r\./);
  assert.match(runner, /E09-01 employee sees only their approved leave dates in the personal calendar/);
  assert.match(runner, /E09-02 employee sees active tenant-wide holidays in the personal calendar/);
  assert.match(runner, /E09-04 personal calendar hides leave reasons and reviewer identity/);
  assert.match(browser, /LEAVE_EVIDENCE_BROWSER_ACCEPTANCE=PASS/);
});

test('E09-03 and E09-05 stay partial until permitted team absence visibility rules are approved', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  assert.equal(stories.get('E09-03')?.verbatim_requirement, 'As an employee, I want to see permitted team absence information.');
  assert.equal(stories.get('E09-05')?.verbatim_requirement, 'As an employee, I want overlapping team absences to be visible only according to permissions.');
  assert.doesNotMatch(migration, /team_id|department_id|other_employee|team_absence/);
  assert.match(migration, /r\.employee_id = v_employee_id/);
});
