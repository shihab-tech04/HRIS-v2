import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013153500_hris_learning_employee_self_service.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/MyLearning.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../tests/sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../../tests/sql/isolated-auth/run-learning-browser.mjs', import.meta.url), 'utf8');
const decisions = readFileSync(new URL('../../supabase/migrations/20261013095450_hris_learning_manager_decisions.sql', import.meta.url), 'utf8');
const managerUi = readFileSync(new URL('../../src/live/LearningRequests.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');

test('learning catalog and personal enrollment reads use tenant-scoped RLS and explicit permissions', () => {
  for (const table of ['learning_programs', 'learning_sessions', 'learning_enrollments']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id,'learning\.view'\)/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id,'learning\.manage'\)/);
  assert.match(migration, /employee_id=public\.hris_own_employee_for_tenant\(tenant_id\)/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_my_learning_context\(uuid\) FROM PUBLIC, anon/);
  const joinMigration = readFileSync(new URL('../../supabase/migrations/20261013190100_learning_session_join_access.sql', import.meta.url), 'utf8');
  assert.match(joinMigration, /SECURITY INVOKER/);
  assert.match(joinMigration, /e\.employee_id=public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(joinMigration, /e\.status='enrolled'/);
  assert.match(joinMigration, /s\.status='scheduled'/);
  assert.match(joinMigration, /REVOKE ALL ON FUNCTION public\.hris_get_my_learning_join_links\(uuid\) FROM PUBLIC,anon/);
});

test('self-enrollment, approval requests, and cancellation enforce server-side eligibility', () => {
  const enroll = migration.slice(migration.indexOf('FUNCTION public.hris_employee_enroll_learning'), migration.indexOf('FUNCTION public.hris_employee_request_learning'));
  const request = migration.slice(migration.indexOf('FUNCTION public.hris_employee_request_learning'), migration.indexOf('FUNCTION public.hris_employee_cancel_learning'));
  const cancel = migration.slice(migration.indexOf('FUNCTION public.hris_employee_cancel_learning'), migration.indexOf('REVOKE ALL ON FUNCTION public.hris_get_my_learning_context'));
  assert.match(enroll, /v_program\.self_enrollment IS NOT TRUE/);
  assert.match(enroll, /FOR UPDATE/);
  assert.match(enroll, /v_enrolled_count >= v_session\.capacity/);
  assert.match(request, /v_program\.self_enrollment IS NOT FALSE/);
  assert.match(request, /'employee_request','requested',false/);
  assert.match(cancel, /e\.employee_id=v_employee_id/);
  assert.match(cancel, /e\.mandatory IS FALSE AND e\.status IN \('requested','enrolled'\)/);
  for (const fn of ['hris_employee_enroll_learning', 'hris_employee_request_learning', 'hris_employee_cancel_learning']) {
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(`));
  }
});

test('employee learning UI is mounted for linked employees and uses only tenant RPC actions', () => {
  assert.match(workspace, /id: 'my-learning', label: 'My Learning'/);
  assert.match(workspace, /page === 'my-learning' && isEmployee && <MyLearning tenantId=\{tenantId\} \/>/);
  for (const rpc of ['hris_get_my_learning_context', 'hris_get_my_learning_join_links', 'hris_employee_enroll_learning', 'hris_employee_request_learning', 'hris_employee_cancel_learning']) {
    assert.ok(ui.includes(`'${rpc}'`), `learning UI must call ${rpc}`);
  }
  assert.match(ui, /Join online session/);
  assert.match(ui, /noopener noreferrer/);
  assert.match(ui, /Retry/);
  assert.match(ui, /role="alertdialog"/);
  assert.match(ui, /No learning programs match your search/);
  assert.match(ui, /Approval requests pending/);
  assert.doesNotMatch(ui, /\.from\(['"]learning_(?:programs|sessions|enrollments)['"]\)/);
});

test('local Auth integration covers tenant isolation, authorization, persistence, concurrency, and responsive journeys', () => {
  assert.match(runner, /Learning catalog and personal history are scoped to each active employee tenant/);
  assert.match(runner, /Learning session capacity is enforced, including concurrent enrollment attempts/);
  assert.match(runner, /Employees can cancel only their own non-mandatory open learning and requests/);
  assert.match(runner, /run-learning-browser\.mjs/);
  assert.match(browser, /width: 375/);
  assert.match(browser, /width: 1280/);
  assert.match(browser, /blockInitialContext/);
  assert.match(browser, /Refresh learning/);
});

test('manager queue and decisions are tenant-scoped, request-specific, and capacity-safe', () => {
  assert.match(decisions, /has_tenant_permission\(p_tenant_id,'learning\.manage'\)/);
  assert.match(decisions, /e\.tenant_id=p_tenant_id[\s\S]*?e\.source='employee_request'[\s\S]*?e\.status='requested'/);
  assert.match(decisions, /FOR UPDATE/);
  assert.match(decisions, /v_session\.capacity IS NOT NULL AND v_enrolled_count >= v_session\.capacity/);
  assert.match(decisions, /The request remains pending/);
  assert.match(decisions, /REVOKE ALL ON FUNCTION public\.hris_get_learning_requests\(uuid\) FROM PUBLIC,anon/);
  assert.match(decisions, /REVOKE ALL ON FUNCTION public\.hris_resolve_learning_request\(uuid,uuid,text,text\) FROM PUBLIC,anon/);
});

test('manager permission is wired through tenant membership to a responsive decision queue', () => {
  assert.match(app, /'learning\.manage'/);
  assert.match(app, /learningManage: grants\.get\('learning\.manage'\) === true/);
  assert.match(app, /workspacePermissions\.learningManage/);
  assert.match(workspace, /id: 'learning-requests', label: 'Learning requests'/);
  assert.match(workspace, /page === 'learning-requests' && permissions\.learningManage && <LearningRequests tenantId=\{tenantId\} \/>/);
  assert.match(managerUi, /hris_get_learning_requests/);
  assert.match(managerUi, /hris_resolve_learning_request/);
  assert.match(managerUi, /role="alertdialog"/);
  assert.match(managerUi, /role="alert"/);
  assert.doesNotMatch(managerUi, /\.from\(['"]learning_enrollments['"]\)/);
});

test('local Auth suite proves manager denials, one-time decisions, capacity races, and refreshed employee state', () => {
  assert.match(runner, /Learning request queue requires active tenant learning\.manage/);
  assert.match(runner, /ordinary managers, employees, global-only callers, and cross-tenant requests are denied/);
  assert.match(runner, /Learning manager can approve once/);
  assert.match(runner, /Concurrent learning approvals serialize on session capacity/);
  assert.match(browser, /tenant-scoped manager approval/);
  assert.match(browser, /Refresh learning requests/);
  assert.match(browser, /Approved from the manager queue/);
  assert.match(browser, /Learning manager queue mobile/);
  assert.match(browser, /Learning manager queue desktop/);
});
