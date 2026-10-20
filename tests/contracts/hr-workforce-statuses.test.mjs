import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const sql = read('../../supabase/migrations/20261017092147_employee_directory_team_filter.sql');
const page = read('../../src/live/OrganizationEmployeeDirectory.tsx');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-directory-browser.mjs');

test('HR01-04 exposes every tenant-configured employment status through the authorized directory contract', () => {
  const story = catalogue.stories.find(item => item.story_id === 'HR01-04');
  assert.ok(story);
  assert.equal(story.module_id, 'HR01');
  assert.equal(story.role_name, 'HR');
  assert.equal(story.source_locator.line, 871);
  assert.equal(story.verbatim_requirement,
    'As HR, I want to see active, inactive, probation, notice, exited, and other configured statuses.');

  assert.ok(sql.includes("hris_admin_can_read_tenant(p_tenant_id, 'employees.view')"));
  assert.ok(sql.includes('WHERE e.tenant_id=p_tenant_id'));
  assert.ok(sql.includes('AND (v_status IS NULL OR e.employment_status=v_status)'));
  assert.ok(sql.includes('SELECT DISTINCT e.employment_status FROM public.employees e WHERE e.tenant_id=p_tenant_id'));
  assert.ok(sql.includes("'available_statuses'"));
  assert.ok(page.includes('setStatuses(payload.available_statuses)'));
  assert.ok(page.includes("{statuses.map(value => <option key={value} value={value}>{statusLabel(value, locale)}</option>)}"));
  assert.ok(page.includes("rpc('hris_get_tenant_employee_directory_v2'"));

  assert.ok(runner.includes("record('HR01-04 configured employment statuses are visible, individually filterable, and tenant-scoped'"));
  assert.ok(runner.includes("record('HR01-04 HR sees and filters each configured employment status within the current tenant'"));
  assert.ok(runner.includes("status: 'custom_configured'"));
  assert.ok(runner.includes("JSON.stringify(employeeDirectoryV2TenantB.data.available_statuses) === JSON.stringify(['tenant_b_only'])"));
  assert.ok(runner.includes("!employeeDirectoryTeamOptions.data.available_statuses.includes('tenant_b_only')"));
  assert.ok(browser.includes('HR01-04_EMPLOYMENT_STATUS_VISIBILITY_BROWSER_PASS'));
  for (const value of ['active', 'inactive', 'probation', 'notice', 'exited', 'custom_configured']) {
    assert.ok(browser.includes(`value: '${value}'`), `Browser journey does not filter ${value}.`);
  }
});
