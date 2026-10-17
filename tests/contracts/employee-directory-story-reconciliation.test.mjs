import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));
const component = read('../../src/live/OrganizationEmployeeDirectory.tsx');
const directorySql = read('../../supabase/migrations/20261013073243_hris_tenant_employee_directory.sql');
const teamSql = read('../../supabase/migrations/20261017092147_employee_directory_team_filter.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-directory-browser.mjs');
const stories = catalogue.stories.filter(story => ['E37-01', 'E37-02'].includes(story.story_id));

test('E37 source rows are hash-verified and their original requirement text and tracking fields remain unchanged', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  assert.equal(catalogue.story_total, 1047);
  assert.equal(catalogue.module_total, 153);
  assert.deepEqual(stories.map(story => story.story_id), ['E37-01', 'E37-02']);
  assert.equal(stories[0].verbatim_requirement, 'As an employee, I want to search employees.');
  assert.equal(stories[0].source_locator.line, 495);
  assert.equal(stories[1].verbatim_requirement, 'As an employee, I want to filter by department/team/location where allowed.');
  assert.equal(stories[1].source_locator.line, 496);
  for (const story of stories) {
    assert.equal(story.module_id, 'E37');
    assert.equal(story.status, 'NOT TESTED', `${story.story_id} canonical state must not be rewritten`);
    assert.deepEqual(story.test_ids, [], `${story.story_id} canonical evidence fields must remain untouched`);
  }
});

test('E37-01 search maps to the tenant-scoped database query and real browser assertion', () => {
  assert.match(directorySql, /v_search IS NULL OR concat_ws\(' ',e\.full_name,e\.employee_number,d\.name,des\.title,tm\.name,e\.employment_status\)/);
  assert.match(component, /rpc\('hris_get_tenant_employee_directory_v2'/);
  assert.match(browser, /getByLabel\('Search employees'\)\.fill\('Synthetic Employee A'\)/);
  assert.match(browser, /employeeInCurrentLayout\(page, 'Synthetic Employee A'\)/);
  assert.match(runner, /E37-01 employee directory search returns only persisted tenant-authorized matches/);
});

test('E37-02 maps department/team filtering to active-tenant SQL and browser/export evidence; unapproved location data stays unavailable', () => {
  assert.match(teamSql, /p_department_id IS NULL OR e\.department_id=p_department_id/);
  assert.match(teamSql, /p_team_id IS NULL OR \(tm\.id=p_team_id AND tm\.tenant_id=p_tenant_id\)/);
  assert.match(teamSql, /WHERE tm\.tenant_id=p_tenant_id[\s\S]*?e\.tenant_id=p_tenant_id AND e\.team_id=tm\.id/);
  assert.match(component, /Filter employees by team/);
  assert.match(component, /p_team_id: appliedTeamId \|\| null/);
  assert.match(browser, /Synthetic WFH Employee A/);
  assert.match(browser, /teamExportCsv\.includes\('Synthetic WFH Employee A'\)/);
  assert.match(browser, /Refresh employee directory/);
  assert.match(runner, /E37-02 department and team filters stay within the authorized tenant/);
  assert.doesNotMatch(teamSql, /'location'\s*,|'address'\s*,/);
});
