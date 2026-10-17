import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sourcePath = new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url);
const sourceBytes = readFileSync(sourcePath);
const source = JSON.parse(sourceBytes.toString('utf8'));
const migration = readFileSync(new URL('../../supabase/migrations/20261016230201_hris_employee_roster_notifications.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const roster = readFileSync(new URL('../../src/live/MyEmployeeRoster.tsx', import.meta.url), 'utf8');
const notifications = readFileSync(new URL('../../src/live/ProjectNotifications.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const authRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs', import.meta.url), 'utf8');

test('recovered canonical catalogue integrity and E13 source requirements remain exact', () => {
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  assert.equal(source.module_total, 153);
  assert.equal(source.story_total, 1047);
  const stories = source.stories.filter(story => /^E13-0[1-5]$/.test(story.story_id));
  assert.deepEqual(stories.map(story => story.story_id), ['E13-01', 'E13-02', 'E13-03', 'E13-04', 'E13-05']);
  assert.deepEqual(stories.map(story => story.verbatim_requirement), [
    'As an employee, I want to see my roster.',
    'As an employee, I want to navigate weekly/monthly schedules.',
    'As an employee, I want to see working days and off-days.',
    'As an employee, I want to see shift changes.',
    'As an employee, I want to receive notification when my roster changes.',
  ]);
});

test('employee shift roster evidence maps the exact E12-01 through E12-05 source stories', () => {
  const stories = source.stories.filter(story => /^E12-0[1-5]$/.test(story.story_id));
  assert.deepEqual(stories.map(story => story.story_id), ['E12-01', 'E12-02', 'E12-03', 'E12-04', 'E12-05']);
  assert.deepEqual(stories.map(story => story.verbatim_requirement), [
    'As an employee, I want to see my assigned shift.',
    'As an employee, I want to see future shift assignments.',
    'As an employee, I want to see shift start/end time.',
    'As an employee, I want to see shift breaks.',
    'As an employee, I want to see shift-specific attendance rules.',
  ]);
  for (const field of ['assignment_date', 'start_time', 'end_time', 'break_minutes', 'grace_minutes', 'weekly_off_days']) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
  for (const label of ['Shift time', 'Break', 'Grace period', 'Weekly off days']) {
    assert.ok(roster.includes(`'${label}'`), `Roster should expose ${label}.`);
  }
  assert.match(authRunner, /employeeOwnRosterRows\[0\]\.assignment_date === employeeRosterAssignmentDate/);
  assert.match(authRunner, /employeeOwnRosterRows\[0\]\.break_minutes === 60/);
  assert.match(authRunner, /employeeOwnRosterRows\[0\]\.grace_minutes === 10/);
  assert.match(authRunner, /JSON\.stringify\(employeeOwnRosterRows\[0\]\.weekly_off_days\) === '\[0,6\]'/);
  assert.match(browser, /'60 minutes', '10 minutes'/);
  assert.match(browser, /EMPLOYEE_ROSTER_NOTIFICATION_BROWSER_ACCEPTANCE=PASS/);
});

test('employee roster reads enforce active own-tenant identity, bounded dates, and private assignment data', () => {
  assert.match(migration, /private\.hris_get_my_shift_roster\([\s\S]*?SECURITY DEFINER/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /a\.tenant_id=p_tenant_id AND a\.employee_id=v_employee_id/);
  assert.match(migration, /p_end-p_start > 30/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_my_shift_roster\(uuid,date,date\) FROM PUBLIC,anon,service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_shift_roster\(uuid,date,date\) TO authenticated/);
  assert.match(authRunner, /Employees read only their own date-filtered shift roster/);
  assert.match(authRunner, /rosterReadAcl\.anon === false && rosterReadAcl\.authenticated === true && rosterReadAcl\.service_role === false/);
  assert.match(authRunner, /Boolean\(employeeForeignRoster\.error\?\.code === '42501'\)/);
  assert.match(authRunner, /Boolean\(employeeRosterDirectInsert\.error\?\.code === '42501'\)/);
});

test('assignment notifications flow through the employee-owned inbox without changing read-state semantics', () => {
  assert.match(migration, /AFTER INSERT ON public\.employee_shift_assignments/);
  assert.match(migration, /ON CONFLICT \(tenant_id,recipient_employee_id,employee_shift_assignment_id\) DO NOTHING/);
  assert.match(migration, /roster_change_notifications_owner_read/);
  assert.match(migration, /'roster_change'::text AS source/);
  assert.match(migration, /'unread_project_reviews',coalesce\(v_unread_project_reviews,0\)/);
  assert.match(migration, /Only project-review alerts contribute to the existing unread count/);
  assert.match(notifications, /item\.source === 'roster_change'/);
  assert.match(notifications, /onOpenRoster\(item\.roster_assignment_date\)/);
  assert.match(workspace, /page === 'my-roster' && isEmployee && <MyEmployeeRoster/);
  assert.match(workspace, /setRosterFocusDate\(assignmentDate\); navigate\('my-roster'\)/);
  assert.match(roster, /rpc\('hris_get_my_shift_roster'/);
  assert.doesNotMatch(roster, /from\('employee_shift_assignments'\)/);
  assert.match(locale, /'My Roster': 'আমার রোস্টার'/);
  assert.match(locale, /'Roster update': 'রোস্টার হালনাগাদ'/);
  assert.match(browser, /EMPLOYEE_ROSTER_NOTIFICATION_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /directRosterTableRequests\.length/);
});
