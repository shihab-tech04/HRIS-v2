import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013073243_hris_tenant_employee_directory.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/live/OrganizationEmployeeDirectory.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const isolatedRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('employee directory RPC requires an active tenant and membership-scoped employee permission', () => {
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /public\.tenants t WHERE t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /hris_admin_can_read_tenant\(p_tenant_id, 'employees\.view'\)[\s\S]*?hris_admin_can_read_tenant\(p_tenant_id, 'employees\.manage'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_tenant_employee_directory[^;]* FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_tenant_employee_directory[^;]* TO authenticated,service_role/);
  assert.match(isolatedRunner, /Employee directory immediately denies inactive tenant membership/);
  assert.match(isolatedRunner, /Employee directory is tenant-isolated/);
  assert.match(isolatedRunner, /Employee directory rejects no-permission, global-only, recruiter-only, and anonymous access/);
});

test('directory payload is tenant-joined, paginated, searchable, and omits sensitive employee fields', () => {
  assert.match(migration, /WHERE e\.tenant_id=p_tenant_id/);
  assert.match(migration, /d\.id=e\.department_id AND d\.tenant_id=e\.tenant_id/);
  assert.match(migration, /des\.id=e\.designation_id AND des\.tenant_id=e\.tenant_id/);
  assert.match(migration, /tm\.id=e\.team_id AND tm\.tenant_id=e\.tenant_id/);
  assert.match(migration, /LIMIT v_limit OFFSET v_offset/);
  assert.match(migration, /concat_ws\(' ',e\.full_name,e\.employee_number,d\.name,des\.title,tm\.name,e\.employment_status\)/);
  for (const privateField of ['official_email', 'joining_date', 'gender', 'user_id']) {
    assert.doesNotMatch(migration, new RegExp(`'${privateField}'`));
  }
  assert.match(isolatedRunner, /employeeDirectoryPrivateSearch/);
});

test('employee directory UI uses the secured RPC and supports error recovery, filtering, paging, export, and responsive views', () => {
  assert.match(page, /rpc\('hris_get_tenant_employee_directory'/);
  assert.match(page, /p_tenant_id: requestTenant/);
  assert.match(page, /Retry/);
  assert.match(page, /No employees found/);
  assert.match(page, /Filter employees by department/);
  assert.match(page, /Filter employees by employment status/);
  assert.match(page, /Export current page/);
  assert.match(page, /md:hidden/);
  assert.match(page, /md:block/);
  assert.match(workspace, /<OrganizationEmployeeDirectory tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(app, /'employees\.view', 'employees\.manage'/);
  assert.match(app, /employees: grants\.get\('employees\.view'\) === true \|\| grants\.get\('employees\.manage'\) === true/);
  assert.match(workspace, /id: 'employees', label: 'Employees'/);
});

test('isolated integration runner executes a local Auth-to-Postgres mobile and desktop directory journey', () => {
  assert.match(isolatedRunner, /run-employee-directory-browser\.mjs/);
  assert.match(isolatedRunner, /Real local Auth-to-Postgres employee directory journey/);
});

test('read-only employee detail sheet reuses only permission-limited directory fields with keyboard and refresh recovery', () => {
  assert.match(page, /selectedEmployee/);
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="employee-record-heading"/);
  assert.match(page, /Escape/);
  assert.match(page, /event\.key !== 'Tab'/);
  assert.match(page, /detailReturnFocusRef\.current\.focus\(\)/);
  assert.match(page, /setSelectedEmployee\(null\)/);
  assert.match(page, /setSelectedEmployee\(null\);[\s\S]*?setLoading\(true\)/);
  assert.match(page, /View details/);
  assert.match(page, /Employee record/);
  assert.doesNotMatch(page, /official_email|joining_date|gender|salary|user_id|Save changes|Delete employee/);
  const translations = new Set([...locale.matchAll(/^\s*'([^']+)'\s*:/gm)].map(([, key]) => key));
  const missing = [...page.matchAll(/tx\('([^']+)'\)/g)].map(([, key]) => key).filter(key => !translations.has(key));
  assert.deepEqual(missing, [], 'employee directory strings must have Bengali translations');
  assert.match(locale, /'Employee record': 'কর্মচারীর রেকর্ড'/);
  const browser = readFileSync(new URL('../sql/isolated-auth/run-employee-directory-browser.mjs', import.meta.url), 'utf8');
  assert.match(browser, /getByRole\('dialog'/);
  assert.match(browser, /keyboard\.press\('Escape'\)/);
  assert.match(browser, /Switch language to Bengali/);
});
