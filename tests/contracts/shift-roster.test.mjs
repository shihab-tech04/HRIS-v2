import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../browser/shift-roster.spec.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261012111928_hris_tenant_shift_roster_read.sql', import.meta.url), 'utf8');
const assignmentMigration = readFileSync(new URL('../../supabase/migrations/20261012113020_hris_tenant_shift_assignment_manage.sql', import.meta.url), 'utf8');

test('shift roster is exposed only to attendance view or manage memberships', () => {
  assert.match(workspace, /permissions\.attendanceView \|\| permissions\.attendanceManage[\s\S]+?label: 'Roster'/);
  assert.match(workspace, /page === 'shift-roster' && \(permissions\.attendanceView \|\| permissions\.attendanceManage\)/);
  assert.match(workspace, /rpc\('hris_get_tenant_shift_roster_data'/);
  assert.doesNotMatch(workspace, /from\('employee_shift_assignments'\)/);
});

test('roster RPC binds assignments, employees, shifts, and departments to the requested tenant', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id, 'attendance\.view'\)/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id, 'attendance\.manage'\)/);
  assert.match(migration, /a\.tenant_id=p_tenant_id/);
  assert.match(migration, /e\.tenant_id=p_tenant_id/);
  assert.match(migration, /s\.tenant_id=p_tenant_id/);
  assert.match(migration, /d\.tenant_id=p_tenant_id/);
  assert.match(migration, /FROM PUBLIC, anon/);
  assert.match(migration, /TO authenticated, service_role/);
});

test('shift assignment options and writes require attendance.manage, tenant-bind rows, and audit without upsert', () => {
  assert.match(assignmentMigration, /hris_get_tenant_shift_roster_options/);
  assert.match(assignmentMigration, /hris_assign_tenant_employee_shift/);
  assert.match(assignmentMigration, /SET search_path = ''/);
  assert.match(assignmentMigration, /has_tenant_permission\(p_tenant_id, 'attendance\.manage'\)/);
  assert.match(assignmentMigration, /e\.tenant_id=p_tenant_id/);
  assert.match(assignmentMigration, /s\.tenant_id=p_tenant_id/);
  assert.match(assignmentMigration, /INSERT INTO public\.admin_audit_logs/);
  assert.match(assignmentMigration, /shift\.assignment\.created/);
  assert.doesNotMatch(assignmentMigration, /ON CONFLICT/);
  assert.equal((assignmentMigration.match(/FROM PUBLIC, anon/g) || []).length, 2);
  assert.match(workspace, /result\.error\.code === '23505'/);
  assert.match(workspace, /The existing assignment was not changed/);
});

test('roster date and search drafts commit together only after valid Apply filters', () => {
  assert.match(workspace, /const \[draftFrom, setDraftFrom\] = useState\(\(\) => localIsoDate\(new Date\(\)\)\)/);
  assert.match(workspace, /const \[draftTo, setDraftTo\] = useState\(endOfUpcomingWeek\)/);
  assert.match(workspace, /function applyRosterFilters\(\)[\s\S]*?if \(!draftFrom \|\| !draftTo \|\| draftFrom > draftTo\)/);
  assert.match(workspace, /setFrom\(draftFrom\);\s*setTo\(draftTo\);\s*setSubmittedSearch\(search\.trim\(\)\)/);
  assert.match(workspace, /value=\{draftFrom\} onChange=\{event => setDraftFrom/);
  assert.match(workspace, /value=\{draftTo\} onChange=\{event => setDraftTo/);
  assert.match(browser, /callsBeforeDateDraft/);
  assert.match(browser, /p_start: assignmentDate, p_end: assignmentDate, p_search: null/);
});
