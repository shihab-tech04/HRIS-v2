import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013174500_hris_learning_program_management.sql', import.meta.url), 'utf8');
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
  assert.match(workspace, /page === 'learning-programs' && permissions\.learningManage && <LearningProgramAdmin tenantId=\{tenantId\} \/>/);
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
  assert.match(browser, /tenant-scoped manager approval and program\/session administration/);
  assert.match(browser, /Choose session for/);
  assert.match(browser, /Employee enrollment in newly published learning session mobile/);
});
