import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013174500_hris_learning_program_management.sql', import.meta.url), 'utf8');
const rosterMigration = readFileSync(new URL('../../supabase/migrations/20261013190000_hris_learning_session_roster.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/LearningProgramAdmin.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-learning-browser.mjs', import.meta.url), 'utf8');

test('learning program and session management is tenant-scoped to active learning.manage membership', () => {
  for (const fn of ['hris_get_learning_admin_catalog', 'hris_save_learning_program', 'hris_save_learning_session']) {
    const start = migration.indexOf(`FUNCTION public.${fn}`);
    assert.notEqual(start, -1, `missing RPC: ${fn}`);
    const definition = migration.slice(start, migration.indexOf('$function$;', migration.indexOf('AS $function$', start)) + 11);
    assert.match(definition, /has_tenant_permission\(p_tenant_id,'learning\.manage'\)/);
  }
  assert.match(migration, /WHERE p\.tenant_id=p_tenant_id AND p\.id=p_program_id/);
  assert.match(migration, /s\.tenant_id=p_tenant_id AND s\.program_id=p_program_id/);
  assert.match(migration, /Capacity cannot be lower than the current enrolled count/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_learning_admin_catalog[\s\S]*?hris_save_learning_program[\s\S]*?FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_learning_admin_catalog[\s\S]*?hris_save_learning_session[\s\S]*?TO authenticated,service_role/);
});

test('learning management reuses tenant navigation and supplies program and scheduled-session forms', () => {
  assert.match(workspace, /id: 'learning-programs', label: 'Learning programs'/);
  assert.match(workspace, /page === 'learning-programs' && permissions\.learningManage && <LearningProgramAdmin tenantId=\{tenantId\} locale=\{locale\} \/>/);
  for (const rpc of ['hris_get_learning_admin_catalog', 'hris_save_learning_program', 'hris_save_learning_session']) {
    assert.ok(ui.includes(`'${rpc}'`), `manager UI must call ${rpc}`);
  }
  assert.match(ui, /Schedule session/);
  assert.match(ui, /Employees may enroll directly/);
  assert.match(ui, /informational/);
  assert.match(ui, /Retry/);
  assert.match(ui, /No learning programs have been created/);
  assert.doesNotMatch(ui, /\.from\(['"]learning_(?:programs|sessions|enrollments)['"]\)/);
});

test('isolated Auth browser journey covers manager publishing, employee catalog visibility, and enrollment', () => {
  assert.match(runner, /hris_get_learning_admin_catalog/);
  assert.match(runner, /Learning program administration is tenant-scoped/);
  assert.match(browser, /tenant-scoped manager approval, program\/session administration, responsive roster retry/);
  assert.match(browser, /Synthetic temporary roster outage/);
  assert.match(browser, /Choose session for/);
  assert.match(browser, /Employee enrollment in newly published learning session mobile/);
});

test('scheduled-session roster RPC is permission-gated, tenant-bound, and exposes only enrolled employee fields', () => {
  const helperStart = rosterMigration.indexOf('FUNCTION private.hris_get_learning_session_roster');
  assert.notEqual(helperStart, -1);
  const helper = rosterMigration.slice(helperStart, rosterMigration.indexOf('$function$;', rosterMigration.indexOf('AS $function$', helperStart)) + 11);
  const wrapperStart = rosterMigration.indexOf('FUNCTION public.hris_get_learning_session_roster');
  const wrapper = rosterMigration.slice(wrapperStart, rosterMigration.indexOf('$function$;', rosterMigration.indexOf('AS $function$', wrapperStart)) + 11);
  assert.match(helper, /SECURITY DEFINER/);
  assert.match(helper, /auth\.uid\(\) IS NULL OR NOT public\.is_live_session\(\)/);
  assert.match(helper, /has_tenant_permission\(p_tenant_id,'learning\.manage'\)/);
  assert.match(helper, /s\.tenant_id=p_tenant_id AND s\.id=p_session_id AND s\.status='scheduled'/);
  assert.match(helper, /e\.tenant_id=p_tenant_id AND e\.session_id=p_session_id AND e\.status='enrolled'/);
  assert.match(helper, /em\.tenant_id=e\.tenant_id AND em\.id=e\.employee_id/);
  assert.match(wrapper, /SECURITY INVOKER/);
  assert.match(wrapper, /private\.hris_get_learning_session_roster/);
  assert.match(rosterMigration, /REVOKE ALL ON FUNCTION private\.hris_get_learning_session_roster\(uuid,uuid\) FROM PUBLIC,anon/);
  assert.match(rosterMigration, /GRANT EXECUTE ON FUNCTION private\.hris_get_learning_session_roster\(uuid,uuid\) TO authenticated/);
  assert.match(rosterMigration, /REVOKE ALL ON FUNCTION public\.hris_get_learning_session_roster\(uuid,uuid\) FROM PUBLIC,anon/);
  assert.match(rosterMigration, /GRANT EXECUTE ON FUNCTION public\.hris_get_learning_session_roster\(uuid,uuid\) TO authenticated/);
  assert.match(runner, /Scheduled learning rosters return only active tenant enrollments/);
  assert.match(ui, /'hris_get_learning_session_roster'/);
  assert.match(ui, /No employees are currently enrolled in this session/);
  assert.match(ui, /Retry roster/);
  assert.match(browser, /View enrolled employees for/);
  assert.match(browser, /Synthetic Employee A/);
  assert.doesNotMatch(ui, /\.from\(['"]learning_(?:programs|sessions|enrollments)['"]\)/);
});
