import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013073243_hris_tenant_employee_directory.sql', import.meta.url), 'utf8');
const contactMigration = readFileSync(new URL('../../supabase/migrations/20261014171952_employee_contact_details_editing.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/live/OrganizationEmployeeDirectory.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const isolatedRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const contactBrowser = readFileSync(new URL('../sql/isolated-auth/run-employee-directory-browser.mjs', import.meta.url), 'utf8');
const contactRunner = readFileSync(new URL('../sql/isolated-auth/run-employee-contact-editing.mjs', import.meta.url), 'utf8');

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
  assert.match(workspace, /<OrganizationEmployeeDirectory tenantId=\{tenantId\} locale=\{locale\} employeesManage=\{permissions\.employeesManage\} \/>/);
  assert.match(app, /'employees\.view', 'employees\.manage'/);
  assert.match(app, /employees: grants\.get\('employees\.view'\) === true \|\| grants\.get\('employees\.manage'\) === true/);
  assert.match(workspace, /id: 'employees', label: 'Employees'/);
});

test('isolated integration runner executes a local Auth-to-Postgres mobile and desktop directory journey', () => {
  assert.match(isolatedRunner, /run-employee-directory-browser\.mjs/);
  assert.match(isolatedRunner, /Real local Auth-to-Postgres employee directory journey/);
  assert.match(contactBrowser, /retryableTimeout/);
  assert.match(contactRunner, /invalidField\.error\?\.code === '57014'/);
});

test('employee detail sheet preserves permission-limited directory fields and adds manager-only contact editing with keyboard recovery', () => {
  assert.match(page, /selectedEmployee/);
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="employee-record-heading"/);
  assert.match(page, /Escape/);
  assert.match(page, /event\.key !== 'Tab'/);
  assert.match(page, /detailReturnFocusRef\.current\.focus\(\)/);
  assert.match(page, /setSelectedEmployee\(null\)/);
  assert.match(page, /setSelectedEmployee\(null\);[\s\S]*?setLoading\(true\)/);
  assert.match(page, /View details/);
  assert.match(page, /Employee record/);
  assert.doesNotMatch(page, /joining_date|gender|salary|user_id|Save changes|Delete employee/);
  assert.match(page, /employeesManage && <section aria-labelledby="employee-contact-heading"/);
  assert.match(page, /hris_get_tenant_employee_contact_details/);
  assert.match(page, /hris_update_tenant_employee_contact_details/);
  assert.match(page, /These changes update the employee contact record only\. Sign-in email is unchanged\./);
  assert.match(page, /contactError && contactMode !== 'editing'/);
  assert.match(page, /id="contact-form-error" role="alert"/);
  const translations = new Set([...locale.matchAll(/^\s*'([^']+)'\s*:/gm)].map(([, key]) => key));
  const missing = [...page.matchAll(/tx\('([^']+)'\)/g)].map(([, key]) => key).filter(key => !translations.has(key));
  assert.deepEqual(missing, [], 'employee directory strings must have Bengali translations');
  assert.match(locale, /'Employee record': 'কর্মচারীর রেকর্ড'/);
  const browser = readFileSync(new URL('../sql/isolated-auth/run-employee-directory-browser.mjs', import.meta.url), 'utf8');
  assert.match(browser, /getByRole\('dialog'/);
  assert.match(browser, /keyboard\.press\('Escape'\)/);
  assert.match(browser, /Switch language to Bengali/);
});

test('contact RPCs are tenant-scoped, employees.manage-only, field-allowlisted, validated, and audited', () => {
  for (const fn of ['hris_get_tenant_employee_contact_details', 'hris_update_tenant_employee_contact_details']) {
    assert.match(contactMigration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`));
    assert.match(contactMigration, new RegExp(`public\\.${fn}[^;]* FROM PUBLIC,anon,service_role`));
    assert.match(contactMigration, new RegExp(`public\\.${fn}[^;]* TO authenticated`));
  }
  assert.equal((contactMigration.match(/public\.has_tenant_permission\(p_tenant_id, 'employees\.manage'\)/g) || []).length, 2);
  assert.equal((contactMigration.match(/t\.id=p_tenant_id AND t\.is_active IS TRUE/g) || []).length, 2);
  assert.match(contactMigration, /e\.id=p_employee_id AND e\.tenant_id=p_tenant_id/);
  assert.match(contactMigration, /NOT \(item\.key = ANY\(v_allowed_keys\)\)/);
  for (const field of ['official_email','personal_email','phone','official_phone','address','mailing_address',
    'emergency_contact_name','emergency_contact_phone','emergency_contact_relation']) {
    assert.match(contactMigration, new RegExp(`'${field}'`));
  }
  for (const forbiddenField of ['department_id','team_id','designation_id','employment_status','joining_date','salary','payroll','user_id']) {
    assert.doesNotMatch(contactMigration, new RegExp(`'${forbiddenField}'`));
  }
  assert.match(contactMigration, /INSERT INTO public\.admin_audit_logs/);
  assert.match(contactMigration, /employee\.contact_details_updated/);
  assert.match(contactMigration, /changed_fields/);
  assert.match(contactMigration, /jsonb_build_object\('tenant_id',p_tenant_id,'changed_fields',to_jsonb\(v_changed_fields\)\)/);
  assert.match(isolatedRunner, /Employee contact details read only through the active tenant employees\.manage RPC/);
  assert.match(isolatedRunner, /Employee contact save validates input, rejects non-contact keys and duplicate emails/);
  assert.match(isolatedRunner, /Employee contact RPC immediately denies inactive tenant membership/);
  assert.match(isolatedRunner, /DOCKER_CONTEXT: dockerContext/);
  assert.match(isolatedRunner, /DOCKER_HOST: dockerEndpoint/);
  assert.match(contactRunner, /HRIS_SUPABASE_API_URL_OVERRIDE/);
  assert.match(contactRunner, /override\.hostname !== '127\.0\.0\.1'/);
  assert.match(contactRunner, /managerDataKeys/);
  assert.match(isolatedRunner, /HRIS_SUPABASE_SKIP_LOCAL_RESET === '1'/);
  assert.match(isolatedRunner, /tablename <> 'schema_migrations'/);
  assert.match(isolatedRunner, /storage\.buckets/);
  assert.match(isolatedRunner, /storage\.objects/);
  assert.match(isolatedRunner, /cli\(\['db', 'reset', '--local', '--no-seed', '--yes'\]\)/);
  assert.match(isolatedRunner, /employeeDirectUpdate\.error/);
  assert.match(contactBrowser, /HRIS_LOCAL_EMPLOYEE_DIRECTORY_MANAGER_EMAIL/);
  assert.match(contactBrowser, /Contact details updated\./);
  assert.match(contactBrowser, /managerContactReadCalls < 3/);
  assert.match(contactBrowser, /375px mobile\/1280px desktop layouts/);
});
