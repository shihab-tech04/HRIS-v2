import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));
const migration = read('../../supabase/migrations/20261017020000_hris_employee_identity_card.sql');
const component = read('../../src/live/EmployeeIdentityCard.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const runner = read('../sql/isolated-auth/run-local.mjs');
const fixture = read('../sql/isolated-auth/fixture.sql');
const browser = read('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs');

test('recovered E04 story source remains verified and unchanged', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  assert.equal(catalogue.story_total, 1047);
  assert.equal(catalogue.module_total, 153);
  const stories = catalogue.stories.filter(story => story.module_id === 'E04');
  assert.deepEqual(stories.map(story => story.story_id), ['E04-01', 'E04-02', 'E04-03', 'E04-04', 'E04-05']);
  assert.equal(stories[1].verbatim_requirement, 'As an employee, I want to access a digital employee card where supported.');
  assert.match(stories[4].verbatim_requirement, /expired or inactive employment status/);
});

test('identity-card RPC is read-only, active-tenant scoped, and limited to the authenticated linked employee', () => {
  assert.match(migration, /SECURITY DEFINER[\s\S]+?SET search_path = ''/);
  assert.match(migration, /IF p_tenant_id IS NULL OR NOT EXISTS \([\s\S]+?t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  assert.doesNotMatch(migration, /JOIN public\.tenant_memberships/);
  assert.match(migration, /t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /'employment_status',e\.employment_status/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_my_employee_identity_card\(uuid\) FROM PUBLIC, anon, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_employee_identity_card\(uuid\) TO authenticated/);
  assert.match(runner, /Employee identity card denies tenant mismatch, cross-tenant identity, manager without employee link, and anonymous access/);
  assert.match(runner, /Inactive employment status is accurately returned by the employee identity-card RPC/);
  assert.match(runner, /identityCardGrantState\.service_role === false/);
  assert.match(fixture, /DROP FUNCTION IF EXISTS public\.hris_get_my_employee_identity_card\(uuid\) CASCADE/);
});

test('employees can open, retry, refresh, and close their translated identity card from the existing profile view', () => {
  assert.match(workspace, /import \{ EmployeeIdentityCard \} from '\.\/EmployeeIdentityCard'/);
  assert.match(workspace, /<EmployeeIdentityCard tenantId=\{tenantId\} tenantName=\{tenantName\} locale=\{locale\} \/>/);
  assert.match(component, /supabase\.rpc\('hris_get_my_employee_identity_card'/);
  assert.match(component, /value\.tenant_id !== requestedTenant/);
  assert.match(component, /role="dialog" aria-modal="true"/);
  assert.match(component, /setRevision\(value => value \+ 1\)/);
  assert.match(component, /identity\.employment_status\.toLowerCase\(\) === 'active'/);
  for (const phrase of ['Digital employee ID', 'View digital employee ID', 'Close employee ID card', 'Unable to load your employee ID card.', 'Inactive']) {
    assert.ok(locale.includes(`'${phrase}':`), `Missing Bengali translation for ${phrase}`);
  }
  assert.match(browser, /Synthetic temporary identity-card outage\./);
  assert.match(browser, /Employee digital ID mobile/);
  assert.match(browser, /Employee digital ID desktop/);
  assert.match(browser, /EMPLOYEE_IDENTITY_CARD_BROWSER_ACCEPTANCE=PASS/);
});

test('E04-01 through E04-04 link exact recovered requirements to isolated browser and database acceptance', () => {
  const expected = new Map([
    ['E04-01', 'As an employee, I want to see my employee ID.'],
    ['E04-02', 'As an employee, I want to access a digital employee card where supported.'],
    ['E04-03', 'As an employee, I want to see my official designation and department.'],
    ['E04-04', 'As an employee, I want the card to reflect active employment information.'],
  ]);
  for (const [id, requirement] of expected) {
    assert.equal(catalogue.stories.find(story => story.story_id === id)?.verbatim_requirement, requirement);
    assert.match(runner, new RegExp(`record\\('${id} `));
  }
  assert.match(browser, /E04-01_EMPLOYEE_NUMBER_BROWSER_PASS/);
  assert.match(browser, /E04-02_DIGITAL_CARD_RECOVERY_BROWSER_PASS/);
  assert.match(browser, /E04-03_DESIGNATION_DEPARTMENT_BROWSER_PASS/);
  assert.match(browser, /E04-04_ACTIVE_EMPLOYMENT_BROWSER_PASS/);
  assert.match(runner, /record\('E04-05 partially verified:/);
});
