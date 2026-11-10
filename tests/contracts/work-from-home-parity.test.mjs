import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261110120000_hris_work_from_home_request_parity.sql', import.meta.url), 'utf8');
const employee = readFileSync(new URL('../../src/live/MyServiceRequests.tsx', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../../src/live/ServiceRequestReview.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/service-request-locale.ts', import.meta.url), 'utf8');
const attendanceLocale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-work-from-home-browser.mjs', import.meta.url), 'utf8');
const stories = JSON.parse(readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url), 'utf8'));

test('E10 WFH preserves the canonical employee requirements and captures structured request details', () => {
  const expected = new Map([
    ['E10-01', 'As an employee, I want to request remote work.'],
    ['E10-02', 'As an employee, I want to select one or more dates.'],
    ['E10-03', 'As an employee, I want to provide a reason.'],
    ['E10-04', 'As an employee, I want to specify location if required.'],
    ['E10-05', 'As an employee, I want to submit the request.'],
    ['E10-06', 'As an employee, I want to see approval status.'],
    ['E10-07', 'As an employee, I want to cancel or modify a pending request where allowed.'],
    ['E10-08', 'As an employee, I want approved remote work to appear correctly in attendance.'],
    ['E10-09', 'As an employee, I want to see remote-work history.'],
  ]);
  const actual = new Map(stories.stories.filter(story => expected.has(story.story_id))
    .map(story => [story.story_id, story.verbatim_requirement]));
  assert.deepEqual(actual, expected);
  for (const field of ['fromDate', 'toDate', 'startTime', 'endTime', 'tasksText', 'location']) assert.ok(employee.includes(field));
  assert.match(employee, /hris_submit_my_work_from_home_request/);
  assert.match(employee, /hris_update_my_work_from_home_request/);
  assert.match(employee, /hris_cancel_my_work_from_home_request/);
  assert.match(employee, /request\?\.request_data/);
  assert.match(employee, /requested dates/i);
  assert.match(employee, /validWorkFromHomeDraft/);
});

test('WFH submission and decisions are tenant-scoped, validate payloads, serialize changes, and restrict execute grants', () => {
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /p_end_time<=p_start_time/);
  assert.match(migration, /jsonb_array_length\(p_tasks\)=0/);
  assert.match(migration, /daterange\(\(r\.request_data->>'from_date'\)::date/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /Only your pending Work From Home requests can be edited/);
  assert.match(migration, /Only your pending Work From Home requests can be cancelled/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.employee_submit_remote_work_request/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.employee_update_pending_remote_work_request/);
  assert.match(migration, /PERFORM public\.hris_cancel_my_work_from_home_request\(v_tenant_id,p_id\)/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'employees\.manage'\)/);
  assert.match(migration, /Another approved Work From Home request overlaps these dates/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /hashtextextended\(/);
  assert.match(migration, /p_expected_status IS NULL OR p_next_status IS NULL/);
  assert.match(migration, /previous_status,new_status,note,created_at/);
  assert.match(migration, /INSERT INTO public\.admin_audit_logs/);
  assert.match(migration, /attendance\.work_from_home\.approval_applied/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_submit_my_work_from_home_request\(uuid,date,date,time,time,jsonb,text,text\) FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_resolve_tenant_work_from_home_request\(uuid,uuid,text,text,text\) TO authenticated/);
  for (const signature of [
    'hris_submit_my_work_from_home_request(uuid,date,date,time,time,jsonb,text,text)',
    'hris_update_my_work_from_home_request(uuid,uuid,date,date,time,time,jsonb,text,text)',
    'hris_cancel_my_work_from_home_request(uuid,uuid)',
    'hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text)',
  ]) assert.ok(runner.includes(`public.${signature}`), `Missing isolated runtime grant check for ${signature}`);
});

test('approved WFH dates appear as scheduled attendance without fabricating clock punches', () => {
  assert.match(migration, /'scheduled'::text/);
  assert.match(migration, /NULL::timestamptz,NULL::timestamptz,'home'::text/);
  assert.match(migration, /AND NOT EXISTS \(\s*SELECT 1 FROM public\.attendance_records/);
  assert.match(migration, /CASE WHEN v_approved_wfh THEN 'home' ELSE 'office' END,'employee'/);
  assert.match(migration, /work_mode=CASE WHEN v_approved_wfh AND a\.work_mode='office' THEN 'home' ELSE a\.work_mode END/);
  assert.match(employee, /hris_get_my_service_requests/);
  assert.match(manager, /hris_get_tenant_service_requests/);
  assert.match(manager, /hris_resolve_tenant_work_from_home_request/);
  assert.match(manager, /Approve Work From Home/);
  assert.match(attendanceLocale, /'Scheduled': 'নির্ধারিত'/);
});

test('WFH employee and manager surfaces include Bengali labels and existing recovery patterns', () => {
  for (const phrase of [
    'From date', 'To date', 'Start time', 'End time', 'Task list', 'Work location (optional)',
    'Edit Work From Home request', 'Cancel this pending Work From Home request?',
    'Approve Work From Home', 'The Work From Home request was approved and added to attendance.',
  ]) assert.ok(locale.includes(`'${phrase}'`), `Missing localized WFH copy ${phrase}`);
  assert.match(employee, /role="alert"/);
  assert.match(employee, /role="status"/);
  assert.match(manager, /Refresh before retrying/);
  assert.match(manager, /request\.history/);
  assert.match(workspace, /scheduledTodayWorkFromHome/);
  assert.match(workspace, /const todayRecord = recordedToday \|\| scheduledTodayWorkFromHome/);
  assert.match(workspace, /normalizedStatus === 'scheduled' \? projectText\(locale, 'Scheduled'\)/);
});

test('isolated browser acceptance covers WFH submit, edit, cancel, approve, and scheduled attendance', () => {
  assert.match(runner, /run-work-from-home-browser\.mjs/);
  assert.match(runner, /WORK_FROM_HOME_ACCEPTANCE_ID/);
  assert.match(runner, /browserWorkFromHome\?\.status === 'approved'/);
  assert.match(runner, /browserWorkFromHomeCancelled\?\.status === 'cancelled'/);
  for (const rpc of [
    'hris_submit_my_work_from_home_request', 'hris_update_my_work_from_home_request',
    'hris_cancel_my_work_from_home_request', 'hris_resolve_tenant_work_from_home_request',
    'hris_get_my_attendance_period',
  ]) assert.ok(browser.includes(rpc), `Browser acceptance does not exercise ${rpc}`);
  assert.match(browser, /setViewportSize\(\{ width: 375, height: 812 \}\)/);
  assert.match(browser, /setViewportSize\(\{ width: 1280, height: 900 \}\)/);
  assert.match(browser, /Switch language to Bengali/);
  assert.match(browser, /Switch language to English/);
});
