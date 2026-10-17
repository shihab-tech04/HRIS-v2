import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const systemWorkspace = readFileSync(new URL('../../src/live/LiveSystemWorkspace.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/ProfileChangeRequests.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261016141000_employee_profile_change_requests.sql', import.meta.url), 'utf8');
const tenantMigration = readFileSync(new URL('../../supabase/migrations/20261017100000_employee_profile_change_request_tenant_scope.sql', import.meta.url), 'utf8');
const schemaCorrection = readFileSync(new URL('../../supabase/migrations/20261017130000_employee_profile_change_schema_contract.sql', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-profile-change-browser.mjs', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../sql/isolated-auth/fixture.sql', import.meta.url), 'utf8');
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
  assert.match(runner, /20261017130000_employee_profile_change_schema_contract\.sql/);
  assert.match(runner, /DELETE FROM public\.employee_profile_change_requests[\s\S]*?reviewed_by IN \(\$\{createdIds\}\)/,
    'disposable teardown must preserve the restrictive reviewer FK while removing only synthetic requests');
  assert.match(runner, /E02-03 employee requests a protected field correction/);
  assert.match(runner, /E02-17 approved profile changes update only the requested field/);
  assert.match(runner, /run-profile-change-browser\.mjs/);
  assert.match(browser, /E02_PROFILE_CHANGE_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /375/);
  assert.match(browser, /1280/);
  assert.match(browser, /Switch language to Bengali/);
  assert.match(browser, /Synthetic transient reviewer queue outage/);
});

test('profile request fields match columns in the existing employee schema', () => {
  const employeeTable = fixture.match(/CREATE TABLE public\.employees \(([\s\S]*?)\n\);/)?.[1] || '';
  const employeeColumns = new Set([...employeeTable.matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s+/gm)].map(match => match[1]));
  const fieldList = ui.match(/const fields = \[([\s\S]*?)\] as const;/)?.[1] || '';
  const requestedFields = [...fieldList.matchAll(/\['([a-z_][a-z0-9_]*)',/g)].map(match => match[1]);
  assert.ok(requestedFields.length > 0, 'the UI must expose a schema-backed list of protected profile fields');
  for (const field of requestedFields) assert.ok(employeeColumns.has(field), `${field} is not an employees column`);
  for (const field of requestedFields) assert.match(schemaCorrection, new RegExp(`'${field}'`));
  assert.match(schemaCorrection, /p_decision = 'approved' AND r\.field_key NOT IN/);
  assert.doesNotMatch(schemaCorrection, /ALTER TABLE public\.employee_profile_change_requests/,
    'the corrective migration must preserve historical request rows and constraints');
  assert.doesNotMatch(schemaCorrection, /father_name|mother_name|birthplace|blood_group|nid_number|passport_number|etin_number/);
});

test('synthetic employee identities are active tenant members without management permissions', () => {
  assert.match(fixture, /\('qa_tenant_employee','Synthetic tenant employee without management permissions'\)/);
  assert.match(fixture, /'11111111-1111-4111-8111-111111111111',id,'qa_tenant_employee','active'[\s\S]*?email='employee-a@hris\.test'/);
  assert.match(fixture, /'22222222-2222-4222-8222-222222222222',id,'qa_tenant_employee','active'[\s\S]*?email='employee-b@hris\.test'/);
  const permissionAssignments = fixture.slice(fixture.indexOf('INSERT INTO public.role_permissions'), fixture.indexOf('INSERT INTO public.admin_users'));
  assert.doesNotMatch(permissionAssignments, /['"]qa_tenant_employee['"]/);
});
