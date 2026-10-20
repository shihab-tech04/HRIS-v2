import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const directorySql = read('../../supabase/migrations/20261017092147_employee_directory_team_filter.sql');
const component = read('../../src/live/OrganizationEmployeeDirectory.tsx');
const browser = read('../sql/isolated-auth/run-employee-directory-browser.mjs');
const runner = read('../sql/isolated-auth/run-local.mjs');
const story = catalogue.stories.find(item => item.story_id === 'HR01-07');

test('HR01-07 partial evidence limits bulk export to the permitted current employee page', () => {
  assert.equal(story?.verbatim_requirement, 'As HR, I want bulk operations where safe and permitted.');
  assert.equal(story?.status, 'NOT TESTED', 'canonical source story fields must remain unchanged');

  assert.match(directorySql, /hris_admin_can_read_tenant\(p_tenant_id, 'employees\.view'\)[\s\S]*?hris_admin_can_read_tenant\(p_tenant_id, 'employees\.manage'\)/);
  assert.match(directorySql, /'employee_number',p\.employee_number[\s\S]*?'employment_status',p\.employment_status/);
  assert.doesNotMatch(directorySql, /'official_email'\s*,|'personal_email'\s*,|'gender'\s*,|'joining_date'\s*,|'address'\s*,/);
  assert.match(component, /const PAGE_SIZE = 50/);
  assert.match(component, /function exportPage\(\)[\s\S]*?employees\.map\(employee => \[employee\.full_name, employee\.employee_number/);
  assert.match(component, /\['Employee', 'Employee number', 'Department', 'Designation', 'Team', 'Employment status'\]/);

  assert.match(browser, /HR01-07_SAFE_BULK_EXPORT_BROWSER_PASS/);
  assert.match(browser, /safeBulkExportLines\.length !== expectedBulkExportEmployees\.length \+ 1/);
  assert.match(browser, /privateBulkExportValues\.some\(value => safeBulkExportCsv\.includes\(value\)\)/);
  assert.match(runner, /record\('HR01-07 partial: current-page employee export contains only permitted tenant rows and fields'/);
  assert.match(runner, /employeeDirectoryBrowserOutput\.includes\('HR01-07_SAFE_BULK_EXPORT_BROWSER_PASS'\)/);
});
