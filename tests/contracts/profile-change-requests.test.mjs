import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const systemWorkspace = readFileSync(new URL('../../src/live/LiveSystemWorkspace.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/ProfileChangeRequests.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261016141000_employee_profile_change_requests.sql', import.meta.url), 'utf8');
const tenantMigration = readFileSync(new URL('../../supabase/migrations/20261017100000_employee_profile_change_request_tenant_scope.sql', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-profile-change-browser.mjs', import.meta.url), 'utf8');
const matrix = JSON.parse(readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url), 'utf8'));

test('E02-03 and E02-17 retain their exact recovered employee requirements', () => {
  const stories = new Map(matrix.stories.map(story => [story.story_id, story.verbatim_requirement]));
  assert.equal(stories.get('E02-03'), 'As an employee, I want to request changes to protected HR-controlled fields.');
  assert.equal(stories.get('E02-17'), 'As an employee, I want to see the status of profile change requests.');
});

test('employee request UI calls only the safe submit and own-history RPCs', () => {
  assert.match(ui, /supabase\.rpc\('employee_submit_profile_change_request'/);
  assert.match(ui, /supabase\.rpc\('employee_get_my_profile_change_requests'/);
  assert.equal((ui.match(/p_tenant_id: tenantId/g) || []).length, 4,
    'every profile-change RPC must use the active tenant ID');
  assert.doesNotMatch(ui, /from\('employee_profile_change_requests'\)/);
  assert.match(migration, /grant select \([\s\S]*reason, status,[\s\S]*\) on table public\.employee_profile_change_requests to authenticated/i);
  assert.doesNotMatch(tenantMigration.match(/create or replace function public\.employee_get_my_profile_change_requests\(p_tenant_id uuid\)[\s\S]*?\$function\$;/)?.[0] || '', /requested_value/);
});

test('review UI and navigation require active-tenant self_service.manage permission', () => {
  assert.match(app, /'self_service\.manage'/);
  assert.match(workspace, /if \(permissions\.selfServiceManage\) items\.push\(\{ id: 'profile-change-review'/);
  assert.match(workspace, /page === 'profile-change-review' && permissions\.selfServiceManage/);
  assert.match(ui, /supabase\.rpc\('admin_list_profile_change_requests'/);
  assert.match(ui, /supabase\.rpc\('admin_review_profile_change_request'/);
  assert.equal((systemWorkspace.match(/p_tenant_id: tenantId/g) || []).length, 2,
    'the secondary system workspace must also pass its active tenant to both review RPCs');
  assert.match(tenantMigration, /public\.has_tenant_permission\(p_tenant_id, 'self_service\.manage'\)/);
  assert.match(tenantMigration, /public\.hris_profile_change_active_member\(p_tenant_id\)/);
  assert.match(tenantMigration, /DROP FUNCTION IF EXISTS public\.employee_submit_profile_change_request\(text, text, text\)/);
  assert.doesNotMatch(tenantMigration, /synesis_tenant_id\(\)|public\.has_permission\(/);
});

test('profile request migration and synthetic Auth/RLS plus browser journeys run in disposable acceptance', () => {
  assert.match(runner, /20261016141000_employee_profile_change_requests\.sql/);
  assert.match(runner, /20261017100000_employee_profile_change_request_tenant_scope\.sql/);
  assert.match(runner, /E02-03 employee requests a protected field correction/);
  assert.match(runner, /E02-17 approved profile changes update only the requested field/);
  assert.match(runner, /run-profile-change-browser\.mjs/);
  assert.match(browser, /E02_PROFILE_CHANGE_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /375/);
  assert.match(browser, /1280/);
  assert.match(browser, /Switch language to Bengali/);
  assert.match(browser, /Synthetic transient reviewer queue outage/);
});
