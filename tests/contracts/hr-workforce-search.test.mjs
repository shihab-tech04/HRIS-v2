import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const directorySql = read('../../supabase/migrations/20261013073243_hris_tenant_employee_directory.sql');
const teamSql = read('../../supabase/migrations/20261017092147_employee_directory_team_filter.sql');
const page = read('../../src/live/OrganizationEmployeeDirectory.tsx');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-directory-browser.mjs');

test('HR01-03 maps the canonical workforce search story to permission-scoped Auth/RLS and browser acceptance', () => {
  const story = catalogue.stories.find(item => item.story_id === 'HR01-03');
  assert.ok(story);
  assert.equal(story.module_id, 'HR01');
  assert.equal(story.role_name, 'HR');
  assert.equal(story.source_locator.line, 870);
  assert.equal(story.verbatim_requirement, 'As HR, I want to search and filter the workforce.');

  assert.ok(directorySql.includes('is_live_session()'));
  assert.ok(teamSql.includes('tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE'));
  assert.ok(teamSql.includes("hris_admin_can_read_tenant(p_tenant_id, 'employees.view')"));
  assert.ok(teamSql.includes('WHERE e.tenant_id=p_tenant_id'));
  assert.ok(page.includes("rpc('hris_get_tenant_employee_directory_v2'"));
  for (const label of ['Search employees', 'Filter employees by department', 'Filter employees by team', 'Filter employees by employment status']) {
    assert.ok(page.includes(label), `Directory UI is missing ${label}.`);
  }

  assert.ok(runner.includes("HRIS_LOCAL_EMPLOYEE_DIRECTORY_EMAIL: emails[12]"));
  assert.ok(runner.includes("'employee-directory-a@hris.test'"));
  assert.ok(runner.includes("record('HR01-03 HR workforce search and department, status, and team filters stay inside the authorized tenant'"));
  assert.ok(runner.includes("employeeDirectoryBrowserOutput.includes('HR01-03_WORKFORCE_SEARCH_FILTER_BROWSER_PASS')"));
  assert.ok(runner.includes("employeeDirectoryCrossTenant.error?.code === '42501'"));
  assert.ok(browser.includes("getByLabel('Search employees').fill('Synthetic Employee A')"));
  assert.ok(browser.includes("getByLabel('Filter employees by department')"));
  assert.ok(browser.includes("getByLabel('Filter employees by team')"));
  assert.ok(browser.includes("getByLabel('Filter employees by employment status')"));
  assert.ok(browser.includes('HR01-03_WORKFORCE_SEARCH_FILTER_BROWSER_PASS'));
});
