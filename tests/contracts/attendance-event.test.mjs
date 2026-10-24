import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql', import.meta.url), 'utf8');
const correctionMigration = readFileSync(new URL('../../supabase/migrations/20261017074518_hris_employee_attendance_correction_existing_record.sql', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-employee-clock-browser.mjs', import.meta.url), 'utf8');
const dashboardBrowser = readFileSync(new URL('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs', import.meta.url), 'utf8');
const correctionBrowser = readFileSync(new URL('../sql/isolated-auth/run-employee-attendance-correction-browser.mjs', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const catalogue = JSON.parse(readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url), 'utf8'));

test('employee overview submits live check-in/out events and refreshes its own attendance summary', () => {
  assert.match(workspace, /rpc\('hris_employee_record_attendance_event'/);
  assert.match(workspace, /p_tenant_id: tenantId,[\s\S]+?p_event: event/);
  assert.match(workspace, /await load\(false\)/);
  assert.match(workspace, /attendanceActionError && <p role="alert"/);
  assert.match(workspace, /attendanceActionSuccess && <p role="status"/);
});

test('web attendance RPC requires a live linked employee and the active tenant-local date', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path TO 'pg_catalog', 'public', 'auth'/);
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /now\(\) AT TIME ZONE v_timezone/);
});

test('web attendance RPC preserves unrelated fields, rejects duplicate punches, and writes one audit event', () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /ON CONFLICT \(tenant_id,employee_id,attendance_date\) DO NOTHING/);
  assert.match(migration, /You are already checked in today/);
  assert.match(migration, /You are already checked out today/);
  assert.match(migration, /SET check_out=now\(\),updated_at=now\(\)/);
  assert.match(migration, /INSERT INTO public\.admin_audit_logs/);
  assert.match(migration, /attendance\.web_check_in/);
  assert.match(migration, /attendance\.web_check_out/);
  assert.match(migration, /FROM PUBLIC, anon/);
  assert.match(migration, /TO authenticated, service_role/);
});

test('E05-01 through E05-03 are linked to real Auth/Postgres browser evidence with failure recovery and refresh persistence', () => {
  const stories = new Map(catalogue.stories.filter(story => ['E05-01', 'E05-02', 'E05-03'].includes(story.story_id))
    .map(story => [story.story_id, story.verbatim_requirement]));
  assert.equal(stories.get('E05-01'), 'As an employee, I want to check in.');
  assert.equal(stories.get('E05-02'), 'As an employee, I want to check out.');
  assert.equal(stories.get('E05-03'), 'As an employee, I want to see my current attendance status.');
  assert.match(browser, /Synthetic one-time attendance failure/);
  assert.match(browser, /EMPLOYEE_CLOCK_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /assertNoOverflow\(page, '375px employee check-in'/);
  assert.match(browser, /assertNoOverflow\(page, '1280px employee check-out'/);
  assert.match(browser, /page.reload()/);
  for (const id of ['E05-01', 'E05-02', 'E05-03']) {
    assert.match(browser, new RegExp(`${id}_AUTH_POSTGRES_BROWSER_PASS`));
    assert.ok(runtime.includes(`record('${id} `), `${id} must have an isolated runtime acceptance record`);
  }
  assert.match(runtime, /E05 browser clock acceptance removes only its synthetic attendance and audit rows/);
});

test('E05-04 and E05-05 link daily and monthly history to exact persisted employee attendance rows', () => {
  const stories = new Map(catalogue.stories.filter(story => ['E05-04', 'E05-05'].includes(story.story_id))
    .map(story => [story.story_id, story.verbatim_requirement]));
  assert.equal(stories.get('E05-04'), 'As an employee, I want to see daily attendance history.');
  assert.equal(stories.get('E05-05'), 'As an employee, I want to see monthly attendance history.');
  assert.match(dashboardBrowser, /E05-04_DAILY_HISTORY_BROWSER_PASS/);
  assert.match(dashboardBrowser, /E05-05_MONTHLY_HISTORY_BROWSER_PASS/);
  assert.match(dashboardBrowser, /HRIS_LOCAL_ATTENDANCE_PREVIOUS_DATE/);
  assert.match(runtime, /record\('E05-04 employee sees the exact tenant-owned daily attendance history row/);
  assert.match(runtime, /record\('E05-05 employee selects a prior month and sees the persisted monthly attendance history and hours/);
});

test('E06 links attendance correction stories to existing date records, backend decisions, refresh, and EN/BN browser evidence', () => {
  const expected = new Map([
    ['E06-01', 'As an employee, I want to select an attendance record that needs correction.'],
    ['E06-02', 'As an employee, I want to state the correct check-in/check-out information.'],
    ['E06-03', 'As an employee, I want to provide a reason.'],
    ['E06-04', 'As an employee, I want to attach evidence where required.'],
    ['E06-05', 'As an employee, I want to submit the correction.'],
    ['E06-06', 'As an employee, I want to edit or cancel a pending correction where policy permits.'],
    ['E06-07', 'As an employee, I want to see approval status.'],
    ['E06-08', 'As an employee, I want to see rejection reasons.'],
    ['E06-09', 'As an employee, I want the corrected record to update only after the required approval.'],
  ]);
  const actual = new Map(catalogue.stories.filter(story => expected.has(story.story_id))
    .map(story => [story.story_id, story.verbatim_requirement]));
  assert.deepEqual(actual, expected);
  assert.match(workspace, /hris_get_my_attendance_period/);
  assert.match(workspace, /Select an attendance record/);
  assert.match(workspace, /No attendance records are available for this month\./);
  assert.match(workspace, /Unable to load attendance records for correction\. Retry\./);
  assert.match(correctionBrowser, /E06-ATTENDANCE_CORRECTION_BROWSER_ACCEPTANCE=PASS/);
  assert.match(correctionBrowser, /E06-ATTENDANCE_CORRECTION_FORM_BENGALI_BROWSER_PASS/);
  assert.match(correctionBrowser, /another tenant/i);
  for (const id of ['E06-01', 'E06-02', 'E06-03', 'E06-05', 'E06-07', 'E06-08', 'E06-09']) {
    assert.match(correctionBrowser, new RegExp(`${id}_[A-Z0-9_]+_BROWSER_PASS`));
    assert.ok(runtime.includes(`record('${id} `), `${id} must have an isolated runtime story record`);
  }
  assert.match(runtime, /E06-04 partial: no approved rule says when evidence is required/);
  assert.match(runtime, /E06-06 partial: pending edit or cancellation is not implemented/);
  assert.match(runtime, /cleanupAttendanceCorrectionBrowserFixture/);
  assert.match(correctionMigration, /a\.tenant_id=p_tenant_id AND a\.employee_id=v_employee[\s\S]+?a\.attendance_date=v_date[\s\S]+?FOR SHARE/);
  assert.match(correctionMigration, /Attendance record not found for correction\.' USING errcode='P0002'/);
  assert.match(runtime, /E06-01 backend rejects a fabricated attendance date without a persisted employee row/);
});
