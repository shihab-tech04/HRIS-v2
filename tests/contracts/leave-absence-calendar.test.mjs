import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261016105659_hris_tenant_leave_date_filter.sql');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../browser/manager-leave.spec.ts');

test('tenant leave date bounds return requests overlapping the requested interval', () => {
  assert.match(migration, /has_tenant_permission\(p_tenant_id, 'leave\.view'\)[\s\S]+?has_tenant_permission\(p_tenant_id, 'leave\.manage'\)/);
  assert.match(migration, /WHERE r\.tenant_id=p_tenant_id[\s\S]+?\(p_start IS NULL OR r\.to_date>=p_start\)[\s\S]+?\(p_end IS NULL OR r\.from_date<=p_end\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_tenant_leave_data\(uuid,date,date\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_tenant_leave_data\(uuid,date,date\) TO authenticated, service_role/);
});

test('absence calendar loads by active tenant and date range, shows approved leave only, and keeps the queue intact', () => {
  assert.match(workspace, /supabase\.rpc\('hris_get_tenant_leave_data', \{\s*p_tenant_id: requestedTenantId, p_start: bounds\.start, p_end: bounds\.end/);
  assert.match(workspace, /String\(item\.status \|\| ''\)\.toLowerCase\(\) === 'approved'/);
  assert.match(workspace, /Only approved leave requests appear here\. Pending requests remain in the review queue\./);
  assert.match(workspace, /setAbsenceDataTenantId\(requestedTenantId\)/);
  assert.match(workspace, /aria-labelledby="leave-absence-calendar-heading"/);
  assert.match(workspace, /No approved absences on this date\./);
  assert.match(workspace, /people on leave/);
  assert.match(workspace, /loadAbsenceSchedule\(absenceMonth\)/);
});

test('Bengali labels and isolated tenant/date acceptance cover the calendar journey', () => {
  for (const phrase of ['Absence calendar','Previous month','Next month','Current month','Loading absence calendar…',
    'people on leave','Approved absences on','No approved absences on this date.','Organization holidays on',
    'No organization holidays on this date.']) {
    assert.ok(locale.includes(`'${phrase}':`), `missing Bengali translation: ${phrase}`);
  }
  assert.ok(runner.includes('20261016105659_hris_tenant_leave_date_filter.sql'));
  assert.match(runner, /Leave date filters include overlapping dates, honor the upper\/lower bounds, and preserve leave\.view access/);
  assert.match(browser, /Synthetic absence calendar outage/);
  assert.match(browser, /Switch language to Bengali/);
  assert.match(browser, /375/);
  assert.match(browser, /absenceWindows/);
});
